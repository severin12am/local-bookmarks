import { relations, sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

export const bookmarks = sqliteTable(
  "bookmarks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    tweetId: text("tweet_id").notNull(),
    text: text("text").notNull().default(""),
    authorName: text("author_name").notNull().default(""),
    authorUsername: text("author_username").notNull().default(""),
    authorAvatarUrl: text("author_avatar_url"),
    tweetCreatedAt: text("tweet_created_at"),
    url: text("url").notNull().default(""),
    mediaJson: text("media_json").notNull().default("[]"),
    likeCount: integer("like_count").notNull().default(0),
    retweetCount: integer("retweet_count").notNull().default(0),
    replyCount: integer("reply_count").notNull().default(0),
    quoteCount: integer("quote_count").notNull().default(0),
    isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    notes: text("notes"),
    collectionId: integer("collection_id"),
    rawJson: text("raw_json"),
    importedAt: text("imported_at")
      .notNull()
      .default(sql`(datetime('now'))`),
    updatedAt: text("updated_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    uniqueIndex("bookmarks_tweet_id_idx").on(table.tweetId),
    index("bookmarks_author_username_idx").on(table.authorUsername),
    index("bookmarks_collection_id_idx").on(table.collectionId),
    index("bookmarks_tweet_created_at_idx").on(table.tweetCreatedAt),
    index("bookmarks_is_favorite_idx").on(table.isFavorite),
    index("bookmarks_is_read_idx").on(table.isRead),
  ]
);

export const tags = sqliteTable(
  "tags",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    color: text("color").notNull().default("#38bdf8"),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [uniqueIndex("tags_name_idx").on(table.name)]
);

export const bookmarkTags = sqliteTable(
  "bookmark_tags",
  {
    bookmarkId: integer("bookmark_id")
      .notNull()
      .references(() => bookmarks.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("bookmark_tags_unique_idx").on(table.bookmarkId, table.tagId),
    index("bookmark_tags_tag_id_idx").on(table.tagId),
  ]
);

export const collections = sqliteTable(
  "collections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    parentId: integer("parent_id"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (table) => [
    index("collections_parent_id_idx").on(table.parentId),
    uniqueIndex("collections_name_parent_idx").on(table.name, table.parentId),
  ]
);

export const bookmarksRelations = relations(bookmarks, ({ one, many }) => ({
  collection: one(collections, {
    fields: [bookmarks.collectionId],
    references: [collections.id],
  }),
  bookmarkTags: many(bookmarkTags),
}));

export const tagsRelations = relations(tags, ({ many }) => ({
  bookmarkTags: many(bookmarkTags),
}));

export const bookmarkTagsRelations = relations(bookmarkTags, ({ one }) => ({
  bookmark: one(bookmarks, {
    fields: [bookmarkTags.bookmarkId],
    references: [bookmarks.id],
  }),
  tag: one(tags, {
    fields: [bookmarkTags.tagId],
    references: [tags.id],
  }),
}));

export const collectionsRelations = relations(collections, ({ one, many }) => ({
  parent: one(collections, {
    fields: [collections.parentId],
    references: [collections.id],
    relationName: "collection_tree",
  }),
  children: many(collections, { relationName: "collection_tree" }),
  bookmarks: many(bookmarks),
}));

export type BookmarkRow = typeof bookmarks.$inferSelect;
export type NewBookmarkRow = typeof bookmarks.$inferInsert;
export type TagRow = typeof tags.$inferSelect;
export type CollectionRow = typeof collections.$inferSelect;
