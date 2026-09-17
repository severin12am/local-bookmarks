import type { NormalizedBookmark } from "@/lib/import-parser";
import type { BookmarkMedia } from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

function isRecord(v: unknown): v is UnknownRecord {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(o: UnknownRecord, k: string): string {
  return typeof o[k] === "string" ? (o[k] as string) : "";
}

function num(o: UnknownRecord, k: string): number {
  return typeof o[k] === "number" ? (o[k] as number) : 0;
}

function extractMedia(legacy: UnknownRecord): BookmarkMedia[] {
  const media: BookmarkMedia[] = [];
  const seen = new Set<string>();

  const entities = isRecord(legacy.extended_entities)
    ? legacy.extended_entities
    : isRecord(legacy.entities)
      ? legacy.entities
      : null;

  const list = entities && Array.isArray(entities.media) ? entities.media : [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const url =
      str(item, "media_url_https") ||
      str(item, "media_url") ||
      str(item, "url");
    if (!url || seen.has(url)) continue;
    seen.add(url);
    media.push({
      url,
      type: str(item, "type") || "photo",
      previewUrl: url,
    });
  }
  return media;
}

function tweetFromResult(result: UnknownRecord): NormalizedBookmark | null {
  const inner = isRecord(result.tweet) ? result.tweet : result;
  // Skip tombstones / unavailable
  if (str(inner, "__typename") === "TweetTombstone") return null;

  const legacy = isRecord(inner.legacy) ? inner.legacy : {};
  const id = str(inner, "rest_id") || str(legacy, "id_str");
  if (!id) return null;

  const userResult = isRecord(inner.core)
    ? isRecord(inner.core.user_results)
      ? isRecord(inner.core.user_results.result)
        ? inner.core.user_results.result
        : {}
      : {}
    : {};

  const userLegacy = isRecord(userResult.legacy) ? userResult.legacy : {};
  const userCore = isRecord(userResult.core) ? userResult.core : {};
  const userAvatar = isRecord(userResult.avatar) ? userResult.avatar : {};

  const username =
    str(userCore, "screen_name") ||
    str(userLegacy, "screen_name") ||
    str(userResult, "screen_name");
  const name =
    str(userCore, "name") ||
    str(userLegacy, "name") ||
    str(userResult, "name") ||
    username ||
    "Unknown";
  const avatar =
    str(userAvatar, "image_url") ||
    str(userLegacy, "profile_image_url_https") ||
    str(userLegacy, "profile_image_url") ||
    null;

  const text = str(legacy, "full_text") || str(legacy, "text") || "";
  const createdAtRaw = str(legacy, "created_at") || null;
  let tweetCreatedAt: string | null = createdAtRaw;
  if (createdAtRaw) {
    const d = new Date(createdAtRaw);
    if (!Number.isNaN(d.getTime())) tweetCreatedAt = d.toISOString();
  }

  return {
    tweetId: id,
    text,
    authorName: name,
    authorUsername: username.replace(/^@/, ""),
    authorAvatarUrl: avatar,
    tweetCreatedAt,
    url: username
      ? `https://x.com/${username}/status/${id}`
      : `https://x.com/i/web/status/${id}`,
    media: extractMedia(legacy),
    likeCount: num(legacy, "favorite_count"),
    retweetCount: num(legacy, "retweet_count"),
    replyCount: num(legacy, "reply_count"),
    quoteCount: num(legacy, "quote_count"),
    notes: null,
    tags: [],
    collectionName: null,
    rawJson: JSON.stringify(inner),
  };
}

function collectTweets(node: unknown, out: NormalizedBookmark[]): void {
  if (Array.isArray(node)) {
    for (const x of node) collectTweets(x, out);
    return;
  }
  if (!isRecord(node)) return;

  if (
    isRecord(node.legacy) &&
    typeof node.legacy.full_text === "string" &&
    (typeof node.rest_id === "string" || typeof node.legacy.id_str === "string")
  ) {
    const parsed = tweetFromResult(node);
    if (parsed) out.push(parsed);
  }

  // Prefer tweet_results.result when present
  if (isRecord(node.tweet_results) && isRecord(node.tweet_results.result)) {
    const parsed = tweetFromResult(node.tweet_results.result);
    if (parsed) out.push(parsed);
  }

  for (const v of Object.values(node)) {
    if (v && typeof v === "object") collectTweets(v, out);
  }
}

export function parseBookmarksResponse(json: unknown): {
  bookmarks: NormalizedBookmark[];
  nextCursor: string | null;
} {
  const collected: NormalizedBookmark[] = [];
  collectTweets(json, collected);

  const seen = new Set<string>();
  const bookmarks: NormalizedBookmark[] = [];
  for (const b of collected) {
    if (seen.has(b.tweetId)) continue;
    seen.add(b.tweetId);
    // Fix invalid dates
    if (b.tweetCreatedAt) {
      const d = new Date(b.tweetCreatedAt);
      b.tweetCreatedAt = Number.isNaN(d.getTime())
        ? b.tweetCreatedAt
        : d.toISOString();
    }
    bookmarks.push(b);
  }

  let nextCursor: string | null = null;
  const walk = (node: unknown) => {
    if (nextCursor) return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x);
      return;
    }
    if (!isRecord(node)) return;

    const entryId = str(node, "entryId");
    if (entryId.startsWith("cursor-bottom") && isRecord(node.content)) {
      const value = str(node.content, "value");
      if (value) nextCursor = value;
      return;
    }
    if (
      str(node, "cursorType") === "Bottom" ||
      str(node, "cursorType") === "ShowMore"
    ) {
      const value = str(node, "value");
      if (value) nextCursor = value;
      return;
    }

    for (const v of Object.values(node)) walk(v);
  };
  walk(json);

  return { bookmarks, nextCursor };
}

export function graphqlError(json: unknown): string | null {
  if (!isRecord(json)) return null;
  const errors = json.errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = isRecord(errors[0]) ? errors[0] : {};
  return str(first, "message") || "X GraphQL error";
}
