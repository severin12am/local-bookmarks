"use client";

import {
  ExternalLink,
  Heart,
  MessageCircle,
  Repeat2,
  Star,
  Trash2,
} from "lucide-react";
import type { Bookmark } from "@/lib/types";
import { cn, formatCount, formatRelativeDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

type Props = {
  bookmark: Bookmark;
  selected: boolean;
  onSelect: (id: number, selected: boolean) => void;
  onToggleFavorite: (bookmark: Bookmark) => void;
  onToggleRead: (bookmark: Bookmark) => void;
  onDelete: (bookmark: Bookmark) => void;
  onEdit: (bookmark: Bookmark) => void;
};

export function BookmarkCard({
  bookmark,
  selected,
  onSelect,
  onToggleFavorite,
  onToggleRead,
  onDelete,
  onEdit,
}: Props) {
  const avatar = bookmark.authorAvatarUrl?.replace("_normal", "_bigger") ?? null;
  const isX =
    !bookmark.tweetId.startsWith("ig:") && !bookmark.tweetId.startsWith("tg:");
  const openLabel = bookmark.tweetId.startsWith("ig:")
    ? "Open on Instagram"
    : bookmark.tweetId.startsWith("tg:")
      ? "Open on Telegram"
      : "Open on X";
  const canOpen = /^https?:\/\//i.test(bookmark.url);

  return (
    <article
      className={cn(
        "group relative rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 transition-colors hover:border-zinc-700 hover:bg-zinc-900/70",
        !bookmark.isRead && "border-l-2 border-l-sky-500",
        selected && "border-sky-500/60 bg-sky-500/5"
      )}
    >
      <div className="flex gap-3">
        <div className="pt-1">
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => onSelect(bookmark.id, Boolean(v))}
            aria-label="Select bookmark"
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-zinc-800">
                {avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatar}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-sm font-medium text-zinc-400">
                    {(bookmark.authorName || "?").slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="truncate font-medium text-zinc-100">
                    {bookmark.authorName || "Unknown"}
                  </span>
                  {bookmark.authorUsername ? (
                    <span className="truncate text-sm text-zinc-500">
                      @{bookmark.authorUsername}
                    </span>
                  ) : null}
                  {bookmark.tweetCreatedAt ? (
                    <span className="text-sm text-zinc-600">
                      · {formatRelativeDate(bookmark.tweetCreatedAt)}
                    </span>
                  ) : null}
                </div>
                {bookmark.collection ? (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    in {bookmark.collection.name}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <Button
                size="icon"
                variant="ghost"
                title={bookmark.isFavorite ? "Unfavorite" : "Favorite"}
                onClick={() => onToggleFavorite(bookmark)}
              >
                <Star
                  className={cn(
                    "h-4 w-4",
                    bookmark.isFavorite && "fill-amber-400 text-amber-400"
                  )}
                />
              </Button>
              {canOpen ? (
                <Button size="icon" variant="ghost" asChild title={openLabel}>
                  <a href={bookmark.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              ) : null}
              <Button
                size="icon"
                variant="ghost"
                title="Delete"
                onClick={() => onDelete(bookmark)}
              >
                <Trash2 className="h-4 w-4 text-rose-400" />
              </Button>
            </div>
          </div>

          <button
            type="button"
            className="mt-3 w-full text-left"
            onClick={() => onEdit(bookmark)}
          >
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-zinc-200">
              {bookmark.text || (
                <span className="italic text-zinc-500">No text</span>
              )}
            </p>
          </button>

          {bookmark.media.length > 0 ? (
            <div
              className={cn(
                "mt-3 grid gap-2",
                bookmark.media.length === 1 ? "grid-cols-1" : "grid-cols-2"
              )}
            >
              {bookmark.media.slice(0, 4).map((m) => (
                <a
                  key={m.url}
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative aspect-video overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.previewUrl || m.url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                  {m.type && m.type !== "photo" ? (
                    <span className="absolute bottom-2 left-2 rounded bg-black/70 px-1.5 py-0.5 text-[10px] uppercase text-zinc-200">
                      {m.type}
                    </span>
                  ) : null}
                </a>
              ))}
            </div>
          ) : null}

          {bookmark.notes ? (
            <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-sm text-amber-100/90">
              {bookmark.notes}
            </div>
          ) : null}

          {bookmark.tags.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {bookmark.tags.map((tag) => (
                <Badge
                  key={tag.id}
                  style={{
                    backgroundColor: `${tag.color}22`,
                    color: tag.color,
                    borderColor: `${tag.color}44`,
                  }}
                >
                  {tag.name}
                </Badge>
              ))}
            </div>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-zinc-500">
            {isX ? (
              <>
                <span className="inline-flex items-center gap-1">
                  <Heart className="h-3.5 w-3.5" />
                  {formatCount(bookmark.likeCount)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Repeat2 className="h-3.5 w-3.5" />
                  {formatCount(bookmark.retweetCount)}
                </span>
                <span className="inline-flex items-center gap-1">
                  <MessageCircle className="h-3.5 w-3.5" />
                  {formatCount(bookmark.replyCount)}
                </span>
              </>
            ) : null}
            <button
              type="button"
              className="ml-auto text-zinc-400 hover:text-zinc-200"
              onClick={() => onToggleRead(bookmark)}
            >
              {bookmark.isRead ? "Mark unread" : "Mark read"}
            </button>
            <button
              type="button"
              className="text-sky-400 hover:text-sky-300"
              onClick={() => onEdit(bookmark)}
            >
              Edit
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
