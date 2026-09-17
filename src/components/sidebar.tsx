"use client";

import { useState } from "react";
import {
  Bookmark,
  FolderPlus,
  Folder,
  Hash,
  ImageIcon,
  Plus,
  Star,
  Trash2,
  CircleDot,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { Collection, Stats, Tag } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

export type SidebarFilters = {
  collectionId?: number | null | undefined;
  tagIds: number[];
  favorites: boolean;
  unread: boolean;
  hasMedia: boolean;
};

type Props = {
  stats: Stats | null;
  tags: (Tag & { count: number })[];
  collections: Collection[];
  filters: SidebarFilters;
  onChange: (filters: SidebarFilters) => void;
  onRefreshMeta: () => void;
};

export function Sidebar({
  stats,
  tags,
  collections,
  filters,
  onChange,
  onRefreshMeta,
}: Props) {
  const [newCollection, setNewCollection] = useState("");
  const [newTag, setNewTag] = useState("");
  const [showCollectionInput, setShowCollectionInput] = useState(false);
  const [showTagInput, setShowTagInput] = useState(false);

  const roots = collections.filter((c) => c.parentId == null);
  const childrenOf = (parentId: number) =>
    collections.filter((c) => c.parentId === parentId);

  async function createCollection() {
    const name = newCollection.trim();
    if (!name) return;
    try {
      await api.createCollection(name);
      setNewCollection("");
      setShowCollectionInput(false);
      onRefreshMeta();
      toast.success("Collection created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  async function createTag() {
    const name = newTag.trim();
    if (!name) return;
    try {
      await api.createTag(name);
      setNewTag("");
      setShowTagInput(false);
      onRefreshMeta();
      toast.success("Tag created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  function NavButton({
    active,
    onClick,
    children,
    count,
  }: {
    active?: boolean;
    onClick: () => void;
    children: React.ReactNode;
    count?: number;
  }) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors",
          active
            ? "bg-sky-500/15 text-sky-200"
            : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100"
        )}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">{children}</span>
        {typeof count === "number" ? (
          <span className="text-xs text-zinc-600">{count}</span>
        ) : null}
      </button>
    );
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-zinc-800/80 bg-zinc-950/80">
      <div className="px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300">
            <Bookmark className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-sm font-semibold tracking-tight text-zinc-50">
              Bookmarks
            </h1>
            <p className="text-[11px] text-zinc-500">Local library</p>
          </div>
        </div>
        {stats ? (
          <div className="mt-4 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-2 py-2">
              <div className="text-lg font-semibold text-zinc-100">
                {stats.totalBookmarks}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                Bookmarks
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-2 py-2">
              <div className="text-lg font-semibold text-zinc-100">
                {stats.totalTags}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                Tags
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <Separator />

      <ScrollArea className="flex-1 px-2 py-3">
        <div className="space-y-4 px-1">
          <section className="space-y-1">
            <p className="px-2 text-[11px] font-medium uppercase tracking-wider text-zinc-600">
              Library
            </p>
            <NavButton
              active={
                filters.collectionId === undefined &&
                !filters.favorites &&
                !filters.unread &&
                !filters.hasMedia &&
                filters.tagIds.length === 0
              }
              onClick={() =>
                onChange({
                  collectionId: undefined,
                  tagIds: [],
                  favorites: false,
                  unread: false,
                  hasMedia: false,
                })
              }
              count={stats?.totalBookmarks}
            >
              <Bookmark className="h-4 w-4" />
              All bookmarks
            </NavButton>
            <NavButton
              active={filters.favorites}
              onClick={() =>
                onChange({
                  ...filters,
                  favorites: !filters.favorites,
                  collectionId: undefined,
                })
              }
              count={stats?.favorites}
            >
              <Star className="h-4 w-4" />
              Favorites
            </NavButton>
            <NavButton
              active={filters.unread}
              onClick={() =>
                onChange({
                  ...filters,
                  unread: !filters.unread,
                })
              }
              count={stats?.unread}
            >
              <CircleDot className="h-4 w-4" />
              Unread
            </NavButton>
            <NavButton
              active={filters.hasMedia}
              onClick={() =>
                onChange({
                  ...filters,
                  hasMedia: !filters.hasMedia,
                })
              }
              count={stats?.withMedia}
            >
              <ImageIcon className="h-4 w-4" />
              Has media
            </NavButton>
          </section>

          <section className="space-y-1">
            <div className="flex items-center justify-between px-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                Categories
              </p>
              <button
                type="button"
                className="text-zinc-500 hover:text-zinc-200"
                onClick={() => setShowCollectionInput((v) => !v)}
                title="New collection"
              >
                <FolderPlus className="h-3.5 w-3.5" />
              </button>
            </div>
            {showCollectionInput ? (
              <div className="flex gap-1 px-1 pb-1">
                <Input
                  value={newCollection}
                  onChange={(e) => setNewCollection(e.target.value)}
                  placeholder="Name"
                  className="h-8"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void createCollection();
                  }}
                />
                <Button size="icon" className="h-8 w-8" onClick={() => void createCollection()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
            <NavButton
              active={filters.collectionId === null}
              onClick={() =>
                onChange({ ...filters, collectionId: null, favorites: false })
              }
            >
              <Folder className="h-4 w-4" />
              Uncategorized
            </NavButton>
            {roots.map((c) => (
              <div key={c.id}>
                <div className="group flex items-center">
                  <NavButton
                    active={filters.collectionId === c.id}
                    onClick={() =>
                      onChange({
                        ...filters,
                        collectionId: c.id,
                        favorites: false,
                      })
                    }
                    count={c.bookmarkCount}
                  >
                    <Folder className="h-4 w-4" />
                    <span className="truncate">{c.name}</span>
                  </NavButton>
                  <button
                    type="button"
                    className="mr-1 hidden rounded p-1 text-zinc-600 hover:text-rose-400 group-hover:block"
                    onClick={async () => {
                      await api.deleteCollection(c.id);
                      if (filters.collectionId === c.id) {
                        onChange({ ...filters, collectionId: undefined });
                      }
                      onRefreshMeta();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {childrenOf(c.id).map((child) => (
                  <div key={child.id} className="group ml-4 flex items-center">
                    <NavButton
                      active={filters.collectionId === child.id}
                      onClick={() =>
                        onChange({
                          ...filters,
                          collectionId: child.id,
                          favorites: false,
                        })
                      }
                      count={child.bookmarkCount}
                    >
                      <Folder className="h-4 w-4" />
                      <span className="truncate">{child.name}</span>
                    </NavButton>
                    <button
                      type="button"
                      className="mr-1 hidden rounded p-1 text-zinc-600 hover:text-rose-400 group-hover:block"
                      onClick={async () => {
                        await api.deleteCollection(child.id);
                        onRefreshMeta();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </section>

          <section className="space-y-1 pb-4">
            <div className="flex items-center justify-between px-2">
              <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-600">
                Tags
              </p>
              <button
                type="button"
                className="text-zinc-500 hover:text-zinc-200"
                onClick={() => setShowTagInput((v) => !v)}
                title="New tag"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            {showTagInput ? (
              <div className="flex gap-1 px-1 pb-1">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="Tag name"
                  className="h-8"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void createTag();
                  }}
                />
                <Button size="icon" className="h-8 w-8" onClick={() => void createTag()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            ) : null}
            {tags.map((tag) => {
              const active = filters.tagIds.includes(tag.id);
              return (
                <div key={tag.id} className="group flex items-center">
                  <NavButton
                    active={active}
                    onClick={() => {
                      const tagIds = active
                        ? filters.tagIds.filter((id) => id !== tag.id)
                        : [...filters.tagIds, tag.id];
                      onChange({ ...filters, tagIds });
                    }}
                    count={tag.count}
                  >
                    <Hash className="h-4 w-4" style={{ color: tag.color }} />
                    <span className="truncate">{tag.name}</span>
                  </NavButton>
                  <button
                    type="button"
                    className="mr-1 hidden rounded p-1 text-zinc-600 hover:text-rose-400 group-hover:block"
                    onClick={async () => {
                      await api.deleteTag(tag.id);
                      onChange({
                        ...filters,
                        tagIds: filters.tagIds.filter((id) => id !== tag.id),
                      });
                      onRefreshMeta();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </section>
        </div>
      </ScrollArea>
    </aside>
  );
}
