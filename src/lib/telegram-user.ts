import fs from "fs";
import path from "path";
import type { NormalizedBookmark } from "./import-parser";
import { extractInstagramLinks } from "./instagram-links";
import { instagramLinksToBookmarks } from "./instagram-import";

type UserStore = {
  apiId: number;
  apiHash: string;
  session: string;
  username: string | null;
  firstName: string | null;
  savedAt: string;
  lastMessageId: number;
};

export type TelegramLoginNeed = "code" | "password" | null;

export type TelegramUserStatus = {
  connected: boolean;
  username: string | null;
  firstName: string | null;
  savedAt: string | null;
  pending: TelegramLoginNeed;
  codeViaApp: boolean;
  passwordHint: string | null;
  hasApi: boolean;
};

type PendingLogin = {
  client: TelegramClientLike;
  apiId: number;
  apiHash: string;
  phone: string;
  phoneCodeHash: string;
  need: Exclude<TelegramLoginNeed, null>;
  codeViaApp: boolean;
  passwordHint: string | null;
  createdAt: number;
};

type TelegramClientLike = {
  connected: boolean;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendCode: (
    creds: { apiId: number; apiHash: string },
    phone: string
  ) => Promise<{
    phoneCodeHash: string;
    isCodeViaApp?: boolean;
    emailRequired?: boolean;
    emailCodeSent?: boolean;
  }>;
  invoke: (request: unknown) => Promise<unknown>;
  signInWithPassword: (
    creds: { apiId: number; apiHash: string },
    params: {
      password?: (hint?: string) => Promise<string>;
      onError: (err: Error) => Promise<boolean> | void;
    }
  ) => Promise<unknown>;
  getMe: () => Promise<unknown>;
  getMessages: (
    entity: string,
    params?: { limit?: number; minId?: number }
  ) => Promise<unknown[]>;
  checkAuthorization: () => Promise<boolean>;
  logOut: () => Promise<boolean>;
  session: { save: () => unknown };
};

type LooseMessage = {
  id?: number;
  action?: unknown;
  message?: string;
  date?: number;
  entities?: Array<{
    offset?: number;
    length?: number;
    url?: string;
    className?: string;
  }>;
  fwdFrom?: { fromName?: string; postAuthor?: string };
  forward?: {
    sender?: { username?: string; firstName?: string; title?: string };
  };
  postAuthor?: string;
  photo?: unknown;
  video?: unknown;
  sticker?: unknown;
  webPreview?: {
    url?: string;
    title?: string;
    description?: string;
    siteName?: string;
  };
  media?: {
    webpage?: {
      url?: string;
      title?: string;
      description?: string;
      siteName?: string;
    };
  };
  poll?: { poll?: { question?: string | { text?: string } } };
  file?: { name?: string };
};

const PENDING_MS = 10 * 60 * 1000;
const FIRST_PULL = 200;
const NEXT_PULL = 100;

type GramLib = {
  TelegramClient: new (
    session: unknown,
    apiId: number,
    apiHash: string,
    params: Record<string, unknown>
  ) => TelegramClientLike;
  StringSession: new (session?: string) => unknown;
  Api: {
    auth: { SignIn: new (args: Record<string, unknown>) => unknown };
    account: { GetPassword: new () => unknown };
  };
};

let liveClient: TelegramClientLike | null = null;
let pending: PendingLogin | null = null;
let pullBusy = false;
let gram: GramLib | null = null;

function storePath() {
  return path.join(process.cwd(), "data", "telegram-user.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function loadTelegramUserStore(): UserStore | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(storePath(), "utf8")) as Partial<UserStore>;
    const apiId = Number(parsed.apiId);
    if (!Number.isFinite(apiId) || apiId <= 0 || !parsed.apiHash) return null;
    return {
      apiId,
      apiHash: String(parsed.apiHash),
      session: typeof parsed.session === "string" ? parsed.session : "",
      username: parsed.username ?? null,
      firstName: parsed.firstName ?? null,
      savedAt: parsed.savedAt ?? new Date().toISOString(),
      lastMessageId: Number(parsed.lastMessageId) || 0,
    };
  } catch {
    return null;
  }
}

function saveUserStore(store: UserStore) {
  fs.mkdirSync(path.dirname(storePath()), { recursive: true });
  fs.writeFileSync(storePath(), JSON.stringify(store, null, 2), { mode: 0o600 });
}

export function telegramErrorMessage(error: unknown): string {
  const seconds =
    isRecord(error) && typeof error.seconds === "number" ? error.seconds : null;
  const code =
    isRecord(error) && typeof error.errorMessage === "string"
      ? error.errorMessage
      : "";
  if (seconds && (code.includes("FLOOD") || code.includes("WAIT"))) {
    return `Telegram asked to wait ${seconds}s before trying again.`;
  }
  switch (code) {
    case "PHONE_NUMBER_INVALID":
      return "That phone number is not valid. Use international format, like +15551234567.";
    case "PHONE_CODE_INVALID":
      return "That login code is wrong.";
    case "PHONE_CODE_EXPIRED":
      return "That login code expired. Request a new one.";
    case "PHONE_CODE_EMPTY":
      return "Enter the login code from Telegram.";
    case "SESSION_PASSWORD_NEEDED":
      return "This account has a two-step password.";
    case "PASSWORD_HASH_INVALID":
      return "That two-step password is wrong.";
    case "API_ID_INVALID":
      return "API ID or API hash is wrong. Create an app at my.telegram.org.";
    case "API_ID_PUBLISHED_FLOOD":
      return "Those API credentials are temporarily blocked. Wait and try again, or create a new app at my.telegram.org.";
    case "PHONE_NUMBER_BANNED":
      return "Telegram rejected this phone number.";
    case "PHONE_NUMBER_FLOOD":
      return "Too many login attempts for this number. Wait and try later.";
    case "AUTH_KEY_UNREGISTERED":
    case "SESSION_REVOKED":
    case "SESSION_EXPIRED":
      return "Telegram signed this device out. Sign in again.";
    default:
      break;
  }
  if (error instanceof Error && error.message) {
    if (error.message === "AUTH_USER_CANCEL") {
      return "Telegram login was cancelled.";
    }
    return error.message;
  }
  return "Telegram login failed";
}

function normalizePhone(raw: string): string {
  const digits = raw.trim().replace(/[^\d+]/g, "");
  if (!digits) {
    throw new Error("Enter your phone number in international format.");
  }
  return digits.startsWith("+") ? digits : `+${digits}`;
}

function parseApiId(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error("Enter the api_id from my.telegram.org.");
  }
  return Math.floor(n);
}

async function loadGram() {
  if (gram) return gram;
  const mod = await import("teleproto");
  gram = {
    TelegramClient: mod.TelegramClient as unknown as GramLib["TelegramClient"],
    StringSession: mod.sessions.StringSession as unknown as GramLib["StringSession"],
    Api: mod.Api as unknown as GramLib["Api"],
  };
  return gram;
}

function clientParams() {
  return {
    connectionRetries: 5,
    deviceModel: "Local Bookmarks",
    appVersion: "0.1.0",
    floodSleepThreshold: 30,
  };
}

function userFrom(me: unknown): { username: string | null; firstName: string | null } {
  if (!isRecord(me)) return { username: null, firstName: null };
  return {
    username: typeof me.username === "string" ? me.username : null,
    firstName:
      typeof me.firstName === "string"
        ? me.firstName
        : typeof me.first_name === "string"
          ? me.first_name
          : null,
  };
}

function persistFromClient(
  client: TelegramClientLike,
  base: Omit<UserStore, "session">
) {
  const session = client.session.save();
  if (typeof session !== "string" || !session) {
    throw new Error("Telegram did not return a session.");
  }
  const store: UserStore = {
    apiId: base.apiId,
    apiHash: base.apiHash,
    session,
    username: base.username,
    firstName: base.firstName,
    savedAt: base.savedAt,
    lastMessageId: base.lastMessageId,
  };
  saveUserStore(store);
  return store;
}

async function dropPending() {
  if (!pending) return;
  const client = pending.client;
  pending = null;
  if (client !== liveClient) {
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
  }
}

function expirePending() {
  if (pending && Date.now() - pending.createdAt > PENDING_MS) {
    void dropPending();
  }
}

async function makeClient(apiId: number, apiHash: string, session = "") {
  const { TelegramClient, StringSession } = await loadGram();
  const client = new TelegramClient(
    new StringSession(session),
    apiId,
    apiHash,
    clientParams()
  );
  await client.connect();
  return client;
}

async function finishLogin(client: TelegramClientLike, apiId: number, apiHash: string) {
  const me = userFrom(await client.getMe());
  const prev = loadTelegramUserStore();
  persistFromClient(client, {
    apiId,
    apiHash,
    username: me.username,
    firstName: me.firstName,
    savedAt: new Date().toISOString(),
    lastMessageId: prev?.lastMessageId ?? 0,
  });
  pending = null;
  liveClient = client;
}

export function telegramUserStatus(): TelegramUserStatus {
  expirePending();
  const store = loadTelegramUserStore();
  const connected = Boolean(store?.session) && !pending;
  return {
    connected,
    username: store?.username ?? null,
    firstName: store?.firstName ?? null,
    savedAt: connected ? store?.savedAt ?? null : null,
    pending: pending?.need ?? null,
    codeViaApp: pending?.codeViaApp ?? false,
    passwordHint: pending?.passwordHint ?? null,
    hasApi: Boolean(store?.apiId && store?.apiHash),
  };
}

export async function startTelegramLogin(input: {
  phone: string;
  apiId?: unknown;
  apiHash?: string;
}): Promise<TelegramUserStatus> {
  expirePending();
  const saved = loadTelegramUserStore();
  const apiId = parseApiId(input.apiId ?? saved?.apiId);
  const apiHash = (input.apiHash ?? saved?.apiHash ?? "").trim();
  if (!apiHash) {
    throw new Error(
      "Enter the api_hash from my.telegram.org (API development tools)."
    );
  }
  const phone = normalizePhone(input.phone);

  await dropPending();
  if (saved?.session) {
    try {
      const existing = liveClient ?? (await getLiveClient());
      if (existing) await existing.logOut();
    } catch {
      // ignore
    }
    liveClient = null;
  }

  const client = await makeClient(apiId, apiHash);
  try {
    const sent = await client.sendCode({ apiId, apiHash }, phone);
    if (sent.emailRequired || sent.emailCodeSent) {
      try {
        await client.disconnect();
      } catch {
        // ignore
      }
      throw new Error(
        "Telegram asked for email verification on this login. Open the official Telegram app, then try again — or import Desktop result.json."
      );
    }
    pending = {
      client,
      apiId,
      apiHash,
      phone,
      phoneCodeHash: sent.phoneCodeHash,
      need: "code",
      codeViaApp: Boolean(sent.isCodeViaApp),
      passwordHint: null,
      createdAt: Date.now(),
    };
    saveUserStore({
      apiId,
      apiHash,
      session: "",
      username: null,
      firstName: null,
      savedAt: new Date().toISOString(),
      lastMessageId: saved?.lastMessageId ?? 0,
    });
    return telegramUserStatus();
  } catch (error) {
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
    throw new Error(telegramErrorMessage(error));
  }
}

export async function submitTelegramCode(code: string): Promise<TelegramUserStatus> {
  expirePending();
  if (!pending || pending.need !== "code") {
    throw new Error("Request a login code first.");
  }
  const trimmed = code.trim().replace(/\s+/g, "");
  if (!trimmed) throw new Error("Enter the login code from Telegram.");

  const { Api } = await loadGram();
  try {
    const result = await pending.client.invoke(
      new Api.auth.SignIn({
        phoneNumber: pending.phone,
        phoneCodeHash: pending.phoneCodeHash,
        phoneCode: trimmed,
      })
    );
    if (isRecord(result) && result.className === "auth.AuthorizationSignUpRequired") {
      throw new Error("This phone is not registered on Telegram.");
    }
    await finishLogin(pending.client, pending.apiId, pending.apiHash);
    return telegramUserStatus();
  } catch (error) {
    const codeName =
      isRecord(error) && typeof error.errorMessage === "string"
        ? error.errorMessage
        : "";
    if (codeName === "SESSION_PASSWORD_NEEDED") {
      let hint: string | null = null;
      try {
        const pwd = await pending.client.invoke(new Api.account.GetPassword());
        if (isRecord(pwd) && typeof pwd.hint === "string" && pwd.hint) {
          hint = pwd.hint;
        }
      } catch {
        // ignore
      }
      pending = {
        ...pending,
        need: "password",
        passwordHint: hint,
        createdAt: Date.now(),
      };
      return telegramUserStatus();
    }
    throw new Error(telegramErrorMessage(error));
  }
}

export async function submitTelegramPassword(
  password: string
): Promise<TelegramUserStatus> {
  expirePending();
  if (!pending || pending.need !== "password") {
    throw new Error("Enter the login code first, then the two-step password.");
  }
  if (!password) throw new Error("Enter your two-step password.");

  try {
    await pending.client.signInWithPassword(
      { apiId: pending.apiId, apiHash: pending.apiHash },
      {
        password: async () => password,
        onError: (err) => {
          throw err;
        },
      }
    );
    await finishLogin(pending.client, pending.apiId, pending.apiHash);
    return telegramUserStatus();
  } catch (error) {
    throw new Error(telegramErrorMessage(error));
  }
}

async function getLiveClient(): Promise<TelegramClientLike | null> {
  if (liveClient?.connected) return liveClient;
  const store = loadTelegramUserStore();
  if (!store?.session) return null;
  try {
    const client = await makeClient(store.apiId, store.apiHash, store.session);
    const ok = await client.checkAuthorization();
    if (!ok) {
      await client.disconnect();
      saveUserStore({ ...store, session: "", username: null, firstName: null });
      return null;
    }
    persistFromClient(client, store);
    liveClient = client;
    return client;
  } catch (error) {
    const codeName =
      isRecord(error) && typeof error.errorMessage === "string"
        ? error.errorMessage
        : "";
    if (
      codeName === "AUTH_KEY_UNREGISTERED" ||
      codeName === "SESSION_REVOKED" ||
      codeName === "SESSION_EXPIRED"
    ) {
      saveUserStore({ ...store, session: "", username: null, firstName: null });
      liveClient = null;
      throw new Error(telegramErrorMessage(error));
    }
    throw new Error(telegramErrorMessage(error));
  }
}

export async function disconnectTelegramUser(revoke = true) {
  await dropPending();
  const store = loadTelegramUserStore();
  const client = liveClient;
  liveClient = null;
  if (client && revoke) {
    try {
      await client.logOut();
    } catch {
      try {
        await client.disconnect();
      } catch {
        // ignore
      }
    }
  } else if (client) {
    try {
      await client.disconnect();
    } catch {
      // ignore
    }
  }
  if (store) {
    saveUserStore({
      ...store,
      session: "",
      username: null,
      firstName: null,
      lastMessageId: 0,
      savedAt: new Date().toISOString(),
    });
  }
}

function firstHttpUrl(text: string): string | null {
  const m = /https?:\/\/[^\s<>"']+/i.exec(text);
  return m ? m[0].replace(/[),.;!?]+$/g, "") : null;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, "").slice(0, 32) || "telegram";
}

function entityUrls(text: string, entities: LooseMessage["entities"]): string[] {
  if (!entities?.length || !text) return [];
  const out: string[] = [];
  for (const entity of entities) {
    if (typeof entity.url === "string" && entity.url) {
      out.push(entity.url);
      continue;
    }
    const name = entity.className ?? "";
    const offset = Number(entity.offset);
    const length = Number(entity.length);
    if (
      Number.isFinite(offset) &&
      Number.isFinite(length) &&
      /url/i.test(name)
    ) {
      out.push(text.substring(offset, offset + length));
    }
  }
  return out;
}

function webInfo(msg: LooseMessage) {
  const preview = msg.webPreview ?? msg.media?.webpage;
  if (!preview) return { url: null, title: null, description: null };
  return {
    url: typeof preview.url === "string" ? preview.url : null,
    title: typeof preview.title === "string" ? preview.title : null,
    description:
      typeof preview.description === "string" ? preview.description : null,
  };
}

function authorFromMessage(msg: LooseMessage): string {
  if (msg.fwdFrom?.fromName) return msg.fwdFrom.fromName;
  if (msg.fwdFrom?.postAuthor) return msg.fwdFrom.postAuthor;
  const sender = msg.forward?.sender;
  if (sender?.title) return sender.title;
  if (sender?.username) return sender.username;
  if (sender?.firstName) return sender.firstName;
  if (msg.postAuthor) return msg.postAuthor;
  return "Saved Messages";
}

function pollQuestion(msg: LooseMessage): string | null {
  const q = msg.poll?.poll?.question;
  if (typeof q === "string" && q.trim()) return q;
  if (isRecord(q) && typeof q.text === "string") return q.text;
  return null;
}

function messageToBookmark(msg: LooseMessage): NormalizedBookmark | null {
  if (typeof msg.id !== "number") return null;
  if (msg.action) return null;

  const text = typeof msg.message === "string" ? msg.message : "";
  const web = webInfo(msg);
  const urls = [
    ...entityUrls(text, msg.entities),
    web.url,
    firstHttpUrl(text),
  ].filter((item): item is string => Boolean(item));

  let body = [text, web.title, web.description, ...urls]
    .filter(Boolean)
    .join("\n");
  if (!body.trim()) {
    if (pollQuestion(msg)) body = `Poll: ${pollQuestion(msg)}`;
    else if (msg.photo) body = "Photo";
    else if (msg.video) body = "Video";
    else if (msg.sticker) body = "Sticker";
    else if (msg.file?.name) body = msg.file.name;
  }
  if (!body.trim()) return null;

  const ig = extractInstagramLinks(body);
  const stripped = body.replace(/https?:\/\/\S+/gi, "").replace(/\s+/g, " ").trim();
  if (ig.length > 0 && stripped.length < 8) return null;

  const authorName = authorFromMessage(msg);
  const date =
    typeof msg.date === "number" ? new Date(msg.date * 1000).toISOString() : null;

  return {
    tweetId: `tg:saved:${msg.id}`,
    text: body,
    authorName,
    authorUsername: slug(authorName),
    authorAvatarUrl: null,
    tweetCreatedAt: date,
    url: urls[0] ?? firstHttpUrl(body) ?? "",
    media: [],
    likeCount: 0,
    retweetCount: 0,
    replyCount: 0,
    quoteCount: 0,
    notes: "Synced from Telegram Saved Messages",
    tags: ["telegram"],
    collectionName: "Telegram",
    rawJson: JSON.stringify({
      source: "telegram-saved",
      id: msg.id,
      date: msg.date,
    }),
  };
}

export async function pullSavedMessages(): Promise<{
  importedBookmarks: NormalizedBookmark[];
  updateCount: number;
}> {
  if (pullBusy) return { importedBookmarks: [], updateCount: 0 };
  const store = loadTelegramUserStore();
  if (!store?.session) return { importedBookmarks: [], updateCount: 0 };

  pullBusy = true;
  try {
    const client = await getLiveClient();
    if (!client) return { importedBookmarks: [], updateCount: 0 };

    const minId = store.lastMessageId > 0 ? store.lastMessageId : undefined;
    const messages = await client.getMessages("me", {
      limit: minId ? NEXT_PULL : FIRST_PULL,
      minId,
    });

    const bookmarks: NormalizedBookmark[] = [];
    const texts: string[] = [];
    let maxId = store.lastMessageId;

    for (const raw of messages) {
      const msg = raw as LooseMessage;
      if (typeof msg.id === "number") maxId = Math.max(maxId, msg.id);
      const converted = messageToBookmark(msg);
      if (converted) bookmarks.push(converted);
      const text = typeof msg.message === "string" ? msg.message : "";
      const web = webInfo(msg).url;
      const blob = [text, web].filter(Boolean).join("\n");
      if (blob) texts.push(blob);
    }

    const ig = texts.length ? await instagramLinksToBookmarks(texts.join("\n")) : [];
    saveUserStore({ ...store, lastMessageId: maxId });
    return {
      importedBookmarks: [...bookmarks, ...ig],
      updateCount: messages.length,
    };
  } catch (error) {
    throw new Error(telegramErrorMessage(error));
  } finally {
    pullBusy = false;
  }
}
