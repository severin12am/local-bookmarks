import { NextRequest, NextResponse } from "next/server";
import { importNormalizedBookmarks } from "@/lib/bookmarks-service";
import { parseAnyImport } from "@/lib/import-any";

export const runtime = "nodejs";
export const maxDuration = 120;

async function readChunks(request: NextRequest): Promise<string[]> {
  const contentType = request.headers.get("content-type") ?? "";
  const chunks: string[] = [];

  if (contentType.includes("multipart/form-data")) {
    const form = await request.formData();
    const pasted = form.get("text");
    if (typeof pasted === "string" && pasted.trim()) chunks.push(pasted);
    for (const value of form.getAll("file")) {
      if (value instanceof File) chunks.push(await value.text());
    }
    return chunks;
  }

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    if (typeof body === "string") {
      chunks.push(body);
      return chunks;
    }
    if (body && typeof body === "object" && typeof (body as { text?: unknown }).text === "string") {
      chunks.push((body as { text: string }).text);
      return chunks;
    }
    chunks.push(JSON.stringify(body));
    return chunks;
  }

  const text = await request.text();
  if (text.trim()) chunks.push(text);
  return chunks;
}

export async function POST(request: NextRequest) {
  try {
    const chunks = await readChunks(request);
    if (!chunks.some((c) => c.trim())) {
      return NextResponse.json(
        {
          error:
            "Paste links or drop a file: Telegram result.json, Instagram URLs, SMS backup, or X JSON.",
        },
        { status: 400 }
      );
    }

    const parsed = await parseAnyImport(chunks);
    if (parsed.bookmarks.length === 0) {
      return NextResponse.json(
        {
          error:
            parsed.warning ||
            "Nothing to import. Use Telegram Saved Messages result.json, Instagram reel links, an SMS backup, or X bookmarks JSON.",
          found: 0,
          imported: 0,
          skipped: 0,
          errors: 0,
          total: 0,
          source: parsed.source,
        },
        { status: 400 }
      );
    }

    const result = await importNormalizedBookmarks(parsed.bookmarks);
    return NextResponse.json({
      ...result,
      found: parsed.bookmarks.length,
      source: parsed.source,
    });
  } catch (error) {
    console.error("POST /api/import", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to import. Check the file or paste and try again.",
      },
      { status: 400 }
    );
  }
}
