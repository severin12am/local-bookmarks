import type { BookmarkMedia } from "./types";

export type NormalizedBookmark = {
  tweetId: string;
  text: string;
  authorName: string;
  authorUsername: string;
  authorAvatarUrl: string | null;
  tweetCreatedAt: string | null;
  url: string;
  media: BookmarkMedia[];
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  quoteCount: number;
  notes: string | null;
  tags: string[];
  collectionName: string | null;
  rawJson: string;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return 0;
}

function pickString(obj: UnknownRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    const str = asString(value);
    if (str) return str;
  }
  return null;
}

function pickNumber(obj: UnknownRecord, keys: string[]): number {
  for (const key of keys) {
    if (key in obj) return asNumber(obj[key]);
  }
  return 0;
}

function extractAuthor(item: UnknownRecord) {
  let author: UnknownRecord = {};
  if (isRecord(item.author)) {
    author = item.author;
  } else if (isRecord(item.user)) {
    author = item.user;
  } else if (isRecord(item.core)) {
    const userResults = isRecord(item.core.user_results)
      ? item.core.user_results
      : null;
    if (userResults && isRecord(userResults.result)) {
      author = userResults.result;
    }
  }

  const legacy = isRecord(author.legacy) ? author.legacy : {};
  const authorObj = { ...legacy, ...author };

  const name =
    pickString(item, ["author_name", "authorName", "name", "user_name", "userName"]) ??
    pickString(authorObj, ["name", "display_name", "displayName", "full_name"]) ??
    "";

  const username =
    pickString(item, [
      "author_username",
      "authorUsername",
      "username",
      "screen_name",
      "screenName",
      "handle",
      "user_screen_name",
    ]) ??
    pickString(authorObj, ["username", "screen_name", "screenName", "handle"]) ??
    "";

  const avatar =
    pickString(item, [
      "author_avatar_url",
      "authorAvatarUrl",
      "avatar",
      "profile_image_url",
      "profileImageUrl",
      "profile_image_url_https",
    ]) ??
    pickString(authorObj, [
      "profile_image_url_https",
      "profile_image_url",
      "avatar",
      "profileImageUrl",
      "avatar_url",
    ]);

  return {
    authorName: name || username || "Unknown",
    authorUsername: username.replace(/^@/, ""),
    authorAvatarUrl: avatar,
  };
}

function extractMedia(item: UnknownRecord): BookmarkMedia[] {
  const media: BookmarkMedia[] = [];
  const seen = new Set<string>();

  const push = (url: string | null | undefined, type?: string, previewUrl?: string) => {
    if (!url || seen.has(url)) return;
    seen.add(url);
    media.push({
      url,
      type: type || "photo",
      previewUrl: previewUrl || url,
    });
  };

  const candidates = [
    item.media,
    item.media_urls,
    item.mediaUrls,
    item.images,
    item.photos,
    item.entities && isRecord(item.entities) ? item.entities.media : null,
    item.extended_entities && isRecord(item.extended_entities)
      ? item.extended_entities.media
      : null,
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (typeof candidate === "string") {
      push(candidate);
      continue;
    }

    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        if (typeof entry === "string") {
          push(entry);
        } else if (isRecord(entry)) {
          const url =
            pickString(entry, [
              "url",
              "media_url_https",
              "media_url",
              "mediaUrl",
              "preview_image_url",
              "previewImageUrl",
            ]) ?? null;
          const type = pickString(entry, ["type", "media_type", "mediaType"]) ?? undefined;
          const preview =
            pickString(entry, [
              "preview_image_url",
              "previewImageUrl",
              "media_url_https",
              "media_url",
              "thumbnail",
            ]) ?? undefined;
          push(url, type ?? undefined, preview);
        }
      }
    }
  }

  return media;
}

function extractTags(item: UnknownRecord): string[] {
  const raw = item.tags ?? item.labels ?? item.categories;
  if (!raw) return [];
  if (typeof raw === "string") {
    return raw
      .split(/[,;]/)
      .map((t) => t.trim())
      .filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw
      .map((t) => {
        if (typeof t === "string") return t.trim();
        if (isRecord(t)) return pickString(t, ["name", "label", "tag"]) ?? "";
        return "";
      })
      .filter(Boolean);
  }
  return [];
}

function buildTweetUrl(tweetId: string, username: string): string {
  if (username) return `https://x.com/${username}/status/${tweetId}`;
  return `https://x.com/i/web/status/${tweetId}`;
}

function extractTweetId(item: UnknownRecord): string | null {
  const direct = pickString(item, [
    "tweet_id",
    "tweetId",
    "id_str",
    "id",
    "status_id",
    "statusId",
    "rest_id",
    "restId",
  ]);
  if (direct && /^\d+$/.test(direct)) return direct;

  const url =
    pickString(item, ["url", "tweet_url", "tweetUrl", "permalink", "link"]) ?? "";
  const match = url.match(/status(?:es)?\/(\d+)/);
  if (match?.[1]) return match[1];

  return direct;
}

function normalizeItem(item: unknown): NormalizedBookmark | null {
  if (!isRecord(item)) return null;

  // Nested tweet wrappers used by some exporters
  const nested =
    (isRecord(item.tweet) && item.tweet) ||
    (isRecord(item.status) && item.status) ||
    (isRecord(item.data) && item.data) ||
    item;

  const tweetId = extractTweetId(nested);
  if (!tweetId) return null;

  const { authorName, authorUsername, authorAvatarUrl } = extractAuthor(nested);
  const text =
    pickString(nested, [
      "text",
      "full_text",
      "fullText",
      "content",
      "body",
      "tweet_text",
      "tweetText",
      "legacy_full_text",
    ]) ??
    (isRecord(nested.legacy)
      ? pickString(nested.legacy as UnknownRecord, ["full_text", "text"])
      : null) ??
    "";

  const createdAt =
    pickString(nested, [
      "created_at",
      "createdAt",
      "tweet_created_at",
      "tweetCreatedAt",
      "date",
      "timestamp",
      "time",
    ]) ??
    (isRecord(nested.legacy)
      ? pickString(nested.legacy as UnknownRecord, ["created_at"])
      : null);

  const url =
    pickString(nested, ["url", "tweet_url", "tweetUrl", "permalink", "link"]) ??
    buildTweetUrl(tweetId, authorUsername);

  const notes = pickString(nested, ["notes", "note", "comment", "memo"]);
  const collectionName = pickString(nested, [
    "collection",
    "folder",
    "collection_name",
    "collectionName",
    "folder_name",
    "folderName",
  ]);

  return {
    tweetId,
    text,
    authorName,
    authorUsername,
    authorAvatarUrl,
    tweetCreatedAt: createdAt,
    url,
    media: extractMedia(nested),
    likeCount: pickNumber(nested, [
      "like_count",
      "likeCount",
      "favorite_count",
      "favoriteCount",
      "likes",
      "favorites",
    ]),
    retweetCount: pickNumber(nested, [
      "retweet_count",
      "retweetCount",
      "repost_count",
      "repostCount",
      "retweets",
      "reposts",
    ]),
    replyCount: pickNumber(nested, ["reply_count", "replyCount", "replies"]),
    quoteCount: pickNumber(nested, ["quote_count", "quoteCount", "quotes"]),
    notes,
    tags: extractTags(nested),
    collectionName,
    rawJson: JSON.stringify(item),
  };
}

function extractArray(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;

  if (!isRecord(payload)) return [];

  const keys = [
    "bookmarks",
    "tweets",
    "data",
    "items",
    "entries",
    "results",
    "statuses",
    "liked_tweets",
    "bookmarked_tweets",
  ];

  for (const key of keys) {
    const value = payload[key];
    if (Array.isArray(value)) return value;
  }

  // Single bookmark object
  if (extractTweetId(payload)) return [payload];

  return [];
}

export function parseBookmarksJson(payload: unknown): {
  bookmarks: NormalizedBookmark[];
  skipped: number;
} {
  const items = extractArray(payload);
  const bookmarks: NormalizedBookmark[] = [];
  let skipped = 0;
  const seen = new Set<string>();

  for (const item of items) {
    const normalized = normalizeItem(item);
    if (!normalized) {
      skipped += 1;
      continue;
    }
    if (seen.has(normalized.tweetId)) {
      skipped += 1;
      continue;
    }
    seen.add(normalized.tweetId);
    bookmarks.push(normalized);
  }

  return { bookmarks, skipped };
}
