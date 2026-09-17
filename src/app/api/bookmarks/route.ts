import { NextRequest, NextResponse } from "next/server";
import { listBookmarkIds, listBookmarks } from "@/lib/bookmarks-service";
import type { BookmarkFilters } from "@/lib/types";

export const runtime = "nodejs";

function parseFilters(searchParams: URLSearchParams): BookmarkFilters {
  const tagIds = searchParams.get("tagIds");
  const collectionId = searchParams.get("collectionId");

  return {
    q: searchParams.get("q") ?? undefined,
    tagIds: tagIds
      ? tagIds
          .split(",")
          .map(Number)
          .filter((n) => Number.isFinite(n))
      : undefined,
    collectionId:
      collectionId === "none"
        ? null
        : collectionId
          ? Number(collectionId)
          : undefined,
    favorites: searchParams.get("favorites") === "1" ? true : undefined,
    unread: searchParams.get("unread") === "1" ? true : undefined,
    hasMedia: searchParams.get("hasMedia") === "1" ? true : undefined,
    author: searchParams.get("author") ?? undefined,
    dateFrom: searchParams.get("dateFrom") ?? undefined,
    dateTo: searchParams.get("dateTo") ?? undefined,
    sort: (searchParams.get("sort") as BookmarkFilters["sort"]) ?? "newest",
    page: Number(searchParams.get("page") ?? 1),
    limit: Number(searchParams.get("limit") ?? 30),
  };
}

export async function GET(request: NextRequest) {
  try {
    const filters = parseFilters(request.nextUrl.searchParams);
    if (request.nextUrl.searchParams.get("ids") === "1") {
      const result = await listBookmarkIds(filters);
      return NextResponse.json(result);
    }
    const result = await listBookmarks(filters);
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/bookmarks", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list bookmarks" },
      { status: 500 }
    );
  }
}
