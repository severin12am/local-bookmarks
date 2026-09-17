import fs from "fs";
import path from "path";
import type { NormalizedBookmark } from "./import-parser";
import { extractInstagramLinks } from "./instagram-links";
import { instagramLinksToBookmarks } from "./instagram-import";

type TgStore = {
  token: string;
  username: string | null;
  savedAt: string;
  offset: number;
};

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function storePath() {
  return path.join(process.cwd(), "data", "telegram.json");
}

export function loadTelegramStore(): TgStore | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf8")) as Partial<TgStore>;
    if (!parsed.token) return null;
    return {
      token: parsed.token,
      username: parsed.username ?? null,
      savedAt: parsed.savedAt ?? new Date().toISOString(),
      offset: Number(parsed.offset) || 0,
    };
  } catch {
    return null;
  }
}

function saveStore(store: TgStore) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(store, null, 2), { mode: 0o600 });
}

export function clearTelegramStore() {
  try {
    fs.unlinkSync(storePath());
  } catch {
    // ignore
  }
}

async function telegramApi(token: string, method: string, body?: UnknownRecord) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const data = (await res.json()) as { ok?: boolean; description?: string; result?: unknown };
  if (!data.ok) {
    throw new Error(data.description || `Telegram ${method} failed`);
  }
  return data.result;
}

export async function connectTelegramBot(token: string): Promise<TgStore> {
  const trimmed = token.trim().replace(/^bot/i, "");
  const me = (await telegramApi(trimmed, "getMe")) as UnknownRecord;
  const store: TgStore = {
    token: trimmed,
    username: typeof me.username === "string" ? me.username : null,
    savedAt: new Date().toISOString(),
    offset: 0,
  };
  saveStore(store);
  return store;
}

function firstHttpUrl(text: string): string | null {
  const m = /https?:\/\/[^\s<>"']+/i.exec(text);
  return m ? m[0].replace(/[),.;!?]+$/g, "") : null;
}

function urlsFromEntities(text: string, entities: unknown): string[] {
  if (!Array.isArray(entities) || !text) return [];
  const out: string[] = [];
  for (const entity of entities) {
    if (!isRecord(entity)) continue;
    const offset = Number(entity.offset);
    const length = Number(entity.length);
    if (entity.type === "text_link" && typeof entity.url === "string") {
      out.push(entity.url);
    } else if (entity.type === "url" && Number.isFinite(offset) && Number.isFinite(length)) {
      out.push(Array.from(text).slice(offset, offset + length).join(""));
    }
  }
  return out;
}

function messageText(msg: UnknownRecord): string {
  const text = typeof msg.text === "string" ? msg.text : "";
  const caption = typeof msg.caption === "string" ? msg.caption : "";
  const extra = [
    ...urlsFromEntities(text, msg.entities),
    ...urlsFromEntities(caption, msg.caption_entities),
  ];
  const body = [text, caption, ...extra].filter(Boolean).join("\n");
  if (body.trim()) return body;
  if (Array.isArray(msg.photo)) return "Photo";
  if (isRecord(msg.video)) return "Video";
  if (isRecord(msg.document) && typeof msg.document.file_name === "string") {
    return msg.document.file_name;
  }
  return "";
}

function authorFrom(msg: UnknownRecord): string {
  const origin = isRecord(msg.forward_origin) ? msg.forward_origin : null;
  if (origin) {
    if (isRecord(origin.chat) && typeof origin.chat.title === "string") return origin.chat.title;
    if (isRecord(origin.sender_user) && typeof origin.sender_user.username === "string") {
      return origin.sender_user.username;
    }
    if (typeof origin.sender_user_name === "string") return origin.sender_user_name;
  }
  if (isRecord(msg.forward_from_chat) && typeof msg.forward_from_chat.title === "string") {
    return msg.forward_from_chat.title;
  }
  if (isRecord(msg.forward_from) && typeof msg.forward_from.username === "string") {
    return msg.forward_from.username;
  }
  if (typeof msg.forward_sender_name === "string") return msg.forward_sender_name;
  if (isRecord(msg.from) && typeof msg.from.username === "string") return msg.from.username;
  if (isRecord(msg.from) && typeof msg.from.first_name === "string") return msg.from.first_name;
  return "Telegram";
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 32) || "telegram";
}

function botMessageToBookmark(msg: UnknownRecord): NormalizedBookmark | null {
  if (typeof msg.message_id !== "number") return null;
  const body = messageText(msg);
  if (!body.trim() || body === "/start") return null;
  const ig = extractInstagramLinks(body);
  const stripped = body.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  if (ig.length > 0 && stripped.length < 8) return null;

  const chat = isRecord(msg.chat) ? msg.chat : {};
  const chatId = chat.id ?? "bot";
  const authorName = authorFrom(msg);
  const date =
    typeof msg.date === "number" ? new Date(msg.date * 1000).toISOString() : null;

  return {
    tweetId: `tg:bot:${chatId}:${msg.message_id}`,
    text: body,
    authorName,
    authorUsername: slug(authorName),
    authorAvatarUrl: null,
    tweetCreatedAt: date,
    url: firstHttpUrl(body) ?? "",
    media: [],
    likeCount: 0,
    retweetCount: 0,
    replyCount: 0,
    quoteCount: 0,
    notes: "Forwarded to your Local Bookmarks Telegram bot",
    tags: ["telegram"],
    collectionName: "Telegram",
    rawJson: JSON.stringify({ source: "telegram-bot", ...msg }),
  };
}

export async function pullTelegramUpdates(): Promise<{
  importedBookmarks: NormalizedBookmark[];
  updateCount: number;
}> {
  const store = loadTelegramStore();
  if (!store) return { importedBookmarks: [], updateCount: 0 };

  const updates = (await telegramApi(store.token, "getUpdates", {
    offset: store.offset || undefined,
    timeout: 0,
    allowed_updates: ["message"],
  })) as unknown[];

  if (!Array.isArray(updates) || updates.length === 0) {
    return { importedBookmarks: [], updateCount: 0 };
  }

  const bookmarks: NormalizedBookmark[] = [];
  const texts: string[] = [];
  let maxId = store.offset;

  for (const update of updates) {
    if (!isRecord(update)) continue;
    if (typeof update.update_id === "number") {
      maxId = Math.max(maxId, update.update_id + 1);
    }
    const msg = isRecord(update.message) ? update.message : null;
    if (!msg) continue;
    const converted = botMessageToBookmark(msg);
    if (converted) bookmarks.push(converted);
    const body = messageText(msg);
    if (body) texts.push(body);
  }

  const ig = texts.length ? await instagramLinksToBookmarks(texts.join("\n")) : [];
  saveStore({ ...store, offset: maxId });
  return { importedBookmarks: [...bookmarks, ...ig], updateCount: updates.length };
}
