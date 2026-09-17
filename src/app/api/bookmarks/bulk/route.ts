import { NextRequest, NextResponse } from "next/server";
import { bulkUpdateBookmarks } from "@/lib/bookmarks-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!Array.isArray(body.ids) || body.ids.length === 0) {
      return NextResponse.json({ error: "ids required" }, { status: 400 });
    }
    const result = await bulkUpdateBookmarks(body);
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/bookmarks/bulk", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bulk update failed" },
      { status: 500 }
    );
  }
}
