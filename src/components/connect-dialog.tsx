"use client";

import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  CheckCircle2,
  Loader2,
  Plug,
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
import {
  InstagramConnectSteps,
  TelegramConnectSteps,
  XConnectSteps,
} from "@/components/connect-steps";

export type ConnectTab = "x" | "telegram" | "instagram";

type Props = {
  onChanged: () => void;
  startTab?: ConnectTab;
  trigger?: ReactNode;
};

type LibraryImportResult = ImportResult & { found?: number; source?: string };

const TABS: { id: ConnectTab; label: string }[] = [
  { id: "x", label: "X" },
  { id: "telegram", label: "Telegram" },
  { id: "instagram", label: "Instagram" },
];

export function ConnectDialog({
  onChanged,
  startTab = "x",
  trigger,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ConnectTab>(startTab);
  const [xConnected, setXConnected] = useState(false);
  const [xSavedAt, setXSavedAt] = useState<string | null>(null);
  const [xPaste, setXPaste] = useState("");
  const [xLoading, setXLoading] = useState(false);

  const [tgConnected, setTgConnected] = useState(false);
  const [tgMode, setTgMode] = useState<"user" | "bot" | null>(null);
  const [tgUsername, setTgUsername] = useState<string | null>(null);
  const [tgToken, setTgToken] = useState("");
  const [tgLoading, setTgLoading] = useState(false);
  const [tgPhone, setTgPhone] = useState("");
  const [tgApiId, setTgApiId] = useState("");
  const [tgApiHash, setTgApiHash] = useState("");
  const [tgCode, setTgCode] = useState("");
  const [tgPassword, setTgPassword] = useState("");
  const [tgPending, setTgPending] = useState<"code" | "password" | null>(null);
  const [tgCodeViaApp, setTgCodeViaApp] = useState(false);
  const [tgPasswordHint, setTgPasswordHint] = useState<string | null>(null);
  const [tgHasApi, setTgHasApi] = useState(false);

  const [igText, setIgText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<LibraryImportResult | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function applyTelegramStatus(tg: {
    connected: boolean;
    mode?: "user" | "bot" | null;
    username: string | null;
    pending?: "code" | "password" | null;
    codeViaApp?: boolean;
    passwordHint?: string | null;
    hasApi?: boolean;
  }) {
    setTgConnected(tg.connected);
    setTgMode(tg.mode ?? (tg.connected ? "bot" : null));
    setTgUsername(tg.username);
    setTgPending(tg.pending ?? null);
    setTgCodeViaApp(Boolean(tg.codeViaApp));
    setTgPasswordHint(tg.passwordHint ?? null);
    setTgHasApi(Boolean(tg.hasApi));
  }

  async function refreshStatus() {
    try {
      const [x, tg] = await Promise.all([api.syncStatus(), api.telegramStatus()]);
      setXConnected(x.connected);
      setXSavedAt(x.savedAt);
      applyTelegramStatus(tg);
    } catch {
      setXConnected(false);
      setTgConnected(false);
      setTgMode(null);
      setTgPending(null);
    }
  }

  useEffect(() => {
    if (open) void refreshStatus();
  }, [open]);

  async function syncX() {
    setXLoading(true);
    try {
      const res = await api.syncFromX(
        xPaste.trim() ? { cookie: xPaste, save: true } : { save: true }
      );
      toast.success(
        `X: ${res.imported} new` + (res.skipped ? `, ${res.skipped} already saved` : "")
      );
      setXPaste("");
      await refreshStatus();
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "X sync failed");
    } finally {
      setXLoading(false);
    }
  }

  async function connectTelegram() {
    if (!tgToken.trim()) {
      toast.error("Paste the bot token from @BotFather");
      return;
    }
    setTgLoading(true);
    try {
      const res = await api.telegramConnect(tgToken);
      setTgToken("");
      applyTelegramStatus({ ...res, pending: null });
      toast.success(
        res.username
          ? `Connected @${res.username}`
          : "Telegram bot connected"
      );
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Telegram connect failed");
    } finally {
      setTgLoading(false);
    }
  }

  async function pullTelegram() {
    setTgLoading(true);
    try {
      const res = await api.telegramPull();
      if (res.imported) {
        toast.success(`Telegram: ${res.imported} new`);
        onChanged();
      } else {
        toast.message(
          tgMode === "user"
            ? "Nothing new in Saved Messages."
            : "Nothing new. Save something in Telegram, then pull."
        );
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Telegram pull failed");
    } finally {
      setTgLoading(false);
    }
  }

  async function startTelegramUser() {
    if (!tgPhone.trim()) {
      toast.error("Enter your phone number");
      return;
    }
    if (!tgHasApi && (!tgApiId.trim() || !tgApiHash.trim())) {
      toast.error("Paste api_id and api_hash from my.telegram.org");
      return;
    }
    setTgLoading(true);
    try {
      const res = await api.telegramStartLogin({
        phone: tgPhone,
        apiId: tgApiId.trim() || undefined,
        apiHash: tgApiHash.trim() || undefined,
      });
      applyTelegramStatus({
        connected: res.connected,
        username: null,
        pending: res.pending,
        codeViaApp: res.codeViaApp,
        passwordHint: res.passwordHint,
        hasApi: res.hasApi,
      });
      setTgCode("");
      setTgPassword("");
      toast.success(
        res.codeViaApp
          ? "Code sent in Telegram. Enter it below."
          : "Code sent. Enter the SMS/Telegram code below."
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Telegram login failed");
    } finally {
      setTgLoading(false);
    }
  }

  function toastTelegramImport(
    res: ImportResult & {
      found?: number;
      username?: string | null;
      error?: string;
    }
  ) {
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.imported) {
      toast.success(
        `Saved Messages: ${res.imported} new` +
          (res.skipped ? `, ${res.skipped} already saved` : "")
      );
      onChanged();
    } else {
      toast.success(
        res.username ? `Signed in as @${res.username}` : "Telegram signed in"
      );
    }
  }

  async function submitTelegramCode() {
    if (!tgCode.trim()) {
      toast.error("Enter the login code");
      return;
    }
    setTgLoading(true);
    try {
      const res = await api.telegramSubmitCode(tgCode);
      setTgCode("");
      applyTelegramStatus({
        connected: res.connected,
        username: res.username ?? null,
        pending: res.pending,
        passwordHint: res.passwordHint,
        hasApi: true,
        mode: res.connected ? "user" : null,
      });
      if (res.pending === "password") {
        toast.message("Enter your two-step password");
        return;
      }
      toastTelegramImport(res);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Code check failed");
    } finally {
      setTgLoading(false);
    }
  }

  async function submitTelegramPassword() {
    if (!tgPassword) {
      toast.error("Enter your two-step password");
      return;
    }
    setTgLoading(true);
    try {
      const res = await api.telegramSubmitPassword(tgPassword);
      setTgPassword("");
      applyTelegramStatus({
        connected: res.connected,
        username: res.username ?? null,
        pending: null,
        hasApi: true,
        mode: res.connected ? "user" : null,
      });
      toastTelegramImport(res);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Password check failed");
    } finally {
      setTgLoading(false);
    }
  }

  async function importDropped() {
    if (!igText.trim() && files.length === 0) {
      toast.error("Paste links or drop a file");
      return;
    }
    setImporting(true);
    setImportResult(null);
    try {
      const res = await api.importLibrary({ text: igText, files });
      setImportResult(res);
      toast.success(
        `Imported ${res.imported}` +
          (res.skipped ? ` (${res.skipped} already saved)` : "")
      );
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setTab(startTab);
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plug className="h-4 w-4" />
            Connect
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Connect sources</DialogTitle>
          <DialogDescription>
            Follow the steps for one source. Nothing is uploaded — it stays on
            this computer.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900/50 p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`flex-1 rounded-md px-2 py-1.5 text-sm transition-colors ${
                tab === item.id
                  ? "bg-zinc-800 text-zinc-50"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "x" ? (
          <div className="space-y-3">
            <XConnectSteps />

            {xConnected ? (
              <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  X session saved
                  {xSavedAt ? ` · ${new Date(xSavedAt).toLocaleString()}` : ""}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await api.clearSyncCredentials();
                    setXConnected(false);
                    toast.success("Cleared X session");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : null}

            <details className="text-sm">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">
                Or paste cookies
              </summary>
              <Textarea
                className="mt-2 font-mono text-xs"
                rows={4}
                value={xPaste}
                onChange={(e) => setXPaste(e.target.value)}
                placeholder="Cookie header, Cookie-Editor JSON, or auth_token and ct0 on two lines"
              />
            </details>

            <Button
              disabled={xLoading || (!xConnected && !xPaste.trim())}
              onClick={() => void syncX()}
            >
              {xLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              {xConnected && !xPaste.trim() ? "Sync now" : "Save & sync"}
            </Button>
          </div>
        ) : null}

        {tab === "telegram" ? (
          <div className="space-y-3">
            {!tgConnected && !tgPending ? <TelegramConnectSteps /> : null}
            {tgPending === "code" || tgPending === "password" ? null : tgConnected ? (
              <p className="text-sm text-zinc-400">
                Signed in. New Saved Messages are pulled while this app is running.
              </p>
            ) : null}

            {tgConnected ? (
              <div className="flex items-center justify-between rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  {tgMode === "user"
                    ? tgUsername
                      ? `Reading Saved Messages as @${tgUsername}`
                      : "Reading Saved Messages"
                    : tgUsername
                      ? `Bot @${tgUsername}`
                      : "Bot connected"}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await api.telegramDisconnect();
                    setTgConnected(false);
                    setTgMode(null);
                    setTgUsername(null);
                    setTgPending(null);
                    toast.success("Disconnected Telegram");
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : tgPending === "code" ? (
              <div className="space-y-2">
                <p className="text-sm text-zinc-300">
                  {tgCodeViaApp
                    ? "Telegram sent a code in the app. Paste it here."
                    : "Paste the login code Telegram just sent."}
                </p>
                <div className="flex gap-2">
                  <Input
                    value={tgCode}
                    onChange={(e) => setTgCode(e.target.value)}
                    placeholder="12345"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitTelegramCode();
                    }}
                  />
                  <Button disabled={tgLoading} onClick={() => void submitTelegramCode()}>
                    {tgLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                  </Button>
                </div>
              </div>
            ) : tgPending === "password" ? (
              <div className="space-y-2">
                <p className="text-sm text-zinc-300">
                  Two-step password
                  {tgPasswordHint ? ` · hint: ${tgPasswordHint}` : ""}
                </p>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={tgPassword}
                    onChange={(e) => setTgPassword(e.target.value)}
                    placeholder="Password"
                    autoComplete="current-password"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submitTelegramPassword();
                    }}
                  />
                  <Button
                    disabled={tgLoading}
                    onClick={() => void submitTelegramPassword()}
                  >
                    {tgLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Input
                  value={tgPhone}
                  onChange={(e) => setTgPhone(e.target.value)}
                  placeholder="+15551234567"
                  autoComplete="tel"
                />
                {tgHasApi ? (
                  <p className="text-xs text-zinc-600">
                    API credentials are already saved on this computer.
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      value={tgApiId}
                      onChange={(e) => setTgApiId(e.target.value)}
                      placeholder="api_id"
                      inputMode="numeric"
                      autoComplete="off"
                    />
                    <Input
                      type="password"
                      value={tgApiHash}
                      onChange={(e) => setTgApiHash(e.target.value)}
                      placeholder="api_hash"
                      autoComplete="off"
                    />
                  </div>
                )}
                <Button disabled={tgLoading} onClick={() => void startTelegramUser()}>
                  {tgLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send code"}
                </Button>
              </div>
            )}

            {tgConnected ? (
              <Button
                variant="secondary"
                disabled={tgLoading}
                onClick={() => void pullTelegram()}
              >
                {tgLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {tgMode === "user" ? "Sync Saved Messages" : "Pull new forwards"}
              </Button>
            ) : null}

            <details className="text-sm">
              <summary className="cursor-pointer text-zinc-500 hover:text-zinc-300">
                Bot fallback (forward messages)
              </summary>
              <div className="mt-2 space-y-2">
                <p className="text-xs text-zinc-500">
                  A bot cannot open Saved Messages. Only use this if you want to
                  forward selected chats to a bot instead of signing in.
                </p>
                <div className="flex gap-2">
                  <Input
                    type="password"
                    value={tgToken}
                    onChange={(e) => setTgToken(e.target.value)}
                    placeholder="123456:ABC-bot-token"
                    autoComplete="off"
                  />
                  <Button disabled={tgLoading} onClick={() => void connectTelegram()}>
                    {tgLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Connect bot"}
                  </Button>
                </div>
              </div>
            </details>

            <p className="text-xs text-zinc-600">
              Full history dump: drop Telegram Desktop{" "}
              <code>result.json</code> below (Settings → Advanced → Export).
            </p>
            <DropZone
              dragging={dragging}
              setDragging={setDragging}
              files={files}
              setFiles={setFiles}
              fileRef={fileRef}
              text={igText}
              setText={setIgText}
              placeholder="Or paste t.me links"
            />
            <Button disabled={importing} onClick={() => void importDropped()}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Import file / links
            </Button>
            {importResult ? (
              <p className="text-xs text-zinc-500">
                Found {importResult.found ?? importResult.total} · imported{" "}
                {importResult.imported}
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === "instagram" ? (
          <div className="space-y-3">
            <InstagramConnectSteps />
            <DropZone
              dragging={dragging}
              setDragging={setDragging}
              files={files}
              setFiles={setFiles}
              fileRef={fileRef}
              text={igText}
              setText={setIgText}
              placeholder={"https://www.instagram.com/reel/…"}
            />
            <Button disabled={importing} onClick={() => void importDropped()}>
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Import reels
            </Button>
            {importResult ? (
              <p className="text-xs text-zinc-500">
                Found {importResult.found ?? importResult.total} · imported{" "}
                {importResult.imported}
              </p>
            ) : null}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function DropZone({
  dragging,
  setDragging,
  files,
  setFiles,
  fileRef,
  text,
  setText,
  placeholder,
}: {
  dragging: boolean;
  setDragging: (v: boolean) => void;
  files: File[];
  setFiles: (files: File[]) => void;
  fileRef: RefObject<HTMLInputElement | null>;
  text: string;
  setText: (v: string) => void;
  placeholder: string;
}) {
  return (
    <>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        className="min-h-24 font-mono text-xs"
      />
      <div
        className={`rounded-xl border border-dashed px-4 py-4 text-center text-sm transition-colors ${
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
          setFiles([
            ...files,
            ...Array.from(e.dataTransfer.files ?? []),
          ]);
        }}
      >
        <button
          type="button"
          className="text-sky-400 hover:text-sky-300"
          onClick={() => fileRef.current?.click()}
        >
          Choose file
        </button>
        <span className="text-zinc-500"> or drop result.json / XML / HTML</span>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept=".json,.xml,.txt,.html,application/json,text/xml,text/plain,text/html"
          className="hidden"
          onChange={(e) => {
            setFiles([...files, ...Array.from(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        {files.length > 0 ? (
          <p className="mt-2 truncate text-xs text-zinc-500">
            {files.map((f) => f.name).join(", ")}
          </p>
        ) : null}
      </div>
    </>
  );
}
