"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Download,
  FolderTree,
  Loader2,
  Menu,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useDebounce } from "@/hooks/use-debounce";
import type {
  Bookmark,
  Collection,
  PaginatedBookmarks,
  Stats,
  Tag,
} from "@/lib/types";
import { BookmarkCard } from "@/components/bookmark-card";
import { BulkActions } from "@/components/bulk-actions";
import { EditBookmarkDialog } from "@/components/edit-bookmark-dialog";
import { ConnectDialog } from "@/components/connect-dialog";
import { GettingStarted } from "@/components/getting-started";
import { Sidebar, type SidebarFilters } from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EMPTY_SIDEBAR: SidebarFilters = {
  collectionId: undefined,
  tagIds: [],
  favorites: false,
  unread: false,
  hasMedia: false,
};

export function LibraryApp() {
  const searchRef = useRef<HTMLInputElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 200);
  const [author, setAuthor] = useState("");
  const debouncedAuthor = useDebounce(author, 250);
  const [sort, setSort] = useState<"newest" | "oldest" | "author">("newest");
  const [sidebarFilters, setSidebarFilters] =
    useState<SidebarFilters>(EMPTY_SIDEBAR);
  const [showFilters, setShowFilters] = useState(false);

  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedBookmarks | null>(null);
  const [items, setItems] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [tags, setTags] = useState<(Tag & { count: number })[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Bookmark | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [categorizing, setCategorizing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectingAll, setSelectingAll] = useState(false);

  const refreshMeta = useCallback(async () => {
    const [t, c, s] = await Promise.all([
      api.tags(),
      api.collections(),
      api.stats(),
    ]);
    setTags(t);
    setCollections(c);
    setStats(s);
  }, []);

  const filtersKey = useMemo(
    () =>
      JSON.stringify({
        q: debouncedQuery,
        author: debouncedAuthor,
        sort,
        ...sidebarFilters,
      }),
    [debouncedQuery, debouncedAuthor, sort, sidebarFilters]
  );

  const loadPage = useCallback(
    async (pageNum: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const result = await api.bookmarks({
          q: debouncedQuery || undefined,
          author: debouncedAuthor || undefined,
          sort,
          tagIds: sidebarFilters.tagIds.length
            ? sidebarFilters.tagIds
            : undefined,
          collectionId: sidebarFilters.collectionId,
          favorites: sidebarFilters.favorites || undefined,
          unread: sidebarFilters.unread || undefined,
          hasMedia: sidebarFilters.hasMedia || undefined,
          page: pageNum,
          limit: 30,
        });
        setData(result);
        setItems((prev) =>
          append ? [...prev, ...result.items] : result.items
        );
        setPage(pageNum);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to load bookmarks"
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQuery, debouncedAuthor, sort, sidebarFilters]
  );

  useEffect(() => {
    void refreshMeta();
  }, [refreshMeta]);

  useEffect(() => {
    setSelected(new Set());
    void loadPage(1, false);
  }, [filtersKey, loadPage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") {
        searchRef.current?.blur();
        setSelected(new Set());
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting &&
          data?.hasMore &&
          !loading &&
          !loadingMore
        ) {
          void loadPage(page + 1, true);
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [data?.hasMore, loading, loadingMore, loadPage, page]);

  async function reloadAll() {
    await refreshMeta();
    await loadPage(1, false);
  }

  const reloadAllRef = useRef(reloadAll);
  reloadAllRef.current = reloadAll;

  useEffect(() => {
    const id = window.setInterval(async () => {
      try {
        const status = await api.telegramStatus();
        if (!status.connected) return;
        const res = await api.telegramPull();
        if (res.imported > 0) {
          toast.success(`Telegram: ${res.imported} new`);
          await reloadAllRef.current();
        }
      } catch {
        // not connected
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, []);

  async function selectAllMatching() {
    setSelectingAll(true);
    try {
      const result = await api.bookmarkIds({
        q: debouncedQuery || undefined,
        author: debouncedAuthor || undefined,
        sort,
        tagIds: sidebarFilters.tagIds.length
          ? sidebarFilters.tagIds
          : undefined,
        collectionId: sidebarFilters.collectionId,
        favorites: sidebarFilters.favorites || undefined,
        unread: sidebarFilters.unread || undefined,
        hasMedia: sidebarFilters.hasMedia || undefined,
      });
      setSelected(new Set(result.ids));
      if (result.total === 0) toast.message("Nothing to select");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to select bookmarks"
      );
    } finally {
      setSelectingAll(false);
    }
  }

  function updateLocal(bookmark: Bookmark) {
    setItems((prev) => prev.map((b) => (b.id === bookmark.id ? bookmark : b)));
  }

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950 text-zinc-100">
      <div className="hidden md:block">
        <Sidebar
          stats={stats}
          tags={tags}
          collections={collections}
          filters={sidebarFilters}
          onChange={setSidebarFilters}
          onRefreshMeta={() => void refreshMeta()}
        />
      </div>

      {sidebarOpen ? (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/60"
            aria-label="Close categories"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative z-10 h-full w-72 max-w-[85vw] shadow-2xl">
            <div className="absolute right-2 top-2 z-20">
              <Button
                size="icon"
                variant="ghost"
                onClick={() => setSidebarOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Sidebar
              stats={stats}
              tags={tags}
              collections={collections}
              filters={sidebarFilters}
              onChange={(f) => {
                setSidebarFilters(f);
                setSidebarOpen(false);
              }}
              onRefreshMeta={() => void refreshMeta()}
            />
          </div>
        </div>
      ) : null}

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 border-b border-zinc-800/80 bg-zinc-950/90 px-4 py-3 backdrop-blur md:px-6">
          <div className="mx-auto flex max-w-3xl flex-col gap-3">
            <div className="flex items-center gap-2">
              <Button
                size="icon"
                variant="secondary"
                className="md:hidden"
                title="Categories"
                onClick={() => setSidebarOpen(true)}
              >
                <Menu className="h-4 w-4" />
              </Button>
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search bookmarks…  (/)"
                  className="pl-9"
                />
              </div>
              <Button
                size="icon"
                variant="secondary"
                title="More filters"
                onClick={() => setShowFilters((v) => !v)}
              >
                <SlidersHorizontal className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={categorizing}
                title="Auto-sort into categories"
                onClick={async () => {
                  setCategorizing(true);
                  try {
                    const res = await api.categorize(true);
                    toast.success(
                      `Categorized ${res.categorized} · Misc ${res.skipped}`
                    );
                    await reloadAll();
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Categorize failed"
                    );
                  } finally {
                    setCategorizing(false);
                  }
                }}
              >
                {categorizing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FolderTree className="h-4 w-4" />
                )}
                Categorize
              </Button>
              <ConnectDialog onChanged={() => void reloadAll()} />
              <Button size="sm" variant="secondary" asChild>
                <a href="/api/export" download>
                  <Download className="h-4 w-4" />
                  Export
                </a>
              </Button>
            </div>

            {showFilters ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Filter by author"
                  className="w-44"
                />
                <Select
                  value={sort}
                  onValueChange={(v) =>
                    setSort(v as "newest" | "oldest" | "author")
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="newest">Newest</SelectItem>
                    <SelectItem value="oldest">Oldest</SelectItem>
                    <SelectItem value="author">Author</SelectItem>
                  </SelectContent>
                </Select>
                {data ? (
                  <span className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
                    {data.total} result{data.total === 1 ? "" : "s"}
                    {data.total > 0 ? (
                      <button
                        type="button"
                        className="text-sky-400 hover:text-sky-300 disabled:opacity-50"
                        disabled={selectingAll}
                        onClick={() => void selectAllMatching()}
                      >
                        {selectingAll ? "Selecting…" : "Select all"}
                      </button>
                    ) : null}
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs text-zinc-500">
                <span className="flex items-center gap-2">
                  {data
                    ? `${data.total} bookmark${data.total === 1 ? "" : "s"}`
                    : "Loading…"}
                  {data && data.total > 0 ? (
                    <button
                      type="button"
                      className="text-sky-400 hover:text-sky-300 disabled:opacity-50"
                      disabled={selectingAll}
                      onClick={() => void selectAllMatching()}
                    >
                      {selectingAll ? "Selecting…" : "Select all"}
                    </button>
                  ) : null}
                </span>
                <span className="hidden sm:inline">
                  Shortcuts: <kbd className="rounded border border-zinc-700 px-1">/</kbd>{" "}
                  search ·{" "}
                  <kbd className="rounded border border-zinc-700 px-1">Esc</kbd>{" "}
                  clear
                </span>
              </div>
            )}

            {collections.length > 0 ? (
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() =>
                    setSidebarFilters({
                      ...EMPTY_SIDEBAR,
                    })
                  }
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    sidebarFilters.collectionId === undefined &&
                    !sidebarFilters.favorites &&
                    sidebarFilters.tagIds.length === 0
                      ? "border-sky-500/50 bg-sky-500/15 text-sky-200"
                      : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                  }`}
                >
                  All
                </button>
                {collections
                  .filter((c) => c.name !== "Reading list")
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setSidebarFilters({
                          ...sidebarFilters,
                          collectionId: c.id,
                          favorites: false,
                        })
                      }
                      className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        sidebarFilters.collectionId === c.id
                          ? "border-sky-500/50 bg-sky-500/15 text-sky-200"
                          : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                      }`}
                    >
                      {c.name}
                      {typeof c.bookmarkCount === "number" ? (
                        <span className="ml-1 text-zinc-600">{c.bookmarkCount}</span>
                      ) : null}
                    </button>
                  ))}
              </div>
            ) : null}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
          <div className="mx-auto max-w-3xl space-y-3 pb-24">
            {loading && items.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-24 text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading library…
              </div>
            ) : stats?.totalBookmarks === 0 ? (
              <GettingStarted onChanged={() => void reloadAll()} />
            ) : items.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-800 px-6 py-16 text-center">
                <h2 className="text-lg font-medium text-zinc-100">
                  No bookmarks match
                </h2>
                <p className="mt-2 text-sm text-zinc-500">
                  Clear filters or search, or connect another source.
                </p>
                <div className="mt-6 flex justify-center gap-2">
                  <ConnectDialog onChanged={() => void reloadAll()} />
                </div>
              </div>
            ) : (
              items.map((bookmark) => (
                <BookmarkCard
                  key={bookmark.id}
                  bookmark={bookmark}
                  selected={selected.has(bookmark.id)}
                  onSelect={(id, isSelected) => {
                    setSelected((prev) => {
                      const next = new Set(prev);
                      if (isSelected) next.add(id);
                      else next.delete(id);
                      return next;
                    });
                  }}
                  onToggleFavorite={async (b) => {
                    const updated = await api.updateBookmark(b.id, {
                      isFavorite: !b.isFavorite,
                    });
                    updateLocal(updated);
                    void refreshMeta();
                  }}
                  onToggleRead={async (b) => {
                    const updated = await api.updateBookmark(b.id, {
                      isRead: !b.isRead,
                    });
                    updateLocal(updated);
                    void refreshMeta();
                  }}
                  onDelete={async (b) => {
                    if (!confirm("Delete this bookmark?")) return;
                    await api.deleteBookmark(b.id);
                    setItems((prev) => prev.filter((x) => x.id !== b.id));
                    void refreshMeta();
                    toast.success("Deleted");
                  }}
                  onEdit={(b) => {
                    setEditing(b);
                    setEditOpen(true);
                  }}
                />
              ))
            )}

            <div ref={sentinelRef} className="h-8" />
            {loadingMore ? (
              <div className="flex justify-center py-4 text-zinc-500">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : null}
          </div>

          <BulkActions
            selectedIds={[...selected]}
            tags={tags}
            collections={collections}
            onClear={() => setSelected(new Set())}
            onDone={async () => {
              setSelected(new Set());
              await reloadAll();
            }}
          />
        </div>
      </main>

      <EditBookmarkDialog
        bookmark={editing}
        open={editOpen}
        onOpenChange={setEditOpen}
        tags={tags}
        collections={collections}
        onSaved={(b) => {
          updateLocal(b);
          void refreshMeta();
        }}
        onTagsChanged={() => void refreshMeta()}
      />
    </div>
  );
}
