import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const apiKey = process.env.MCP_API_KEY;
  if (!apiKey) return NextResponse.next();

  // Bearer token
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token === apiKey) return NextResponse.next();
  }

  // X-API-Key header
  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey === apiKey) return NextResponse.next();

  // Query parameter (for Claude.ai SSE connections)
  const queryKey = request.nextUrl.searchParams.get("api_key");
  if (queryKey === apiKey) return NextResponse.next();

  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: "/api/:path*",
};
