import { NextRequest, NextResponse } from "next/server";

function allowedOrigin(origin: string): string | null {
  if (/^chrome-extension:\/\//.test(origin)) return origin;
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return origin;
  return null;
}

export function corsHeaders(request: NextRequest): Headers {
  const origin = request.headers.get("origin") ?? "";
  const allow = allowedOrigin(origin);
  const headers = new Headers();
  if (allow) headers.set("Access-Control-Allow-Origin", allow);
  headers.set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  headers.set("Vary", "Origin");
  return headers;
}

export function jsonWithCors(
  request: NextRequest,
  body: unknown,
  status = 200
): NextResponse {
  return NextResponse.json(body, { status, headers: corsHeaders(request) });
}

export function optionsCors(request: NextRequest): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}
