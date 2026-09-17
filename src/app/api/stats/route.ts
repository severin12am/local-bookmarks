import { NextResponse } from "next/server";
import { getStats } from "@/lib/bookmarks-service";

export const runtime = "nodejs";

export async function GET() {
  const stats = await getStats();
  return NextResponse.json(stats);
}
