export type Tag = {
  id: number;
  name: string;
  color: string;
  createdAt: string;
};

export type Collection = {
  id: number;
  name: string;
  parentId: number | null;
  sortOrder: number;
  createdAt: string;
  bookmarkCount?: number;
};

export type BookmarkMedia = {
  url: string;
  type?: "photo" | "video" | "animated_gif" | string;
  previewUrl?: string;
};

export type Bookmark = {
  id: number;
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
  isFavorite: boolean;
  isRead: boolean;
  notes: string | null;
  collectionId: number | null;
  importedAt: string;
  tags: Tag[];
  collection?: Collection | null;
};

export type BookmarkFilters = {
  q?: string;
  tagIds?: number[];
  collectionId?: number | null;
  favorites?: boolean;
  unread?: boolean;
  hasMedia?: boolean;
  author?: string;
  dateFrom?: string;
  dateTo?: string;
  sort?: "newest" | "oldest" | "author";
  page?: number;
  limit?: number;
};

export type PaginatedBookmarks = {
  items: Bookmark[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type Stats = {
  totalBookmarks: number;
  totalTags: number;
  totalCollections: number;
  favorites: number;
  unread: number;
  withMedia: number;
  withNotes: number;
};

export type ImportResult = {
  imported: number;
  skipped: number;
  errors: number;
  total: number;
  errorMessages?: string[];
  found?: number;
  source?: string;
};
