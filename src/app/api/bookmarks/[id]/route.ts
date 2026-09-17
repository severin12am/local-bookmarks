import { NextRequest, NextResponse } from "next/server";
import { deleteBookmarks, getBookmark, updateBookmark } from "@/lib/bookmarks-service";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  const bookmark = await getBookmark(Number(id));
  if (!bookmark) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(bookmark);
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();
    const updated = await updateBookmark(Number(id), body);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    console.error("PATCH /api/bookmarks/[id]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update bookmark" },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  const { id } = await params;
  await deleteBookmarks([Number(id)]);
  return NextResponse.json({ ok: true });
}
