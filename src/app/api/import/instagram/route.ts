import { NextRequest, NextResponse } from "next/server";
import { importNormalizedBookmarks } from "@/lib/bookmarks-service";
import { extractInstagramLinks } from "@/lib/instagram-links";
import { instagramLinksToBookmarks } from "@/lib/instagram-import";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") ?? "";
    let raw = "";

    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      const pasted = form.get("text");
      if (typeof pasted === "string" && pasted.trim()) raw = pasted;
      if (file instanceof File) {
        raw = `${raw}\n${await file.text()}`;
      }
    } else {
      const body = await request.json().catch(() => ({}));
      raw = typeof body.text === "string" ? body.text : "";
    }

    if (!raw.trim()) {
      return NextResponse.json(
        { error: "Paste Instagram links or drop a Messages / SMS backup file." },
        { status: 400 }
      );
    }

    const found = extractInstagramLinks(raw);
    if (found.length === 0) {
      return NextResponse.json(
        {
          error:
            "No Instagram reel/post links found. Paste instagram.com/reel/… URLs or an SMS Backup XML.",
          found: 0,
          imported: 0,
          skipped: 0,
          errors: 0,
          total: 0,
        },
        { status: 400 }
      );
    }

    const parsed = await instagramLinksToBookmarks(raw);
    const result = await importNormalizedBookmarks(parsed);
    return NextResponse.json({ ...result, found: found.length });
  } catch (error) {
    console.error("POST /api/import/instagram", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to import Instagram links",
      },
      { status: 500 }
    );
  }
}
