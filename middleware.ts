import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  // Only protect /api/* routes
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  const apiKey = process.env.MCP_API_KEY;

  // Skip auth if no key configured (dev mode)
  if (!apiKey) {
    return NextResponse.next();
  }

  // Check Authorization: Bearer <key>
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token === apiKey) return NextResponse.next();
  }

  // Check X-API-Key header
  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey === apiKey) return NextResponse.next();

  // Check query parameter (for SSE connections from Claude.ai)
  const queryKey = request.nextUrl.searchParams.get("api_key");
  if (queryKey === apiKey) return NextResponse.next();

  return NextResponse.json(
    { error: "Unauthorized — invalid or missing API key" },
    { status: 401 }
  );
}

export const config = {
  matcher: "/api/:path*",
};
