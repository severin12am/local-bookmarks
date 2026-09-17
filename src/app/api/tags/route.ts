import { NextRequest, NextResponse } from "next/server";
import { createTag, deleteTag, listTags } from "@/lib/bookmarks-service";

export const runtime = "nodejs";

export async function GET() {
  const tags = await listTags();
  return NextResponse.json(tags);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    const tag = await createTag(body.name, body.color);
    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create tag" },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await deleteTag(id);
  return NextResponse.json({ ok: true });
}
