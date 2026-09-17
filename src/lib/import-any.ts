import type { NormalizedBookmark } from "./import-parser";
import { parseBookmarksJson } from "./import-parser";
import { instagramLinksToBookmarks } from "./instagram-import";
import {
  isTelegramExport,
  isTelegramIndexWithoutMessages,
  telegramExportToBookmarks,
  telegramHtmlToBookmarks,
  telegramLinksToBookmarks,
  telegramTextBlob,
} from "./telegram-export";

export type ParsedImport = {
  source: string;
  bookmarks: NormalizedBookmark[];
  warning?: string;
};

function tryParseJson(raw: string): unknown | undefined {
  const t = raw.trim().replace(/^\uFEFF/, "");
  if (!(t.startsWith("{") || t.startsWith("["))) return undefined;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return undefined;
  }
}

function merge(
  into: Map<string, NormalizedBookmark>,
  items: NormalizedBookmark[]
) {
  for (const item of items) {
    if (!into.has(item.tweetId)) into.set(item.tweetId, item);
  }
}

async function parseChunk(raw: string): Promise<ParsedImport> {
  const json = tryParseJson(raw);
  if (json !== undefined && isTelegramIndexWithoutMessages(json)) {
    return {
      source: "telegram",
      bookmarks: [],
      warning:
        "That file is the Telegram export index, not the chat. Use the Saved Messages folder: chats/chat_XXX/result.json",
    };
  }

  if (json !== undefined && isTelegramExport(json)) {
    const tg = telegramExportToBookmarks(json);
    const ig = await instagramLinksToBookmarks(telegramTextBlob(json));
    return {
      source: [tg.length ? "telegram" : null, ig.length ? "instagram" : null]
        .filter(Boolean)
        .join("+") || "telegram",
      bookmarks: [...tg, ...ig],
    };
  }

  if (json !== undefined) {
    const x = parseBookmarksJson(json);
    if (x.bookmarks.length) {
      return { source: "x", bookmarks: x.bookmarks };
    }
  }

  const tgHtml = telegramHtmlToBookmarks(raw);
  const ig = await instagramLinksToBookmarks(raw);
  const tgLinks = telegramLinksToBookmarks(raw);
  const bookmarks = [...tgHtml, ...ig, ...tgLinks];
  const source = [
    tgHtml.length || tgLinks.length ? "telegram" : null,
    ig.length ? "instagram" : null,
  ]
    .filter(Boolean)
    .join("+");

  return { source: source || "unknown", bookmarks };
}

export async function parseAnyImport(chunks: string[]): Promise<ParsedImport> {
  const into = new Map<string, NormalizedBookmark>();
  const sources = new Set<string>();
  let warning: string | undefined;

  for (const chunk of chunks) {
    if (!chunk?.trim()) continue;
    const part = await parseChunk(chunk);
    if (part.warning && part.bookmarks.length === 0) warning = part.warning;
    merge(into, part.bookmarks);
    if (part.source && part.source !== "unknown" && part.bookmarks.length) {
      for (const s of part.source.split("+")) sources.add(s);
    }
  }

  return {
    source: [...sources].join("+") || "unknown",
    bookmarks: [...into.values()],
    warning,
  };
}
