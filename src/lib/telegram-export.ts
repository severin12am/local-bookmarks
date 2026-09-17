import type { NormalizedBookmark } from "./import-parser";
import { extractInstagramLinks } from "./instagram-links";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  return null;
}

export function flattenTelegramText(text: unknown): string {
  if (!text) return "";
  if (typeof text === "string") return text;
  if (Array.isArray(text)) {
    return text
      .map((part) => {
        if (typeof part === "string") return part;
        if (isRecord(part)) return asString(part.text) ?? "";
        return "";
      })
      .join("");
  }
  return "";
}

function isTelegramMessage(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const fromId = asString(value.from_id);
  if (fromId && /^(user|channel|bot)/i.test(fromId)) return true;
  if (value.type === "message" || value.type === "service") return true;
  if (value.date_unixtime != null && (value.from != null || value.text != null)) {
    return true;
  }
  return false;
}

function chatType(value: unknown): string | null {
  return isRecord(value) ? asString(value.type) : null;
}

/** Telegram Desktop chat export (Saved Messages `result.json`), not an X dump. */
export function isTelegramExport(data: unknown): boolean {
  if (Array.isArray(data)) return data.some(isTelegramExport);
  if (!isRecord(data)) return false;
  const type = asString(data.type);
  if (
    type === "saved_messages" ||
    type === "personal_chat" ||
    type === "bot_chat" ||
    type === "private_group" ||
    type === "public_supergroup" ||
    type === "public_channel" ||
    type === "private_channel"
  ) {
    return Array.isArray(data.messages);
  }
  if (asString(data.name) === "Saved Messages" && Array.isArray(data.messages)) {
    return true;
  }
  if (Array.isArray(data.messages) && data.messages.some(isTelegramMessage)) {
    return true;
  }
  if (isRecord(data.chats) && Array.isArray(data.chats.list)) {
    return data.chats.list.some(isTelegramExport);
  }
  return false;
}

/** Root Telegram account export that lists chats but has no message bodies. */
export function isTelegramIndexWithoutMessages(data: unknown): boolean {
  if (!isRecord(data)) return false;
  if (Array.isArray(data.messages) && data.messages.length > 0) return false;
  const about = asString(data.about);
  if (about && /exported data/i.test(about)) return true;
  const list = isRecord(data.chats) && Array.isArray(data.chats.list) ? data.chats.list : null;
  if (!list?.length) return false;
  return list.some(
    (chat) =>
      isRecord(chat) &&
      chatType(chat) === "saved_messages" &&
      !Array.isArray(chat.messages)
  );
}

type TgChat = {
  id: string;
  name: string;
  type: string | null;
  messages: unknown[];
};

function collectChats(data: unknown, into: TgChat[]) {
  if (Array.isArray(data)) {
    for (const item of data) collectChats(item, into);
    return;
  }
  if (!isRecord(data)) return;
  if (Array.isArray(data.messages) && data.messages.some(isTelegramMessage)) {
    into.push({
      id: asString(data.id) || "saved",
      name: asString(data.name) || "Saved Messages",
      type: chatType(data),
      messages: data.messages,
    });
  }
  if (isRecord(data.chats) && Array.isArray(data.chats.list)) {
    for (const chat of data.chats.list) collectChats(chat, into);
  }
}

function unixToIso(value: unknown): string | null {
  const n = typeof value === "number" ? value : Number(asString(value));
  if (!Number.isFinite(n) || n < 1e9) return null;
  const ms = n > 1e12 ? n : n * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function firstHttpUrl(text: string): string | null {
  const m = /https?:\/\/[^\s<>"']+/i.exec(text);
  if (!m) return null;
  return m[0].replace(/[),.;!?]+$/g, "");
}

function stripUrls(text: string): string {
  return text.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "")
    .slice(0, 32) || "telegram";
}

function messageBody(msg: UnknownRecord): string {
  const text = flattenTelegramText(msg.text);
  if (text.trim()) return text;
  const poll = isRecord(msg.poll) ? asString(msg.poll.question) : null;
  if (poll) return `Poll: ${poll}`;
  if (asString(msg.sticker_emoji)) return asString(msg.sticker_emoji) as string;
  if (msg.photo) return "Photo";
  if (asString(msg.file)) {
    const file = asString(msg.file)!;
    return file.split(/[/\\]/).pop() || "File";
  }
  if (msg.media_type) return String(msg.media_type).replace(/_/g, " ");
  return "";
}

export function telegramExportToBookmarks(data: unknown): NormalizedBookmark[] {
  const chats: TgChat[] = [];
  collectChats(data, chats);
  const out: NormalizedBookmark[] = [];
  const seen = new Set<string>();

  for (const chat of chats) {
    const saved = chat.type === "saved_messages" || /saved messages/i.test(chat.name);
    for (const raw of chat.messages) {
      if (!isRecord(raw) || raw.type === "service") continue;
      const body = messageBody(raw);
      if (!body.trim()) continue;

      const ig = extractInstagramLinks(body);
      if (ig.length > 0 && stripUrls(body).length < 8) continue;

      const id = asString(raw.id);
      if (!id) continue;
      const tweetId = saved ? `tg:saved:${id}` : `tg:${chat.id}:${id}`;
      if (seen.has(tweetId)) continue;
      seen.add(tweetId);

      const forwarded = asString(raw.forwarded_from);
      const from = asString(raw.from);
      const authorName = forwarded || from || chat.name || "Telegram";
      const url = firstHttpUrl(body) ?? "";

      out.push({
        tweetId,
        text: body,
        authorName,
        authorUsername: slug(authorName),
        authorAvatarUrl: null,
        tweetCreatedAt: unixToIso(raw.date_unixtime) ?? asString(raw.date),
        url,
        media: [],
        likeCount: 0,
        retweetCount: 0,
        replyCount: 0,
        quoteCount: 0,
        notes: saved
          ? "Imported from Telegram Saved Messages"
          : `Imported from Telegram (${chat.name})`,
        tags: ["telegram"],
        collectionName: "Telegram",
        rawJson: JSON.stringify({ source: "telegram-export", chat: chat.name, ...raw }),
      });
    }
  }

  return out;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>/gi, "$1 ")
    .replace(/<[^>]+>/g, "")
    .replace(/\u00a0/g, " ")
    .trim();
}

function parseTgHtmlDate(value: string | null): string | null {
  if (!value) return null;
  const m = /(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(
    value
  );
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}T${m[4] ?? "00"}:${m[5] ?? "00"}:${m[6] ?? "00"}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString();
}

export function telegramHtmlToBookmarks(raw: string): NormalizedBookmark[] {
  if (!/id="message\d+"/i.test(raw) || !/class="message/i.test(raw)) return [];
  const saved = /saved messages/i.test(raw.slice(0, 8000));
  const starts = [...raw.matchAll(/id="message(\d+)"/gi)];
  const out: NormalizedBookmark[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < starts.length; i++) {
    const id = starts[i]![1]!;
    const from = starts[i]!.index ?? 0;
    const to = i + 1 < starts.length ? (starts[i + 1]!.index ?? raw.length) : raw.length;
    const chunk = raw.slice(from, to);
    if (/class="[^"]*service/i.test(chunk.slice(0, 200))) continue;

    const textMatch = /<div class="text">([\s\S]*?)<\/div>/i.exec(chunk);
    const body = textMatch ? decodeHtml(textMatch[1]!) : "";
    const mediaOnly = /class="photo"|class="video_file"|class="media/i.test(chunk);
    const text = body.trim() || (mediaOnly ? "Media" : "");
    if (!text) continue;

    const ig = extractInstagramLinks(text);
    if (ig.length > 0 && stripUrls(text).length < 8) continue;

    const tweetId = saved ? `tg:saved:${id}` : `tg:html:${id}`;
    if (seen.has(tweetId)) continue;
    seen.add(tweetId);

    const forwarded = /<div class="forwarded body">[\s\S]*?<div class="from_name">\s*([^<]+)/i.exec(
      chunk
    );
    const fromName = /<div class="from_name">\s*([^<]+)/i.exec(chunk);
    const authorName = (forwarded?.[1] || fromName?.[1] || "Telegram").replace(/\s+/g, " ").trim();
    const date = /title="(\d{2}\.\d{2}\.\d{4}[^"]*)"/i.exec(chunk);

    out.push({
      tweetId,
      text,
      authorName,
      authorUsername: slug(authorName),
      authorAvatarUrl: null,
      tweetCreatedAt: parseTgHtmlDate(date?.[1] ?? null),
      url: firstHttpUrl(text) ?? "",
      media: [],
      likeCount: 0,
      retweetCount: 0,
      replyCount: 0,
      quoteCount: 0,
      notes: saved
        ? "Imported from Telegram Saved Messages"
        : "Imported from Telegram HTML export",
      tags: ["telegram"],
      collectionName: "Telegram",
      rawJson: JSON.stringify({ source: "telegram-html", id }),
    });
  }

  return out;
}

const TG_PATH =
  /https?:\/\/(?:t(?:elegram)?\.me|telegram\.dog)\/([^\s<>"']+)/gi;

export function telegramLinksToBookmarks(raw: string): NormalizedBookmark[] {
  const out: NormalizedBookmark[] = [];
  const seen = new Set<string>();
  const re = new RegExp(TG_PATH.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw || ""))) {
    const path = (m[1] || "").replace(/[),.;!?]+$/g, "").replace(/\/$/, "");
    const lower = path.toLowerCase();
    if (
      lower.startsWith("+") ||
      lower.startsWith("joinchat") ||
      lower.startsWith("share") ||
      lower.startsWith("proxy") ||
      lower.startsWith("socks") ||
      lower.startsWith("addstickers") ||
      lower.startsWith("iv?") ||
      lower.startsWith("iv/")
    ) {
      continue;
    }
    const priv = /^c\/(\d+)\/(\d+)/i.exec(path);
    const pub = /^s\/([A-Za-z0-9_]+)\/(\d+)/i.exec(path) || /^([A-Za-z0-9_]+)\/(\d+)/i.exec(path);
    let tweetId: string | null = null;
    let url = `https://t.me/${path.split("?")[0]}`;
    let authorName = "Telegram";
    let authorUsername = "telegram";
    if (priv) {
      tweetId = `tg:c:${priv[1]}:${priv[2]}`;
      url = `https://t.me/c/${priv[1]}/${priv[2]}`;
    } else if (pub) {
      const username = pub[1]!;
      const msgId = pub[2]!;
      tweetId = `tg:u:${username}:${msgId}`;
      url = `https://t.me/${username}/${msgId}`;
      authorName = username;
      authorUsername = username.toLowerCase();
    }
    if (!tweetId || seen.has(tweetId)) continue;
    seen.add(tweetId);
    out.push({
      tweetId,
      text: url,
      authorName,
      authorUsername,
      authorAvatarUrl: null,
      tweetCreatedAt: null,
      url,
      media: [],
      likeCount: 0,
      retweetCount: 0,
      replyCount: 0,
      quoteCount: 0,
      notes: "Imported from a Telegram link",
      tags: ["telegram"],
      collectionName: "Telegram",
      rawJson: JSON.stringify({ source: "telegram-link", url }),
    });
  }
  return out;
}

export function telegramTextBlob(data: unknown): string {
  const chats: TgChat[] = [];
  collectChats(data, chats);
  return chats
    .flatMap((chat) =>
      chat.messages.map((msg) => (isRecord(msg) ? messageBody(msg) : ""))
    )
    .join("\n");
}
