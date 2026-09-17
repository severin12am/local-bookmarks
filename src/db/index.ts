import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import fs from "fs";
import path from "path";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  sqlite?: Database.Database;
  db?: ReturnType<typeof drizzle<typeof schema>>;
};

function getDbPath() {
  return process.env.BOOKMARKS_DB_PATH
    ? path.resolve(process.env.BOOKMARKS_DB_PATH)
    : path.join(process.cwd(), "data", "bookmarks.db");
}

function migrate(sqlite: Database.Database) {
  sqlite.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tweet_id TEXT NOT NULL,
      text TEXT NOT NULL DEFAULT '',
      author_name TEXT NOT NULL DEFAULT '',
      author_username TEXT NOT NULL DEFAULT '',
      author_avatar_url TEXT,
      tweet_created_at TEXT,
      url TEXT NOT NULL DEFAULT '',
      media_json TEXT NOT NULL DEFAULT '[]',
      like_count INTEGER NOT NULL DEFAULT 0,
      retweet_count INTEGER NOT NULL DEFAULT 0,
      reply_count INTEGER NOT NULL DEFAULT 0,
      quote_count INTEGER NOT NULL DEFAULT 0,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      is_read INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      collection_id INTEGER,
      raw_json TEXT,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE UNIQUE INDEX IF NOT EXISTS bookmarks_tweet_id_idx ON bookmarks(tweet_id);
    CREATE INDEX IF NOT EXISTS bookmarks_author_username_idx ON bookmarks(author_username);
    CREATE INDEX IF NOT EXISTS bookmarks_collection_id_idx ON bookmarks(collection_id);
    CREATE INDEX IF NOT EXISTS bookmarks_tweet_created_at_idx ON bookmarks(tweet_created_at);
    CREATE INDEX IF NOT EXISTS bookmarks_is_favorite_idx ON bookmarks(is_favorite);
    CREATE INDEX IF NOT EXISTS bookmarks_is_read_idx ON bookmarks(is_read);

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#38bdf8',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS tags_name_idx ON tags(name);

    CREATE TABLE IF NOT EXISTS bookmark_tags (
      bookmark_id INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS bookmark_tags_unique_idx ON bookmark_tags(bookmark_id, tag_id);
    CREATE INDEX IF NOT EXISTS bookmark_tags_tag_id_idx ON bookmark_tags(tag_id);

    CREATE TABLE IF NOT EXISTS collections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS collections_parent_id_idx ON collections(parent_id);
    CREATE UNIQUE INDEX IF NOT EXISTS collections_name_parent_idx ON collections(name, parent_id);

    CREATE VIRTUAL TABLE IF NOT EXISTS bookmarks_fts USING fts5(
      tweet_id UNINDEXED,
      text,
      author_name,
      author_username,
      notes,
      content='bookmarks',
      content_rowid='id'
    );

    CREATE TRIGGER IF NOT EXISTS bookmarks_ai AFTER INSERT ON bookmarks BEGIN
      INSERT INTO bookmarks_fts(rowid, tweet_id, text, author_name, author_username, notes)
      VALUES (new.id, new.tweet_id, new.text, new.author_name, new.author_username, coalesce(new.notes, ''));
    END;

    CREATE TRIGGER IF NOT EXISTS bookmarks_ad AFTER DELETE ON bookmarks BEGIN
      INSERT INTO bookmarks_fts(bookmarks_fts, rowid, tweet_id, text, author_name, author_username, notes)
      VALUES ('delete', old.id, old.tweet_id, old.text, old.author_name, old.author_username, coalesce(old.notes, ''));
    END;

    CREATE TRIGGER IF NOT EXISTS bookmarks_au AFTER UPDATE ON bookmarks BEGIN
      INSERT INTO bookmarks_fts(bookmarks_fts, rowid, tweet_id, text, author_name, author_username, notes)
      VALUES ('delete', old.id, old.tweet_id, old.text, old.author_name, old.author_username, coalesce(old.notes, ''));
      INSERT INTO bookmarks_fts(rowid, tweet_id, text, author_name, author_username, notes)
      VALUES (new.id, new.tweet_id, new.text, new.author_name, new.author_username, coalesce(new.notes, ''));
    END;
  `);
}

function createClient() {
  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const sqlite = new Database(dbPath);
  migrate(sqlite);

  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

export function getSqlite() {
  if (!globalForDb.sqlite) {
    const client = createClient();
    globalForDb.sqlite = client.sqlite;
    globalForDb.db = client.db;
  }
  return globalForDb.sqlite!;
}

export function getDb() {
  if (!globalForDb.db) {
    const client = createClient();
    globalForDb.sqlite = client.sqlite;
    globalForDb.db = client.db;
  }
  return globalForDb.db!;
}

export { schema };
