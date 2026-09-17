import { NextRequest, NextResponse } from "next/server";
import { importNormalizedBookmarks } from "@/lib/bookmarks-service";
import { fetchAllBookmarks } from "@/lib/x/client";
import {
  clearCredentials,
  loadCredentials,
  parseCredentialInput,
  saveCredentials,
} from "@/lib/x/credentials";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET() {
  const creds = loadCredentials();
  return NextResponse.json({
    connected: Boolean(creds),
    savedAt: creds?.savedAt ?? null,
  });
}

export async function DELETE() {
  clearCredentials();
  return NextResponse.json({ ok: true });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));

    if (body.saveOnly) {
      const parsed = parseCredentialInput(body);
      if (!parsed) {
        return NextResponse.json(
          { error: "Provide authToken + ct0, or a cookie string / Cookie-Editor JSON" },
          { status: 400 }
        );
      }
      const saved = saveCredentials(parsed.authToken, parsed.ct0);
      return NextResponse.json({
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
      return NextResponse.json(
        {
          error:
            "Fetched 0 bookmarks. Check that your session cookies are valid and you have bookmarks on x.com/i/bookmarks.",
          fetched: 0,
          pages,
        },
        { status: 400 }
      );
    }

    const result = await importNormalizedBookmarks(bookmarks);
    return NextResponse.json({
      ...result,
      fetched: bookmarks.length,
      pages,
    });
  } catch (error) {
    console.error("POST /api/sync/x", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync bookmarks from X",
      },
      { status: 400 }
    );
  }
}
