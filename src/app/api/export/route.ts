import { NextRequest, NextResponse } from "next/server";
import { bookmarksToMarkdown, exportLibrary, listCollections } from "@/lib/bookmarks-service";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const format = searchParams.get("format") === "md" ? "md" : "json";
    const collectionParam = searchParams.get("collection");
    const collectionIdParam = searchParams.get("collectionId");

    let collectionId: number | undefined;
    let collectionName: string | undefined;

    if (collectionIdParam) {
      collectionId = Number(collectionIdParam);
    } else if (collectionParam) {
      const collections = await listCollections();
      const match = collections.find(
        (c) => c.name.toLowerCase() === collectionParam.toLowerCase()
      );
      if (!match) {
        return NextResponse.json(
          { error: `Collection not found: ${collectionParam}` },
          { status: 404 }
        );
      }
      collectionId = match.id;
      collectionName = match.name;
    }

    const data = await exportLibrary(
      collectionId != null ? { collectionId } : {}
    );

    const slug = (collectionName || collectionParam || "all")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const stamp = new Date().toISOString().slice(0, 10);

    if (format === "md") {
      const title = collectionName
        ? `${collectionName} bookmarks`
        : "All bookmarks";
      const body = bookmarksToMarkdown(data, title);
      return new NextResponse(body, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="bookmarks-${slug}-${stamp}.md"`,
        },
      });
    }

    const body = JSON.stringify(data, null, 2);
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="bookmarks-${slug}-${stamp}.json"`,
      },
    });
  } catch (error) {
    console.error("GET /api/export", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Export failed" },
      { status: 500 }
    );
  }
}
