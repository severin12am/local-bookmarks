import { NextRequest } from "next/server";
import { importNormalizedBookmarks } from "@/lib/bookmarks-service";
import { jsonWithCors, optionsCors } from "@/lib/cors";
import { fetchAllBookmarks } from "@/lib/x/client";
import {
  clearCredentials,
  loadCredentials,
  parseCredentialInput,
  saveCredentials,
} from "@/lib/x/credentials";

export const runtime = "nodejs";
export const maxDuration = 300;

export function OPTIONS(request: NextRequest) {
  return optionsCors(request);
}

export async function GET(request: NextRequest) {
  const creds = loadCredentials();
  return jsonWithCors(request, {
    connected: Boolean(creds),
    savedAt: creds?.savedAt ?? null,
  });
}

export async function DELETE(request: NextRequest) {
  clearCredentials();
  return jsonWithCors(request, { ok: true });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    if (body.saveOnly) {
      const parsed = parseCredentialInput(body);
      if (!parsed) {
        return jsonWithCors(
          request,
          {
            error:
              "Paste cookies, Cookie-Editor JSON, or auth_token + ct0.",
          },
          400
        );
      }
      const saved = saveCredentials(parsed.authToken, parsed.ct0);
      return jsonWithCors(request, {
        connected: true,
        savedAt: saved.savedAt,
      });
    }

    const { bookmarks, pages } = await fetchAllBookmarks({
      authToken: body.authToken,
      ct0: body.ct0,
      cookie: body.cookie,
      bookmarksQueryId: body.bookmarksQueryId,
      save: body.save !== false,
      maxPages: typeof body.maxPages === "number" ? body.maxPages : undefined,
    });

    if (bookmarks.length === 0) {
      return jsonWithCors(
        request,
        {
          error:
            "Fetched 0 bookmarks. Stay logged into x.com and sync again (extension or cookies).",
          fetched: 0,
          pages,
        },
        400
      );
    }

    const result = await importNormalizedBookmarks(bookmarks);
    return jsonWithCors(request, {
      ...result,
      fetched: bookmarks.length,
      pages,
    });
  } catch (error) {
    console.error("POST /api/sync/x", error);
    return jsonWithCors(
      request,
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync bookmarks from X",
      },
      400
    );
  }
}
