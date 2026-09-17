"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

type Props = {
  onSynced: () => void;
};

type SyncResponse = ImportResult & {
  fetched?: number;
  pages?: number;
  error?: string;
};

export function SyncDialog({ onSynced }: Props) {
  const [open, setOpen] = useState(false);
  const [authToken, setAuthToken] = useState("");
  const [ct0, setCt0] = useState("");
  const [showSecrets, setShowSecrets] = useState(false);
  const [connected, setConnected] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<SyncResponse | null>(null);
  const [advancedCookie, setAdvancedCookie] = useState("");

  async function refreshStatus() {
    setChecking(true);
    try {
      const status = await api.syncStatus();
      setConnected(status.connected);
      setSavedAt(status.savedAt);
    } catch {
      setConnected(false);
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (open) void refreshStatus();
  }, [open]);

  async function sync() {
    setLoading(true);
    setResult(null);
    try {
      const res = await api.syncFromX({
        authToken: authToken || undefined,
        ct0: ct0 || undefined,
        cookie: advancedCookie || undefined,
        save: true,
      });
      setResult(res);
      toast.success(
        `Synced ${res.imported} new bookmark${res.imported === 1 ? "" : "s"}` +
          (res.skipped ? ` (${res.skipped} already saved)` : "")
      );
      setAuthToken("");
      setCt0("");
      setAdvancedCookie("");
      await refreshStatus();
      onSynced();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setLoading(false);
    }
  }

  async function disconnect() {
    await api.clearSyncCredentials();
    setConnected(false);
    setSavedAt(null);
    toast.success("Cleared saved X session");
  }

  const canSync = connected || (authToken && ct0) || advancedCookie.trim();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <RefreshCw className="h-4 w-4" />
          Sync from X
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sync bookmarks from X</DialogTitle>
          <DialogDescription>
            This app fetches your bookmarks directly from X using your browser
            session. No third-party exporter. Cookies stay on your machine.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-sm text-zinc-300">
          <p className="font-medium text-zinc-100">How to get your session (once)</p>
          <ol className="mt-2 list-decimal space-y-2 pl-4 text-zinc-400">
            <li>
              Open{" "}
              <a
                href="https://x.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sky-400 hover:underline"
              >
                x.com
              </a>{" "}
              logged in, then press{" "}
              <kbd className="rounded border border-zinc-700 px-1">F12</kbd>
            </li>
            <li>
              At the <span className="text-zinc-200">top</span> of DevTools, open the{" "}
              <span className="text-zinc-200">Application</span> tab
              <span className="mt-1 block text-xs text-zinc-500">
                Not Console. If you don&apos;t see it, click the{" "}
                <kbd className="rounded border border-zinc-700 px-1">&gt;&gt;</kbd>{" "}
                overflow menu on the top tab bar and pick Application.
                (Firefox: use <span className="text-zinc-300">Storage</span>.)
              </span>
            </li>
            <li>
              Left sidebar: <span className="text-zinc-200">Cookies</span> →{" "}
              <span className="text-zinc-200">https://x.com</span>
            </li>
            <li>
              Find rows named <span className="text-zinc-200">auth_token</span> and{" "}
              <span className="text-zinc-200">ct0</span>, double-click each{" "}
              <span className="text-zinc-200">Value</span>, copy, paste below
            </li>
          </ol>

          <details className="mt-3 rounded-md border border-zinc-800 bg-zinc-950/50 p-2">
            <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">
              Can&apos;t find Application? Use Network instead
            </summary>
            <ol className="mt-2 list-decimal space-y-1.5 pl-4 text-xs text-zinc-500">
              <li>
                Top tabs → <span className="text-zinc-300">Network</span>
              </li>
              <li>
                Open{" "}
                <a
                  href="https://x.com/i/bookmarks"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-400 hover:underline"
                >
                  x.com/i/bookmarks
                </a>
              </li>
              <li>
                Click any request to{" "}
                <span className="text-zinc-300">graphql</span> or{" "}
                <span className="text-zinc-300">Bookmarks</span>
              </li>
              <li>
                Headers → Request Headers → copy Cookie (or use Advanced paste
                below), and copy <span className="text-zinc-300">x-csrf-token</span>{" "}
                into ct0
              </li>
            </ol>
          </details>

          <p className="mt-2 text-xs text-zinc-500">
            Treat these like a password. Stored only in local{" "}
            <code className="text-zinc-400">data/</code> — never sent elsewhere.
          </p>
        </div>

        {connected ? (
          <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
            <div className="flex items-center gap-2 text-emerald-200">
              <CheckCircle2 className="h-4 w-4" />
              <span>
                Session saved
                {savedAt
                  ? ` · ${new Date(savedAt).toLocaleString()}`
                  : ""}
                {checking ? "…" : ""}
              </span>
            </div>
            <Button size="sm" variant="ghost" onClick={() => void disconnect()}>
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </Button>
          </div>
        ) : null}

        <div className="space-y-3">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm text-zinc-400">auth_token</label>
              <button
                type="button"
                className="text-zinc-500 hover:text-zinc-300"
                onClick={() => setShowSecrets((v) => !v)}
              >
                {showSecrets ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
            <Input
              type={showSecrets ? "text" : "password"}
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder={connected ? "Leave blank to reuse saved session" : "Paste auth_token"}
              autoComplete="off"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm text-zinc-400">ct0</label>
            <Input
              type={showSecrets ? "text" : "password"}
              value={ct0}
              onChange={(e) => setCt0(e.target.value)}
              placeholder={connected ? "Leave blank to reuse saved session" : "Paste ct0"}
              autoComplete="off"
            />
          </div>
        </div>

        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">
            Advanced: paste full cookie header / Cookie-Editor JSON
          </summary>
          <Textarea
            className="mt-2"
            rows={3}
            value={advancedCookie}
            onChange={(e) => setAdvancedCookie(e.target.value)}
            placeholder='auth_token=…; ct0=…   or  [{"name":"auth_token","value":"…"}, …]'
          />
        </details>

        <Separator />

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button disabled={!canSync || loading} onClick={() => void sync()}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Syncing from X…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                {connected ? "Sync now" : "Save & sync"}
              </>
            )}
          </Button>
        </div>

        {result ? (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm">
            <p className="font-medium text-zinc-100">Sync complete</p>
            <ul className="mt-2 space-y-1 text-zinc-400">
              <li>
                Fetched from X:{" "}
                <span className="text-zinc-200">{result.fetched ?? result.total}</span>
              </li>
              <li>
                New imports: <span className="text-sky-300">{result.imported}</span>
              </li>
              <li>
                Already in library:{" "}
                <span className="text-zinc-200">{result.skipped}</span>
              </li>
              {result.pages != null ? (
                <li>
                  Pages: <span className="text-zinc-200">{result.pages}</span>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
