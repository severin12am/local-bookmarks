import { NextRequest } from "next/server";
import { importNormalizedBookmarks } from "@/lib/bookmarks-service";
import { jsonWithCors, optionsCors } from "@/lib/cors";
import {
  clearTelegramStore,
  connectTelegramBot,
  loadTelegramStore,
  pullTelegramUpdates,
} from "@/lib/telegram-bot";
import {
  disconnectTelegramUser,
  pullSavedMessages,
  startTelegramLogin,
  submitTelegramCode,
  submitTelegramPassword,
  telegramErrorMessage,
  telegramUserStatus,
} from "@/lib/telegram-user";

export const runtime = "nodejs";
export const maxDuration = 60;

export function OPTIONS(request: NextRequest) {
  return optionsCors(request);
}

function combinedStatus() {
  const user = telegramUserStatus();
  const bot = loadTelegramStore();
  const connected = user.connected || Boolean(bot);
  return {
    connected,
    mode: user.connected ? ("user" as const) : bot ? ("bot" as const) : null,
    username: user.username ?? bot?.username ?? null,
    firstName: user.firstName,
    savedAt: user.savedAt ?? bot?.savedAt ?? null,
    pending: user.pending,
    codeViaApp: user.codeViaApp,
    passwordHint: user.passwordHint,
    hasApi: user.hasApi,
  };
}

export async function GET(request: NextRequest) {
  return jsonWithCors(request, combinedStatus());
}

export async function DELETE(request: NextRequest) {
  await disconnectTelegramUser();
  clearTelegramStore();
  return jsonWithCors(request, { ok: true });
}

async function pullAndImport() {
  const [user, bot] = await Promise.all([
    pullSavedMessages(),
    pullTelegramUpdates(),
  ]);
  const importedBookmarks = [
    ...user.importedBookmarks,
    ...bot.importedBookmarks,
  ];
  const updateCount = user.updateCount + bot.updateCount;
  if (importedBookmarks.length === 0) {
    return {
      imported: 0,
      skipped: 0,
      errors: 0,
      total: 0,
      found: 0,
      updateCount,
    };
  }
  const result = await importNormalizedBookmarks(importedBookmarks);
  return {
    ...result,
    found: importedBookmarks.length,
    updateCount,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      token?: string;
      pull?: boolean;
      phone?: string;
      apiId?: string | number;
      apiHash?: string;
      code?: string;
      password?: string;
    };

    if (body.phone?.trim()) {
      const status = await startTelegramLogin({
        phone: body.phone,
        apiId: body.apiId,
        apiHash: body.apiHash,
      });
      return jsonWithCors(request, { ...combinedStatus(), ...status });
    }

    if (body.code?.trim()) {
      await submitTelegramCode(body.code);
      const status = combinedStatus();
      if (!status.connected) {
        return jsonWithCors(request, status);
      }
      try {
        const pulled = await pullAndImport();
        return jsonWithCors(request, { ...status, ...pulled });
      } catch (error) {
        return jsonWithCors(request, {
          ...status,
          imported: 0,
          skipped: 0,
          errors: 1,
          total: 0,
          found: 0,
          error:
            error instanceof Error
              ? error.message
              : "Signed in, but Saved Messages pull failed",
        });
      }
    }

    if (typeof body.password === "string" && body.password.length > 0) {
      await submitTelegramPassword(body.password);
      const status = combinedStatus();
      try {
        const pulled = await pullAndImport();
        return jsonWithCors(request, { ...status, ...pulled });
      } catch (error) {
        return jsonWithCors(request, {
          ...status,
          imported: 0,
          skipped: 0,
          errors: 1,
          total: 0,
          found: 0,
          error:
            error instanceof Error
              ? error.message
              : "Signed in, but Saved Messages pull failed",
        });
      }
    }

    if (body.token?.trim()) {
      const store = await connectTelegramBot(body.token);
      return jsonWithCors(request, {
        ...combinedStatus(),
        connected: true,
        mode: "bot" as const,
        username: store.username,
        savedAt: store.savedAt,
      });
    }

    const pulled = await pullAndImport();
    return jsonWithCors(request, { ...combinedStatus(), ...pulled });
  } catch (error) {
    console.error("POST /api/telegram", telegramErrorMessage(error));
    return jsonWithCors(
      request,
      {
        error:
          error instanceof Error ? error.message : "Telegram connect failed",
      },
      400
    );
  }
}
