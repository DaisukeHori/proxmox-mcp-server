/**
 * Simple API Key Authentication for MCP Server
 *
 * MCP_API_KEY 環境変数と Authorization ヘッダーの Bearer トークンを比較。
 * hubspot-ma-mcp / gemini-image-mcp と同じパターン。
 */

import { NextRequest, NextResponse } from "next/server";

export function verifyApiKey(request: NextRequest): boolean {
  const apiKey = process.env.MCP_API_KEY;

  // If no API key is configured, skip auth (development mode)
  if (!apiKey) {
    console.warn("[auth] MCP_API_KEY not set — running without authentication");
    return true;
  }

  // Check Authorization: Bearer <key>
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (token === apiKey) return true;
  }

  // Check X-API-Key header (fallback)
  const xApiKey = request.headers.get("x-api-key");
  if (xApiKey === apiKey) return true;

  // Check query parameter (for SSE connections)
  const url = new URL(request.url);
  const queryKey = url.searchParams.get("api_key");
  if (queryKey === apiKey) return true;

  return false;
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json(
    { error: "Unauthorized — invalid or missing API key" },
    { status: 401 }
  );
}
