"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { Collection, Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  selectedIds: number[];
  tags: (Tag & { count?: number })[];
  collections: Collection[];
  onDone: () => void;
  onClear: () => void;
};

export function BulkActions({
  selectedIds,
  tags,
  collections,
  onDone,
  onClear,
}: Props) {
  const [tagId, setTagId] = useState<string>("");
  const [collectionId, setCollectionId] = useState<string>("");

  if (selectedIds.length === 0) return null;

  async function run(
    body: Parameters<typeof api.bulk>[0],
    success: string
  ) {
    try {
      await api.bulk(body);
      toast.success(success);
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Action failed");
    }
  }

  return (
    <div className="sticky bottom-4 z-20 mx-auto flex w-full max-w-3xl items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-900/95 px-3 py-2 shadow-2xl backdrop-blur">
      <span className="mr-1 text-sm text-zinc-300">
        {selectedIds.length} selected
      </span>

      <Select value={tagId} onValueChange={setTagId}>
        <SelectTrigger className="h-8 w-[140px]">
          <SelectValue placeholder="Add tag" />
        </SelectTrigger>
        <SelectContent>
          {tags.map((t) => (
            <SelectItem key={t.id} value={String(t.id)}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="secondary"
        disabled={!tagId}
        onClick={() =>
          void run(
            { ids: selectedIds, addTagIds: [Number(tagId)] },
            "Tags added"
          )
        }
      >
        Apply tag
      </Button>

      <Select value={collectionId} onValueChange={setCollectionId}>
        <SelectTrigger className="h-8 w-[150px]">
          <SelectValue placeholder="Move to…" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Uncategorized</SelectItem>
          {collections.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        variant="secondary"
        disabled={!collectionId}
        onClick={() =>
          void run(
            {
              ids: selectedIds,
              collectionId:
                collectionId === "none" ? null : Number(collectionId),
            },
            "Moved"
          )
        }
      >
        Move
      </Button>

      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          void run({ ids: selectedIds, isFavorite: true }, "Starred")
        }
      >
        Star
      </Button>
      <Button
        size="sm"
        variant="secondary"
        onClick={() =>
          void run({ ids: selectedIds, isRead: true }, "Marked read")
        }
      >
        Read
      </Button>
      <Button
        size="sm"
        variant="destructive"
        onClick={() => {
          if (!confirm(`Delete ${selectedIds.length} bookmarks?`)) return;
          void run({ ids: selectedIds, delete: true }, "Deleted");
        }}
      >
        Delete
      </Button>
      <Button size="sm" variant="ghost" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
