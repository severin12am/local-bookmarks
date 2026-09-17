"use client";

import { useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import type { ImportResult } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  onImported: () => void;
};

type LibraryImportResult = ImportResult & { found?: number; source?: string };

export function ImportDialog({ onImported }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LibraryImportResult | null>(null);

  function addFiles(list: FileList | File[] | null) {
    if (!list) return;
    setFiles((prev) => [...prev, ...Array.from(list)]);
  }

  async function submit() {
    if (!text.trim() && files.length === 0) {
      toast.error("Paste links or choose a file");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await api.importLibrary({ text, files });
      setResult(res);
      toast.success(
        `Imported ${res.imported}` +
          (res.skipped ? ` (${res.skipped} already saved)` : "")
      );
      onImported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="secondary">
          <Upload className="h-4 w-4" />
          Import
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import</DialogTitle>
          <DialogDescription>
            No logins besides X sync. Paste links or drop an export file.
          </DialogDescription>
        </DialogHeader>

        <ol className="list-decimal space-y-2 pl-4 text-xs text-zinc-500">
          <li>
            <span className="text-zinc-300">Telegram Saved Messages:</span> Desktop →
            Settings → Advanced → Export Telegram data → JSON → only Saved
            Messages. Drop <code className="text-zinc-400">result.json</code>.
          </li>
          <li>
            <span className="text-zinc-300">Instagram reels:</span> paste
            instagram.com/reel/… links, or an Android SMS Backup XML of the
            Google Messages thread.
          </li>
          <li>
            <span className="text-zinc-300">X:</span> prefer Sync from X. JSON
            dumps still work here.
          </li>
        </ol>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"https://www.instagram.com/reel/...\nhttps://t.me/..."}
          className="min-h-28 font-mono text-xs"
        />

        <div
          className={`flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${
            dragging
              ? "border-sky-400 bg-sky-500/10"
              : "border-zinc-700 bg-zinc-900/40"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            addFiles(e.dataTransfer.files);
          }}
        >
          <p className="text-sm text-zinc-200">Drop result.json, XML, HTML, or TXT</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
          >
            Choose files
          </Button>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".json,.xml,.txt,.html,application/json,text/xml,text/plain,text/html"
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {files.length > 0 ? (
            <p className="max-w-full truncate text-xs text-zinc-500">
              {files.map((f) => f.name).join(", ")}
            </p>
          ) : (
            <p className="text-xs text-zinc-600">No file</p>
          )}
        </div>

        <Button disabled={loading} onClick={() => void submit()}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Importing…
            </>
          ) : (
            "Import"
          )}
        </Button>

        {result ? (
          <p className="text-sm text-zinc-400">
            {result.source ? <span className="text-zinc-300">{result.source} · </span> : null}
            Found {result.found ?? result.total} · imported{" "}
            <span className="text-sky-300">{result.imported}</span> · skipped{" "}
            {result.skipped}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
