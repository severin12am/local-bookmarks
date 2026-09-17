import { NextRequest, NextResponse } from "next/server";
import {
  createCollection,
  deleteCollection,
  listCollections,
  updateCollection,
} from "@/lib/bookmarks-service";

export const runtime = "nodejs";

export async function GET() {
  const collections = await listCollections();
  return NextResponse.json(collections);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.name?.trim()) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    const collection = await createCollection(body.name, body.parentId ?? null);
    return NextResponse.json(collection, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to create collection",
      },
      { status: 400 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const updated = await updateCollection(Number(body.id), body);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to update collection",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  await deleteCollection(id);
  return NextResponse.json({ ok: true });
}
