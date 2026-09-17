import type {
  Bookmark,
  BookmarkFilters,
  Collection,
  ImportResult,
  PaginatedBookmarks,
  Stats,
  Tag,
} from "./types";

function toQuery(filters: BookmarkFilters): string {
  const params = new URLSearchParams();
  if (filters.q) params.set("q", filters.q);
  if (filters.tagIds?.length) params.set("tagIds", filters.tagIds.join(","));
  if (filters.collectionId === null) params.set("collectionId", "none");
  else if (typeof filters.collectionId === "number") {
    params.set("collectionId", String(filters.collectionId));
  }
  if (filters.favorites) params.set("favorites", "1");
  if (filters.unread) params.set("unread", "1");
  if (filters.hasMedia) params.set("hasMedia", "1");
  if (filters.author) params.set("author", filters.author);
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.sort) params.set("sort", filters.sort);
  if (filters.page) params.set("page", String(filters.page));
  if (filters.limit) params.set("limit", String(filters.limit));
  return params.toString();
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || res.statusText || "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  bookmarks: (filters: BookmarkFilters = {}) =>
    fetch(`/api/bookmarks?${toQuery(filters)}`).then((r) =>
      json<PaginatedBookmarks>(r)
    ),

  bookmarkIds: (filters: BookmarkFilters = {}) =>
    fetch(`/api/bookmarks?${toQuery(filters)}&ids=1`).then((r) =>
      json<{ ids: number[]; total: number }>(r)
    ),

  updateBookmark: (
    id: number,
    patch: Partial<{
      notes: string | null;
      isFavorite: boolean;
      isRead: boolean;
      collectionId: number | null;
      tagIds: number[];
    }>
  ) =>
    fetch(`/api/bookmarks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    }).then((r) => json<Bookmark>(r)),

  deleteBookmark: (id: number) =>
    fetch(`/api/bookmarks/${id}`, { method: "DELETE" }).then((r) => json<{ ok: boolean }>(r)),

  bulk: (body: {
    ids: number[];
    addTagIds?: number[];
    collectionId?: number | null;
    isFavorite?: boolean;
    isRead?: boolean;
    delete?: boolean;
  }) =>
    fetch("/api/bookmarks/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) => json<{ affected: number }>(r)),

  importFile: async (file: File): Promise<ImportResult> => {
    return api.importLibrary({ files: [file] });
  },

  importLibrary: async (input: {
    text?: string;
    files?: File[];
  }): Promise<ImportResult & { found?: number; source?: string }> => {
    const form = new FormData();
    if (input.text?.trim()) form.append("text", input.text);
    for (const file of input.files ?? []) form.append("file", file);
    return fetch("/api/import", { method: "POST", body: form }).then((r) =>
      json<ImportResult & { found?: number; source?: string }>(r)
    );
  },

  telegramStatus: () =>
    fetch("/api/telegram").then((r) =>
      json<{
        connected: boolean;
        mode: "user" | "bot" | null;
        username: string | null;
        firstName: string | null;
        savedAt: string | null;
        pending: "code" | "password" | null;
        codeViaApp?: boolean;
        passwordHint?: string | null;
        hasApi?: boolean;
      }>(r)
    ),

  telegramConnect: (token: string) =>
    fetch("/api/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then((r) =>
      json<{
        connected: boolean;
        mode: "user" | "bot" | null;
        username: string | null;
        savedAt: string | null;
      }>(r)
    ),

  telegramStartLogin: (body: {
    phone: string;
    apiId?: string;
    apiHash?: string;
  }) =>
    fetch("/api/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) =>
      json<{
        connected: boolean;
        pending: "code" | "password" | null;
        codeViaApp?: boolean;
        passwordHint?: string | null;
        hasApi?: boolean;
      }>(r)
    ),

  telegramSubmitCode: (code: string) =>
    fetch("/api/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    }).then((r) =>
      json<
        ImportResult & {
          connected: boolean;
          pending: "code" | "password" | null;
          passwordHint?: string | null;
          username?: string | null;
          found?: number;
          updateCount?: number;
          error?: string;
        }
      >(r)
    ),

  telegramSubmitPassword: (password: string) =>
    fetch("/api/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).then((r) =>
      json<
        ImportResult & {
          connected: boolean;
          username?: string | null;
          found?: number;
          updateCount?: number;
          error?: string;
        }
      >(r)
    ),

  telegramPull: () =>
    fetch("/api/telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pull: true }),
    }).then((r) =>
      json<ImportResult & { found?: number; updateCount?: number }>(r)
    ),

  telegramDisconnect: () =>
    fetch("/api/telegram", { method: "DELETE" }).then((r) =>
      json<{ ok: boolean }>(r)
    ),

  syncStatus: () =>
    fetch("/api/sync/x").then((r) =>
      json<{ connected: boolean; savedAt: string | null }>(r)
    ),

  syncFromX: (body: {
    authToken?: string;
    ct0?: string;
    cookie?: string;
    save?: boolean;
    maxPages?: number;
  }) =>
    fetch("/api/sync/x", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).then((r) =>
      json<ImportResult & { fetched?: number; pages?: number }>(r)
    ),

  clearSyncCredentials: () =>
    fetch("/api/sync/x", { method: "DELETE" }).then((r) =>
      json<{ ok: boolean }>(r)
    ),


  tags: () => fetch("/api/tags").then((r) => json<(Tag & { count: number })[]>(r)),

  createTag: (name: string, color?: string) =>
    fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, color }),
    }).then((r) => json<Tag>(r)),

  deleteTag: (id: number) =>
    fetch(`/api/tags?id=${id}`, { method: "DELETE" }).then((r) =>
      json<{ ok: boolean }>(r)
    ),

  collections: () =>
    fetch("/api/collections").then((r) => json<Collection[]>(r)),

  createCollection: (name: string, parentId?: number | null) =>
    fetch("/api/collections", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, parentId }),
    }).then((r) => json<Collection>(r)),

  deleteCollection: (id: number) =>
    fetch(`/api/collections?id=${id}`, { method: "DELETE" }).then((r) =>
      json<{ ok: boolean }>(r)
    ),

  stats: () => fetch("/api/stats").then((r) => json<Stats>(r)),

  categorize: (onlyUncategorized = true) =>
    fetch("/api/categorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onlyUncategorized }),
    }).then((r) =>
      json<{
        categorized: number;
        skipped: number;
        collections: Record<string, number>;
      }>(r)
    ),
};
