import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  lte,
  ne,
  notInArray,
  or,
  sql,
  SQL,
} from "drizzle-orm";
import { getDb, getSqlite, schema } from "@/db";
import type {
  Bookmark,
  BookmarkFilters,
  BookmarkMedia,
  Collection,
  ImportResult,
  PaginatedBookmarks,
  Stats,
  Tag,
} from "@/lib/types";
import type { NormalizedBookmark } from "@/lib/import-parser";
import { parseBookmarksJson } from "@/lib/import-parser";

const { bookmarks, tags, bookmarkTags, collections } = schema;

function parseMedia(mediaJson: string): BookmarkMedia[] {
  try {
    const parsed = JSON.parse(mediaJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapBookmark(
  row: typeof bookmarks.$inferSelect,
  tagRows: Tag[] = [],
  collection?: Collection | null
): Bookmark {
  return {
    id: row.id,
    tweetId: row.tweetId,
    text: row.text,
    authorName: row.authorName,
    authorUsername: row.authorUsername,
    authorAvatarUrl: row.authorAvatarUrl,
    tweetCreatedAt: row.tweetCreatedAt,
    url: row.url,
    media: parseMedia(row.mediaJson),
    likeCount: row.likeCount,
    retweetCount: row.retweetCount,
    replyCount: row.replyCount,
    quoteCount: row.quoteCount,
    isFavorite: Boolean(row.isFavorite),
    isRead: Boolean(row.isRead),
    notes: row.notes,
    collectionId: row.collectionId,
    importedAt: row.importedAt,
    tags: tagRows,
    collection: collection ?? null,
  };
}

async function getTagsForBookmarkIds(ids: number[]): Promise<Map<number, Tag[]>> {
  const map = new Map<number, Tag[]>();
  if (ids.length === 0) return map;

  const db = getDb();
  const rows = await db
    .select({
      bookmarkId: bookmarkTags.bookmarkId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
      createdAt: tags.createdAt,
    })
    .from(bookmarkTags)
    .innerJoin(tags, eq(bookmarkTags.tagId, tags.id))
    .where(inArray(bookmarkTags.bookmarkId, ids));

  for (const row of rows) {
    const list = map.get(row.bookmarkId) ?? [];
    list.push({
      id: row.id,
      name: row.name,
      color: row.color,
      createdAt: row.createdAt,
    });
    map.set(row.bookmarkId, list);
  }
  return map;
}

function ftsMatchQuery(q: string): string {
  return q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => {
      const cleaned = term.replace(/["']/g, "");
      if (!cleaned) return "";
      return `"${cleaned}"*`;
    })
    .filter(Boolean)
    .join(" ");
}

/** `empty` means the filter matched nothing (do not query all rows). */
async function bookmarkListWhere(
  filters: BookmarkFilters
): Promise<SQL | undefined | "empty"> {
  const db = getDb();
  const sqlite = getSqlite();
  const conditions: SQL[] = [];

  if (filters.q?.trim()) {
    const match = ftsMatchQuery(filters.q);
    if (match) {
      const ftsRows = sqlite
        .prepare(`SELECT rowid FROM bookmarks_fts WHERE bookmarks_fts MATCH ?`)
        .all(match) as { rowid: number }[];
      const ids = ftsRows.map((r) => r.rowid);
      if (ids.length === 0) return "empty";
      conditions.push(inArray(bookmarks.id, ids));
    }
  }

  if (filters.tagIds?.length) {
    const tagged = await db
      .select({ bookmarkId: bookmarkTags.bookmarkId })
      .from(bookmarkTags)
      .where(inArray(bookmarkTags.tagId, filters.tagIds))
      .groupBy(bookmarkTags.bookmarkId)
      .having(sql`count(distinct ${bookmarkTags.tagId}) = ${filters.tagIds.length}`);

    const ids = tagged.map((t) => t.bookmarkId);
    if (ids.length === 0) return "empty";
    conditions.push(inArray(bookmarks.id, ids));
  }

  if (filters.collectionId === null) {
    conditions.push(sql`${bookmarks.collectionId} IS NULL`);
  } else if (typeof filters.collectionId === "number") {
    conditions.push(eq(bookmarks.collectionId, filters.collectionId));
  } else {
    // Hide archived/expired from the default "All" view
    const expiredRows = await db
      .select({ id: collections.id })
      .from(collections)
      .where(eq(collections.name, "Expired"));
    const expiredIds = expiredRows.map((r) => r.id);
    if (expiredIds.length === 1) {
      conditions.push(
        or(isNull(bookmarks.collectionId), ne(bookmarks.collectionId, expiredIds[0]!))!
      );
    } else if (expiredIds.length > 1) {
      conditions.push(
        or(isNull(bookmarks.collectionId), notInArray(bookmarks.collectionId, expiredIds))!
      );
    }
  }

  if (filters.favorites) conditions.push(eq(bookmarks.isFavorite, true));
  if (filters.unread) conditions.push(eq(bookmarks.isRead, false));
  if (filters.hasMedia) {
    conditions.push(sql`${bookmarks.mediaJson} != '[]' AND ${bookmarks.mediaJson} != ''`);
  }
  if (filters.author?.trim()) {
    const author = `%${filters.author.trim().replace(/^@/, "")}%`;
    conditions.push(
      or(
        like(bookmarks.authorUsername, author),
        like(bookmarks.authorName, author)
      )!
    );
  }
  if (filters.dateFrom) conditions.push(gte(bookmarks.tweetCreatedAt, filters.dateFrom));
  if (filters.dateTo) conditions.push(lte(bookmarks.tweetCreatedAt, filters.dateTo));

  return conditions.length ? and(...conditions) : undefined;
}

export async function listBookmarkIds(
  filters: BookmarkFilters = {}
): Promise<{ ids: number[]; total: number }> {
  const db = getDb();
  const where = await bookmarkListWhere(filters);
  if (where === "empty") return { ids: [], total: 0 };

  const rows = await db.select({ id: bookmarks.id }).from(bookmarks).where(where);
  return { ids: rows.map((r) => r.id), total: rows.length };
}

export async function listBookmarks(
  filters: BookmarkFilters = {}
): Promise<PaginatedBookmarks> {
  const db = getDb();
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? 30));
  const offset = (page - 1) * limit;

  const where = await bookmarkListWhere(filters);
  if (where === "empty") {
    return { items: [], total: 0, page, limit, hasMore: false };
  }

  const orderBy =
    filters.sort === "oldest"
      ? asc(bookmarks.tweetCreatedAt)
      : filters.sort === "author"
        ? asc(bookmarks.authorUsername)
        : desc(bookmarks.tweetCreatedAt);

  const [countRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(bookmarks)
    .where(where);

  const total = Number(countRow?.count ?? 0);

  const rows = await db
    .select()
    .from(bookmarks)
    .where(where)
    .orderBy(orderBy, desc(bookmarks.id))
    .limit(limit)
    .offset(offset);

  const tagMap = await getTagsForBookmarkIds(rows.map((r) => r.id));
  const collectionIds = [
    ...new Set(rows.map((r) => r.collectionId).filter((id): id is number => id != null)),
  ];
  const collectionRows =
    collectionIds.length > 0
      ? await db.select().from(collections).where(inArray(collections.id, collectionIds))
      : [];
  const collectionMap = new Map(
    collectionRows.map((c) => [
      c.id,
      {
        id: c.id,
        name: c.name,
        parentId: c.parentId,
        sortOrder: c.sortOrder,
        createdAt: c.createdAt,
      } satisfies Collection,
    ])
  );

  return {
    items: rows.map((row) =>
      mapBookmark(
        row,
        tagMap.get(row.id) ?? [],
        row.collectionId ? collectionMap.get(row.collectionId) ?? null : null
      )
    ),
    total,
    page,
    limit,
    hasMore: offset + rows.length < total,
  };
}

export async function getBookmark(id: number): Promise<Bookmark | null> {
  const db = getDb();
  const [row] = await db.select().from(bookmarks).where(eq(bookmarks.id, id)).limit(1);
  if (!row) return null;
  const tagMap = await getTagsForBookmarkIds([id]);
  let collection: Collection | null = null;
  if (row.collectionId) {
    const [c] = await db
      .select()
      .from(collections)
      .where(eq(collections.id, row.collectionId))
      .limit(1);
    if (c) {
      collection = {
        id: c.id,
        name: c.name,
        parentId: c.parentId,
        sortOrder: c.sortOrder,
        createdAt: c.createdAt,
      };
    }
  }
  return mapBookmark(row, tagMap.get(id) ?? [], collection);
}

export async function updateBookmark(
  id: number,
  patch: Partial<{
    notes: string | null;
    isFavorite: boolean;
    isRead: boolean;
    collectionId: number | null;
    tagIds: number[];
  }>
): Promise<Bookmark | null> {
  const db = getDb();
  const updates: Partial<typeof bookmarks.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if ("notes" in patch) updates.notes = patch.notes ?? null;
  if ("isFavorite" in patch) updates.isFavorite = patch.isFavorite;
  if ("isRead" in patch) updates.isRead = patch.isRead;
  if ("collectionId" in patch) updates.collectionId = patch.collectionId ?? null;

  if (Object.keys(updates).length > 1) {
    await db.update(bookmarks).set(updates).where(eq(bookmarks.id, id));
  }

  if (patch.tagIds) {
    await db.delete(bookmarkTags).where(eq(bookmarkTags.bookmarkId, id));
    if (patch.tagIds.length) {
      await db.insert(bookmarkTags).values(
        patch.tagIds.map((tagId) => ({ bookmarkId: id, tagId }))
      );
    }
  }

  return getBookmark(id);
}

export async function deleteBookmarks(ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const db = getDb();
  await db.delete(bookmarks).where(inArray(bookmarks.id, ids));
  return ids.length;
}

export async function bulkUpdateBookmarks(input: {
  ids: number[];
  addTagIds?: number[];
  collectionId?: number | null;
  isFavorite?: boolean;
  isRead?: boolean;
  delete?: boolean;
}): Promise<{ affected: number }> {
  const { ids } = input;
  if (!ids.length) return { affected: 0 };

  if (input.delete) {
    await deleteBookmarks(ids);
    return { affected: ids.length };
  }

  const db = getDb();
  const patch: Partial<typeof bookmarks.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };
  if ("collectionId" in input) patch.collectionId = input.collectionId ?? null;
  if ("isFavorite" in input) patch.isFavorite = input.isFavorite;
  if ("isRead" in input) patch.isRead = input.isRead;

  if (Object.keys(patch).length > 1) {
    await db.update(bookmarks).set(patch).where(inArray(bookmarks.id, ids));
  }

  if (input.addTagIds?.length) {
    const values = ids.flatMap((bookmarkId) =>
      input.addTagIds!.map((tagId) => ({ bookmarkId, tagId }))
    );
    for (const value of values) {
      try {
        await db.insert(bookmarkTags).values(value).onConflictDoNothing();
      } catch {
        // ignore duplicates
      }
    }
  }

  return { affected: ids.length };
}

async function ensureTag(name: string, color?: string): Promise<number> {
  const db = getDb();
  const trimmed = name.trim();
  const [existing] = await db
    .select()
    .from(tags)
    .where(eq(tags.name, trimmed))
    .limit(1);
  if (existing) return existing.id;

  const [created] = await db
    .insert(tags)
    .values({ name: trimmed, color: color ?? "#38bdf8" })
    .returning();
  return created.id;
}

async function ensureCollection(name: string, parentId: number | null = null): Promise<number> {
  const db = getDb();
  const trimmed = name.trim();
  const existing = await db
    .select()
    .from(collections)
    .where(
      and(
        eq(collections.name, trimmed),
        parentId == null
          ? sql`${collections.parentId} IS NULL`
          : eq(collections.parentId, parentId)
      )
    )
    .limit(1);
  if (existing[0]) return existing[0].id;

  const [created] = await db
    .insert(collections)
    .values({ name: trimmed, parentId })
    .returning();
  return created.id;
}

export async function importNormalizedBookmarks(
  parsed: NormalizedBookmark[],
  parseSkipped = 0
): Promise<ImportResult> {
  const db = getDb();
  let imported = 0;
  let skipped = parseSkipped;
  let errors = 0;
  const errorMessages: string[] = [];

  const existing = await db.select({ tweetId: bookmarks.tweetId }).from(bookmarks);
  const existingIds = new Set(existing.map((e) => e.tweetId));

  const insertOne = async (item: NormalizedBookmark) => {
    if (existingIds.has(item.tweetId)) {
      skipped += 1;
      return;
    }

    let collectionId: number | null = null;
    if (item.collectionName) {
      collectionId = await ensureCollection(item.collectionName);
    }

    const [created] = await db
      .insert(bookmarks)
      .values({
        tweetId: item.tweetId,
        text: item.text,
        authorName: item.authorName,
        authorUsername: item.authorUsername,
        authorAvatarUrl: item.authorAvatarUrl,
        tweetCreatedAt: item.tweetCreatedAt,
        url: item.url,
        mediaJson: JSON.stringify(item.media),
        likeCount: item.likeCount,
        retweetCount: item.retweetCount,
        replyCount: item.replyCount,
        quoteCount: item.quoteCount,
        notes: item.notes,
        collectionId,
        rawJson: item.rawJson,
      })
      .returning();

    if (item.tags.length) {
      for (const tagName of item.tags) {
        const tagId = await ensureTag(tagName);
        await db
          .insert(bookmarkTags)
          .values({ bookmarkId: created.id, tagId })
          .onConflictDoNothing();
      }
    }

    existingIds.add(item.tweetId);
    imported += 1;
  };

  for (const item of parsed) {
    try {
      await insertOne(item);
    } catch (err) {
      errors += 1;
      errorMessages.push(
        err instanceof Error ? `${item.tweetId}: ${err.message}` : String(err)
      );
    }
  }

  return {
    imported,
    skipped,
    errors,
    total: parsed.length + parseSkipped,
    errorMessages: errorMessages.slice(0, 10),
  };
}

export async function importBookmarks(payload: unknown): Promise<ImportResult> {
  const { bookmarks: parsed, skipped: parseSkipped } = parseBookmarksJson(payload);
  return importNormalizedBookmarks(parsed, parseSkipped);
}

export async function listTags(): Promise<(Tag & { count: number })[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: tags.id,
      name: tags.name,
      color: tags.color,
      createdAt: tags.createdAt,
      count: sql<number>`count(${bookmarkTags.bookmarkId})`,
    })
    .from(tags)
    .leftJoin(bookmarkTags, eq(tags.id, bookmarkTags.tagId))
    .groupBy(tags.id)
    .orderBy(asc(tags.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    color: r.color,
    createdAt: r.createdAt,
    count: Number(r.count ?? 0),
  }));
}

export async function createTag(name: string, color?: string): Promise<Tag> {
  const db = getDb();
  const [created] = await db
    .insert(tags)
    .values({ name: name.trim(), color: color ?? "#38bdf8" })
    .returning();
  return {
    id: created.id,
    name: created.name,
    color: created.color,
    createdAt: created.createdAt,
  };
}

export async function deleteTag(id: number): Promise<void> {
  const db = getDb();
  await db.delete(tags).where(eq(tags.id, id));
}

export async function listCollections(options?: {
  includeExpired?: boolean;
}): Promise<Collection[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: collections.id,
      name: collections.name,
      parentId: collections.parentId,
      sortOrder: collections.sortOrder,
      createdAt: collections.createdAt,
      bookmarkCount: sql<number>`count(${bookmarks.id})`,
    })
    .from(collections)
    .leftJoin(bookmarks, eq(collections.id, bookmarks.collectionId))
    .groupBy(collections.id)
    .orderBy(asc(collections.sortOrder), asc(collections.name));

  return rows
    .filter((r) => options?.includeExpired || r.name !== "Expired")
    .map((r) => ({
      id: r.id,
      name: r.name,
      parentId: r.parentId,
      sortOrder: r.sortOrder,
      createdAt: r.createdAt,
      bookmarkCount: Number(r.bookmarkCount ?? 0),
    }));
}

export async function createCollection(
  name: string,
  parentId: number | null = null
): Promise<Collection> {
  const db = getDb();
  const [created] = await db
    .insert(collections)
    .values({ name: name.trim(), parentId })
    .returning();
  return {
    id: created.id,
    name: created.name,
    parentId: created.parentId,
    sortOrder: created.sortOrder,
    createdAt: created.createdAt,
    bookmarkCount: 0,
  };
}

export async function updateCollection(
  id: number,
  patch: Partial<{ name: string; parentId: number | null; sortOrder: number }>
): Promise<Collection | null> {
  const db = getDb();
  const [updated] = await db
    .update(collections)
    .set(patch)
    .where(eq(collections.id, id))
    .returning();
  if (!updated) return null;
  return {
    id: updated.id,
    name: updated.name,
    parentId: updated.parentId,
    sortOrder: updated.sortOrder,
    createdAt: updated.createdAt,
  };
}

export async function deleteCollection(id: number): Promise<void> {
  const db = getDb();
  await db
    .update(bookmarks)
    .set({ collectionId: null, updatedAt: new Date().toISOString() })
    .where(eq(bookmarks.collectionId, id));
  await db
    .update(collections)
    .set({ parentId: null })
    .where(eq(collections.parentId, id));
  await db.delete(collections).where(eq(collections.id, id));
}

export async function categorizeLibrary(options?: {
  onlyUncategorized?: boolean;
}): Promise<{
  categorized: number;
  skipped: number;
  collections: Record<string, number>;
}> {
  const db = getDb();
  const onlyUncategorized = options?.onlyUncategorized !== false;
  const { matchCategories } = await import("@/lib/categorize");
  const { CATEGORY_RULES } = await import("@/lib/categorize");

  // Ensure all collections exist up front with consistent names
  const collectionIds = new Map<string, number>();
  for (const rule of CATEGORY_RULES) {
    collectionIds.set(rule.name, await ensureCollection(rule.name));
  }
  const miscId = await ensureCollection("Misc");

  const [expiredCollection] = await db
    .select()
    .from(collections)
    .where(eq(collections.name, "Expired"))
    .limit(1);
  const expiredId = expiredCollection?.id;

  const rows = onlyUncategorized
    ? await db
        .select()
        .from(bookmarks)
        .where(sql`${bookmarks.collectionId} IS NULL`)
    : await db.select().from(bookmarks);

  let categorized = 0;
  let skipped = 0;
  const collectionsCount: Record<string, number> = {};

  for (const row of rows) {
    // Never pull archived expired offers back into active categories
    if (expiredId != null && row.collectionId === expiredId) {
      skipped += 1;
      continue;
    }
    if (row.tweetId.startsWith("ig:") || row.tweetId.startsWith("tg:")) {
      skipped += 1;
      continue;
    }

    const match = matchCategories({
      text: row.text,
      authorUsername: row.authorUsername,
      authorName: row.authorName,
    });

    const collectionName = match?.collectionName ?? "Misc";
    const collectionId = collectionIds.get(collectionName) ?? miscId;
    const tagNames = match?.tagNames ?? ["misc"];
    const color =
      match?.color ??
      CATEGORY_RULES.find((r) => r.name === collectionName)?.color ??
      "#a1a1aa";

    await db
      .update(bookmarks)
      .set({
        collectionId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(bookmarks.id, row.id));

    for (const tagName of tagNames) {
      const tagId = await ensureTag(tagName, color);
      await db
        .insert(bookmarkTags)
        .values({ bookmarkId: row.id, tagId })
        .onConflictDoNothing();
    }

    collectionsCount[collectionName] = (collectionsCount[collectionName] ?? 0) + 1;
    if (match) categorized += 1;
    else skipped += 1;
  }

  return { categorized, skipped, collections: collectionsCount };
}

export async function getStats(): Promise<Stats> {
  const db = getDb();
  const [expiredCollection] = await db
    .select({ id: collections.id })
    .from(collections)
    .where(eq(collections.name, "Expired"))
    .limit(1);

  const activeWhere =
    expiredCollection != null
      ? or(isNull(bookmarks.collectionId), ne(bookmarks.collectionId, expiredCollection.id))
      : undefined;

  const [row] = await db
    .select({
      totalBookmarks: sql<number>`count(*)`,
      favorites: sql<number>`sum(case when ${bookmarks.isFavorite} = 1 then 1 else 0 end)`,
      unread: sql<number>`sum(case when ${bookmarks.isRead} = 0 then 1 else 0 end)`,
      withMedia: sql<number>`sum(case when ${bookmarks.mediaJson} != '[]' and ${bookmarks.mediaJson} != '' then 1 else 0 end)`,
      withNotes: sql<number>`sum(case when ${bookmarks.notes} is not null and trim(${bookmarks.notes}) != '' then 1 else 0 end)`,
    })
    .from(bookmarks)
    .where(activeWhere);

  const [tagCount] = await db.select({ count: sql<number>`count(*)` }).from(tags);
  const [collectionCount] = await db
    .select({ count: sql<number>`count(*)` })
    .from(collections)
    .where(ne(collections.name, "Expired"));

  return {
    totalBookmarks: Number(row?.totalBookmarks ?? 0),
    totalTags: Number(tagCount?.count ?? 0),
    totalCollections: Number(collectionCount?.count ?? 0),
    favorites: Number(row?.favorites ?? 0),
    unread: Number(row?.unread ?? 0),
    withMedia: Number(row?.withMedia ?? 0),
    withNotes: Number(row?.withNotes ?? 0),
  };
}

export async function exportLibrary(filters: BookmarkFilters = {}) {
  const all = await listBookmarks({
    ...filters,
    limit: 100000,
    page: 1,
    sort: filters.sort ?? "newest",
  });
  const allTags = await listTags();
  const allCollections = await listCollections();

  return {
    exportedAt: new Date().toISOString(),
    version: 1,
    source: "x-bookmarks-local",
    filter: {
      collectionId: filters.collectionId,
      tagIds: filters.tagIds,
      q: filters.q,
    },
    stats: {
      exportedBookmarks: all.total,
      library: await getStats(),
    },
    tags: allTags,
    collections: allCollections,
    bookmarks: all.items.map((b) => ({
      id: b.tweetId,
      text: b.text,
      author: {
        name: b.authorName,
        username: b.authorUsername,
        avatar: b.authorAvatarUrl,
      },
      created_at: b.tweetCreatedAt,
      url: b.url,
      media: b.media,
      like_count: b.likeCount,
      retweet_count: b.retweetCount,
      reply_count: b.replyCount,
      quote_count: b.quoteCount,
      is_favorite: b.isFavorite,
      is_read: b.isRead,
      notes: b.notes,
      tags: b.tags.map((t) => t.name),
      collection: b.collection?.name ?? null,
      imported_at: b.importedAt,
    })),
  };
}

export function bookmarksToMarkdown(
  data: Awaited<ReturnType<typeof exportLibrary>>,
  title = "Bookmarks export"
): string {
  const lines: string[] = [
    `# ${title}`,
    "",
    `Exported: ${data.exportedAt}`,
    `Count: ${data.bookmarks.length}`,
    "",
    "---",
    "",
  ];

  for (const [i, b] of data.bookmarks.entries()) {
    lines.push(`## ${i + 1}. @${b.author.username || "unknown"} — ${b.author.name || ""}`);
    lines.push("");
    if (b.url) lines.push(`- URL: ${b.url}`);
    if (b.created_at) lines.push(`- Date: ${b.created_at}`);
    if (b.collection) lines.push(`- Collection: ${b.collection}`);
    if (b.tags?.length) lines.push(`- Tags: ${b.tags.join(", ")}`);
    if (b.notes) lines.push(`- Notes: ${b.notes}`);
    lines.push("");
    lines.push(b.text || "(no text)");
    lines.push("");
    if (b.media?.length) {
      lines.push("Media:");
      for (const m of b.media) {
        lines.push(`- ${m.type || "media"}: ${m.url}`);
      }
      lines.push("");
    }
    lines.push("---");
    lines.push("");
  }

  return lines.join("\n");
}
