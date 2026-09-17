import { NextRequest, NextResponse } from "next/server";
import { categorizeLibrary } from "@/lib/bookmarks-service";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await categorizeLibrary({
      onlyUncategorized: body.onlyUncategorized !== false,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("POST /api/categorize", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to categorize bookmarks",
      },
      { status: 500 }
    );
  }
}
