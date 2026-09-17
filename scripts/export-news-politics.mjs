import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const SOURCE = "data/bookmarks.db";
const OUT_DIR = "exports/news-politics";
const OUT_DB = path.join(OUT_DIR, "news-politics.db");
const OUT_JSON = path.join(OUT_DIR, "tweets.json");

function rec(v) {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

function unwrapTweet(node) {
  if (!rec(node)) return null;
  if (node.__typename === "TweetWithVisibilityResults" && rec(node.tweet)) {
    return unwrapTweet(node.tweet);
  }
  if (rec(node.result) && (node.result.__typename || node.result.legacy || node.result.rest_id)) {
    return unwrapTweet(node.result);
  }
  if (node.__typename === "TweetTombstone") return null;
  return node;
}

function str(o, k) {
  return rec(o) && typeof o[k] === "string" ? o[k] : "";
}

function num(o, k) {
  if (!rec(o)) return 0;
  const v = o[k];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && !Number.isNaN(Number(v))) return Number(v);
  return 0;
}

function stripSource(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function authorFromTweet(tweet) {
  const user = tweet?.core?.user_results?.result;
  if (!rec(user)) return null;
  const legacy = rec(user.legacy) ? user.legacy : {};
  const core = rec(user.core) ? user.core : {};
  const avatar = rec(user.avatar) ? user.avatar : {};
  const loc = rec(user.location) ? user.location : {};
  const verification = rec(user.verification) ? user.verification : {};
  const userId = str(user, "rest_id") || str(legacy, "id_str") || str(core, "user_id");
  const username =
    str(core, "screen_name") || str(legacy, "screen_name") || str(user, "screen_name");
  if (!userId && !username) return null;
  return {
    userId: userId || username,
    username,
    name: str(core, "name") || str(legacy, "name") || username,
    bio: str(legacy, "description") || str(user.profile_bio, "description") || "",
    location: str(loc, "location") || str(legacy, "location") || "",
    avatarUrl:
      str(avatar, "image_url") ||
      str(legacy, "profile_image_url_https") ||
      str(legacy, "profile_image_url") ||
      null,
    verified: Boolean(legacy.verified || verification.verified),
    blueVerified: Boolean(user.is_blue_verified),
    followersCount: num(legacy, "followers_count"),
    followingCount: num(legacy, "friends_count"),
    statusesCount: num(legacy, "statuses_count"),
    mediaCount: num(legacy, "media_count"),
    createdAt: str(legacy, "created_at") || null,
    rawJson: JSON.stringify(user),
  };
}

function mediaFromLegacy(legacy) {
  const out = [];
  const ext = rec(legacy.extended_entities) ? legacy.extended_entities : null;
  const ent = rec(legacy.entities) ? legacy.entities : null;
  const list = Array.isArray(ext?.media)
    ? ext.media
    : Array.isArray(ent?.media)
      ? ent.media
      : [];
  for (const m of list) {
    if (!rec(m)) continue;
    const info = rec(m.video_info) ? m.video_info : {};
    const variants = Array.isArray(info.variants) ? info.variants : [];
    const mp4s = variants
      .filter((v) => rec(v) && v.content_type === "video/mp4" && v.url)
      .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));
    const hls = variants.find((v) => rec(v) && String(v.content_type).includes("mpegURL"));
    const oi = rec(m.original_info) ? m.original_info : {};
    out.push({
      mediaId: str(m, "id_str") || str(m, "media_key") || str(m, "media_url_https"),
      type: str(m, "type") || "photo",
      previewUrl: str(m, "media_url_https") || str(m, "media_url") || null,
      expandedUrl: str(m, "expanded_url") || null,
      displayUrl: str(m, "display_url") || null,
      width: num(oi, "width"),
      height: num(oi, "height"),
      durationMs: num(info, "duration_millis"),
      mp4Url: mp4s[0]?.url || null,
      hlsUrl: hls?.url || null,
      variantsJson: variants.length ? JSON.stringify(variants) : null,
    });
  }
  return out;
}

function entitiesFrom(legacy, noteEntitySet) {
  const src = rec(noteEntitySet)
    ? noteEntitySet
    : rec(legacy.entities)
      ? legacy.entities
      : {};
  const urls = [];
  const hashtags = [];
  const mentions = [];
  for (const u of Array.isArray(src.urls) ? src.urls : []) {
    if (!rec(u)) continue;
    urls.push({
      url: str(u, "url"),
      expandedUrl: str(u, "expanded_url") || str(u, "unwound_url"),
      displayUrl: str(u, "display_url"),
    });
  }
  for (const h of Array.isArray(src.hashtags) ? src.hashtags : []) {
    if (!rec(h)) continue;
    const tag = str(h, "text") || str(h, "tag");
    if (tag) hashtags.push(tag);
  }
  for (const m of Array.isArray(src.user_mentions) ? src.user_mentions : []) {
    if (!rec(m)) continue;
    mentions.push({
      userId: str(m, "id_str"),
      username: str(m, "screen_name"),
      name: str(m, "name"),
    });
  }
  return { urls, hashtags, mentions };
}

function parseTweet(node, origin) {
  const tweet = unwrapTweet(node);
  if (!rec(tweet)) return null;
  const legacy = rec(tweet.legacy) ? tweet.legacy : {};
  const tweetId = str(tweet, "rest_id") || str(legacy, "id_str");
  if (!tweetId) return null;

  const noteText =
    tweet.note_tweet?.note_tweet_results?.result?.text ||
    tweet.note_tweet?.note_tweet_results?.result?.entity_set?.text ||
    "";
  const display = str(legacy, "full_text") || str(legacy, "text") || "";
  const text = (noteText || display).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

  const noteEntities = tweet.note_tweet?.note_tweet_results?.result?.entity_set;
  const entities = entitiesFrom(legacy, rec(noteEntities) ? noteEntities : null);
  const author = authorFromTweet(tweet);
  const views = rec(tweet.views) ? tweet.views : {};

  const quotedNode = tweet.quoted_status_result || legacy.quoted_status;
  const quoted = quotedNode ? parseTweet(quotedNode, "quoted") : null;

  const username =
    author?.username ||
    str(legacy, "screen_name") ||
    "";

  return {
    tweetId,
    conversationId: str(legacy, "conversation_id_str") || tweetId,
    origin,
    author,
    authorUsername: username,
    createdAt: str(legacy, "created_at") || null,
    lang: str(legacy, "lang") || null,
    source: stripSource(str(tweet, "source")),
    text,
    textDisplay: display,
    url: username ? `https://x.com/${username}/status/${tweetId}` : `https://x.com/i/status/${tweetId}`,
    likeCount: num(legacy, "favorite_count"),
    retweetCount: num(legacy, "retweet_count"),
    replyCount: num(legacy, "reply_count"),
    quoteCount: num(legacy, "quote_count"),
    bookmarkCount: num(legacy, "bookmark_count"),
    viewCount: num(views, "count"),
    isQuote: Boolean(legacy.is_quote_status),
    isReply: Boolean(legacy.in_reply_to_status_id_str),
    possiblySensitive: Boolean(legacy.possibly_sensitive),
    inReplyToTweetId: str(legacy, "in_reply_to_status_id_str") || null,
    inReplyToUsername: str(legacy, "in_reply_to_screen_name") || null,
    quotedTweetId: quoted?.tweetId || str(legacy, "quoted_status_id_str") || null,
    media: mediaFromLegacy(legacy),
    urls: entities.urls,
    hashtags: entities.hashtags,
    mentions: entities.mentions,
    quoted,
    rawJson: JSON.stringify(tweet),
  };
}

const src = new Database(SOURCE, { readonly: true });
const rows = src
  .prepare(
    `SELECT b.tweet_id, b.text, b.author_name, b.author_username, b.author_avatar_url,
            b.tweet_created_at, b.url, b.media_json, b.like_count, b.retweet_count,
            b.reply_count, b.quote_count, b.is_favorite, b.is_read, b.notes,
            b.raw_json, b.imported_at, b.updated_at
     FROM bookmarks b
     JOIN collections c ON c.id = b.collection_id
     WHERE c.name = 'News & Politics'
     ORDER BY b.tweet_created_at DESC`
  )
  .all();
src.close();

const parsed = [];
const authors = new Map();
const tweetMap = new Map();

function addTweet(t, extra) {
  if (!t) return;
  const merged = { ...t, ...extra };
  if (!tweetMap.has(merged.tweetId) || merged.origin === "bookmark") {
    tweetMap.set(merged.tweetId, merged);
  }
  if (merged.author) authors.set(merged.author.userId, merged.author);
  if (merged.quoted) addTweet(merged.quoted, { localNotes: null, isFavorite: 0, isRead: 0 });
}

for (const row of rows) {
  let t = null;
  if (row.raw_json) {
    try {
      t = parseTweet(JSON.parse(row.raw_json), "bookmark");
    } catch {
      t = null;
    }
  }
  if (!t) {
    t = {
      tweetId: row.tweet_id,
      conversationId: row.tweet_id,
      origin: "bookmark",
      author: {
        userId: row.author_username,
        username: row.author_username,
        name: row.author_name,
        bio: "",
        location: "",
        avatarUrl: row.author_avatar_url,
        verified: false,
        blueVerified: false,
        followersCount: 0,
        followingCount: 0,
        statusesCount: 0,
        mediaCount: 0,
        createdAt: null,
        rawJson: "{}",
      },
      authorUsername: row.author_username,
      createdAt: row.tweet_created_at,
      lang: null,
      source: "",
      text: row.text,
      textDisplay: row.text,
      url: row.url,
      likeCount: row.like_count,
      retweetCount: row.retweet_count,
      replyCount: row.reply_count,
      quoteCount: row.quote_count,
      bookmarkCount: 0,
      viewCount: 0,
      isQuote: false,
      isReply: false,
      possiblySensitive: false,
      inReplyToTweetId: null,
      inReplyToUsername: null,
      quotedTweetId: null,
      media: JSON.parse(row.media_json || "[]").map((m, i) => ({
        mediaId: `${row.tweet_id}-${i}`,
        type: m.type || "photo",
        previewUrl: m.previewUrl || m.url,
        expandedUrl: m.url,
        displayUrl: null,
        width: 0,
        height: 0,
        durationMs: 0,
        mp4Url: m.type === "video" ? m.url : null,
        hlsUrl: null,
        variantsJson: null,
      })),
      urls: [],
      hashtags: [],
      mentions: [],
      quoted: null,
      rawJson: row.raw_json || "{}",
    };
  }
  addTweet(t, {
    localNotes: row.notes,
    isFavorite: row.is_favorite ? 1 : 0,
    isRead: row.is_read ? 1 : 0,
    importedAt: row.imported_at,
  });
  parsed.push(tweetMap.get(t.tweetId));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
if (fs.existsSync(OUT_DB)) fs.unlinkSync(OUT_DB);

const out = new Database(OUT_DB);
out.pragma("journal_mode = WAL");
out.exec(`
CREATE TABLE authors (
  user_id TEXT PRIMARY KEY,
  username TEXT,
  name TEXT,
  bio TEXT,
  location TEXT,
  avatar_url TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  blue_verified INTEGER NOT NULL DEFAULT 0,
  followers_count INTEGER NOT NULL DEFAULT 0,
  following_count INTEGER NOT NULL DEFAULT 0,
  statuses_count INTEGER NOT NULL DEFAULT 0,
  media_count INTEGER NOT NULL DEFAULT 0,
  account_created_at TEXT,
  raw_json TEXT
);
CREATE TABLE tweets (
  tweet_id TEXT PRIMARY KEY,
  conversation_id TEXT,
  origin TEXT NOT NULL,
  author_user_id TEXT,
  author_username TEXT,
  created_at TEXT,
  lang TEXT,
  source TEXT,
  text TEXT NOT NULL,
  text_display TEXT,
  url TEXT,
  like_count INTEGER NOT NULL DEFAULT 0,
  retweet_count INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  quote_count INTEGER NOT NULL DEFAULT 0,
  bookmark_count INTEGER NOT NULL DEFAULT 0,
  view_count INTEGER NOT NULL DEFAULT 0,
  is_quote INTEGER NOT NULL DEFAULT 0,
  is_reply INTEGER NOT NULL DEFAULT 0,
  possibly_sensitive INTEGER NOT NULL DEFAULT 0,
  in_reply_to_tweet_id TEXT,
  in_reply_to_username TEXT,
  quoted_tweet_id TEXT,
  local_notes TEXT,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  is_read INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT,
  raw_json TEXT,
  FOREIGN KEY (author_user_id) REFERENCES authors(user_id)
);
CREATE TABLE media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tweet_id TEXT NOT NULL,
  media_id TEXT,
  type TEXT,
  preview_url TEXT,
  expanded_url TEXT,
  display_url TEXT,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  mp4_url TEXT,
  hls_url TEXT,
  variants_json TEXT,
  FOREIGN KEY (tweet_id) REFERENCES tweets(tweet_id)
);
CREATE TABLE urls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tweet_id TEXT NOT NULL,
  url TEXT,
  expanded_url TEXT,
  display_url TEXT,
  FOREIGN KEY (tweet_id) REFERENCES tweets(tweet_id)
);
CREATE TABLE hashtags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tweet_id TEXT NOT NULL,
  tag TEXT NOT NULL,
  FOREIGN KEY (tweet_id) REFERENCES tweets(tweet_id)
);
CREATE TABLE mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tweet_id TEXT NOT NULL,
  user_id TEXT,
  username TEXT,
  name TEXT,
  FOREIGN KEY (tweet_id) REFERENCES tweets(tweet_id)
);
CREATE VIRTUAL TABLE tweets_fts USING fts5(
  tweet_id UNINDEXED,
  text,
  author_username,
  author_name,
  hashtags
);
CREATE INDEX tweets_created_at_idx ON tweets(created_at);
CREATE INDEX tweets_author_idx ON tweets(author_username);
CREATE INDEX tweets_origin_idx ON tweets(origin);
CREATE INDEX media_tweet_idx ON media(tweet_id);
`);

const insAuthor = out.prepare(`INSERT OR REPLACE INTO authors
  (user_id, username, name, bio, location, avatar_url, verified, blue_verified,
   followers_count, following_count, statuses_count, media_count, account_created_at, raw_json)
  VALUES (@userId, @username, @name, @bio, @location, @avatarUrl, @verified, @blueVerified,
          @followersCount, @followingCount, @statusesCount, @mediaCount, @createdAt, @rawJson)`);

const insTweet = out.prepare(`INSERT OR REPLACE INTO tweets
  (tweet_id, conversation_id, origin, author_user_id, author_username, created_at, lang, source,
   text, text_display, url, like_count, retweet_count, reply_count, quote_count, bookmark_count,
   view_count, is_quote, is_reply, possibly_sensitive, in_reply_to_tweet_id, in_reply_to_username,
   quoted_tweet_id, local_notes, is_favorite, is_read, imported_at, raw_json)
  VALUES (@tweetId, @conversationId, @origin, @authorUserId, @authorUsername, @createdAt, @lang, @source,
          @text, @textDisplay, @url, @likeCount, @retweetCount, @replyCount, @quoteCount, @bookmarkCount,
          @viewCount, @isQuote, @isReply, @possiblySensitive, @inReplyToTweetId, @inReplyToUsername,
          @quotedTweetId, @localNotes, @isFavorite, @isRead, @importedAt, @rawJson)`);

const insMedia = out.prepare(`INSERT INTO media
  (tweet_id, media_id, type, preview_url, expanded_url, display_url, width, height, duration_ms, mp4_url, hls_url, variants_json)
  VALUES (@tweetId, @mediaId, @type, @previewUrl, @expandedUrl, @displayUrl, @width, @height, @durationMs, @mp4Url, @hlsUrl, @variantsJson)`);
const insUrl = out.prepare(`INSERT INTO urls (tweet_id, url, expanded_url, display_url) VALUES (@tweetId, @url, @expandedUrl, @displayUrl)`);
const insHash = out.prepare(`INSERT INTO hashtags (tweet_id, tag) VALUES (@tweetId, @tag)`);
const insMention = out.prepare(`INSERT INTO mentions (tweet_id, user_id, username, name) VALUES (@tweetId, @userId, @username, @name)`);
const insFts = out.prepare(
  `INSERT INTO tweets_fts (tweet_id, text, author_username, author_name, hashtags)
   VALUES (@tweetId, @text, @authorUsername, @authorName, @hashtags)`
);

const tx = out.transaction(() => {
  for (const a of authors.values()) {
    insAuthor.run({
      userId: a.userId,
      username: a.username,
      name: a.name,
      bio: a.bio,
      location: a.location,
      avatarUrl: a.avatarUrl,
      verified: a.verified ? 1 : 0,
      blueVerified: a.blueVerified ? 1 : 0,
      followersCount: a.followersCount,
      followingCount: a.followingCount,
      statusesCount: a.statusesCount,
      mediaCount: a.mediaCount,
      createdAt: a.createdAt,
      rawJson: a.rawJson,
    });
  }
  for (const t of tweetMap.values()) {
    insTweet.run({
      tweetId: t.tweetId,
      conversationId: t.conversationId,
      origin: t.origin,
      authorUserId: t.author?.userId || null,
      authorUsername: t.authorUsername,
      createdAt: t.createdAt,
      lang: t.lang,
      source: t.source,
      text: t.text,
      textDisplay: t.textDisplay,
      url: t.url,
      likeCount: t.likeCount,
      retweetCount: t.retweetCount,
      replyCount: t.replyCount,
      quoteCount: t.quoteCount,
      bookmarkCount: t.bookmarkCount,
      viewCount: t.viewCount,
      isQuote: t.isQuote ? 1 : 0,
      isReply: t.isReply ? 1 : 0,
      possiblySensitive: t.possiblySensitive ? 1 : 0,
      inReplyToTweetId: t.inReplyToTweetId,
      inReplyToUsername: t.inReplyToUsername,
      quotedTweetId: t.quotedTweetId,
      localNotes: t.localNotes ?? null,
      isFavorite: t.isFavorite ?? 0,
      isRead: t.isRead ?? 0,
      importedAt: t.importedAt ?? null,
      rawJson: t.rawJson,
    });
    for (const m of t.media || []) {
      insMedia.run({ tweetId: t.tweetId, ...m });
    }
    for (const u of t.urls || []) {
      insUrl.run({ tweetId: t.tweetId, url: u.url, expandedUrl: u.expandedUrl, displayUrl: u.displayUrl });
    }
    for (const tag of t.hashtags || []) insHash.run({ tweetId: t.tweetId, tag });
    for (const m of t.mentions || []) {
      insMention.run({ tweetId: t.tweetId, userId: m.userId, username: m.username, name: m.name });
    }
    insFts.run({
      tweetId: t.tweetId,
      text: t.text,
      authorUsername: t.authorUsername || "",
      authorName: t.author?.name || "",
      hashtags: (t.hashtags || []).join(" "),
    });
  }
});
tx();

const stats = {
  bookmarks: parsed.length,
  tweets: out.prepare(`SELECT count(*) n FROM tweets`).get().n,
  authors: out.prepare(`SELECT count(*) n FROM authors`).get().n,
  media: out.prepare(`SELECT count(*) n FROM media`).get().n,
  quoted: out.prepare(`SELECT count(*) n FROM tweets WHERE origin = 'quoted'`).get().n,
  withVideo: out.prepare(`SELECT count(DISTINCT tweet_id) n FROM media WHERE type IN ('video','animated_gif')`).get().n,
};
out.close();

function jsonSafe(t) {
  const { rawJson, author, quoted, ...rest } = t;
  return {
    ...rest,
    author: author
      ? {
          userId: author.userId,
          username: author.username,
          name: author.name,
          bio: author.bio,
          location: author.location,
          avatarUrl: author.avatarUrl,
          verified: author.verified,
          blueVerified: author.blueVerified,
          followersCount: author.followersCount,
          followingCount: author.followingCount,
          statusesCount: author.statusesCount,
        }
      : null,
    quoted: quoted
      ? {
          tweetId: quoted.tweetId,
          url: quoted.url,
          authorUsername: quoted.authorUsername,
          text: quoted.text,
          likeCount: quoted.likeCount,
          createdAt: quoted.createdAt,
        }
      : null,
  };
}

fs.writeFileSync(
  OUT_JSON,
  JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      collection: "News & Politics",
      ...stats,
      tweets: parsed.map(jsonSafe),
    },
    null,
    2
  )
);

console.log("wrote", OUT_DB, OUT_JSON, stats);
