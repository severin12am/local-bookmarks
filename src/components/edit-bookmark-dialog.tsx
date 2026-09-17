"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { Bookmark, Collection, Tag } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

type Props = {
  bookmark: Bookmark | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: (Tag & { count?: number })[];
  collections: Collection[];
  onSaved: (bookmark: Bookmark) => void;
  onTagsChanged: () => void;
};

export function EditBookmarkDialog({
  bookmark,
  open,
  onOpenChange,
  tags,
  collections,
  onSaved,
  onTagsChanged,
}: Props) {
  const [notes, setNotes] = useState("");
  const [collectionId, setCollectionId] = useState<string>("none");
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!bookmark) return;
    setNotes(bookmark.notes ?? "");
    setCollectionId(
      bookmark.collectionId != null ? String(bookmark.collectionId) : "none"
    );
    setSelectedTagIds(bookmark.tags.map((t) => t.id));
  }, [bookmark]);

  async function save() {
    if (!bookmark) return;
    setSaving(true);
    try {
      const updated = await api.updateBookmark(bookmark.id, {
        notes: notes.trim() || null,
        collectionId: collectionId === "none" ? null : Number(collectionId),
        tagIds: selectedTagIds,
      });
      onSaved(updated);
      onOpenChange(false);
      toast.success("Bookmark updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function addTag() {
    const name = newTag.trim();
    if (!name) return;
    try {
      const tag = await api.createTag(name);
      setSelectedTagIds((prev) =>
        prev.includes(tag.id) ? prev : [...prev, tag.id]
      );
      setNewTag("");
      onTagsChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create tag");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit bookmark</DialogTitle>
          <DialogDescription>
            Update notes, tags, and collection for this post.
          </DialogDescription>
        </DialogHeader>

        {bookmark ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-300">
              <p className="font-medium text-zinc-100">
                {bookmark.authorName}{" "}
                <span className="font-normal text-zinc-500">
                  @{bookmark.authorUsername}
                </span>
              </p>
              <p className="mt-2 line-clamp-4 whitespace-pre-wrap">{bookmark.text}</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Notes</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Personal notes…"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Collection</label>
              <Select value={collectionId} onValueChange={setCollectionId}>
                <SelectTrigger>
                  <SelectValue placeholder="No collection" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No collection</SelectItem>
                  {collections.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.parentId ? "↳ " : ""}
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm text-zinc-400">Tags</label>
              <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-md border border-zinc-800 p-3">
                {tags.length === 0 ? (
                  <p className="text-sm text-zinc-500">No tags yet</p>
                ) : (
                  tags.map((tag) => {
                    const checked = selectedTagIds.includes(tag.id);
                    return (
                      <label
                        key={tag.id}
                        className="flex cursor-pointer items-center gap-2 text-sm text-zinc-200"
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(v) => {
                            setSelectedTagIds((prev) =>
                              v
                                ? [...prev, tag.id]
                                : prev.filter((id) => id !== tag.id)
                            );
                          }}
                        />
                        <span style={{ color: tag.color }}>{tag.name}</span>
                      </label>
                    );
                  })
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  placeholder="New tag"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void addTag();
                    }
                  }}
                />
                <Button type="button" variant="secondary" onClick={() => void addTag()}>
                  Add
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={() => void save()}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
