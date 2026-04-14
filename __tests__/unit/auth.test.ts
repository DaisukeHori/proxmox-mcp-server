import { describe, it, expect } from "vitest";
import { verifyApiKey, unauthorizedResponse } from "@/lib/auth";
import { createMockRequest } from "../helpers";

describe("auth", () => {
  // =========================================================================
  // verifyApiKey - no key configured (dev mode)
  // =========================================================================
  describe("verifyApiKey - no MCP_API_KEY set", () => {
    it("should allow request when MCP_API_KEY not configured", () => {
      const req = createMockRequest();
      expect(verifyApiKey(req as never)).toBe(true);
    });

    it("should allow request with no headers when no key configured", () => {
      const req = createMockRequest({ headers: {} });
      expect(verifyApiKey(req as never)).toBe(true);
    });

    it("should allow even empty request when no key configured", () => {
      const req = createMockRequest({ url: "https://test.vercel.app/api/mcp" });
      expect(verifyApiKey(req as never)).toBe(true);
    });
  });

  // =========================================================================
  // verifyApiKey - Bearer token
  // =========================================================================
  describe("verifyApiKey - Authorization Bearer", () => {
    it("should accept valid Bearer token", () => {
      process.env.MCP_API_KEY = "pmcp-test-key-123";
      const req = createMockRequest({ headers: { authorization: "Bearer pmcp-test-key-123" } });
      expect(verifyApiKey(req as never)).toBe(true);
    });

    it("should accept case-insensitive Bearer prefix", () => {
      process.env.MCP_API_KEY = "pmcp-test-key-123";
      const req = createMockRequest({ headers: { authorization: "bearer pmcp-test-key-123" } });
      expect(verifyApiKey(req as never)).toBe(true);
    });

    it("should reject invalid Bearer token", () => {
      process.env.MCP_API_KEY = "pmcp-test-key-123";
      const req = createMockRequest({ headers: { authorization: "Bearer wrong-key" } });
      expect(verifyApiKey(req as never)).toBe(false);
    });

    it("should reject empty Bearer token", () => {
      process.env.MCP_API_KEY = "pmcp-test-key-123";
      const req = createMockRequest({ headers: { authorization: "Bearer " } });
      expect(verifyApiKey(req as never)).toBe(false);
    });

    it("should accept Bearer with extra spaces (regex strips leading whitespace)", () => {
      process.env.MCP_API_KEY = "pmcp-test-key-123";
      // The \s+ regex in replace strips all whitespace after Bearer, so double-space works
      const req = createMockRequest({ headers: { authorization: "Bearer  pmcp-test-key-123" } });
      expect(verifyApiKey(req as never)).toBe(true);
    });
  });

  // =========================================================================
  // verifyApiKey - X-API-Key header
  // =========================================================================
  describe("verifyApiKey - X-API-Key header", () => {
    it("should accept valid X-API-Key", () => {
      process.env.MCP_API_KEY = "pmcp-test-key-456";
      const req = createMockRequest({ headers: { "x-api-key": "pmcp-test-key-456" } });
      expect(verifyApiKey(req as never)).toBe(true);
    });

    it("should reject invalid X-API-Key", () => {
      process.env.MCP_API_KEY = "pmcp-test-key-456";
      const req = createMockRequest({ headers: { "x-api-key": "wrong" } });
      expect(verifyApiKey(req as never)).toBe(false);
    });

    it("should reject empty X-API-Key", () => {
      process.env.MCP_API_KEY = "pmcp-test-key-456";
      const req = createMockRequest({ headers: { "x-api-key": "" } });
      expect(verifyApiKey(req as never)).toBe(false);
    });
  });

  // =========================================================================
  // verifyApiKey - query parameter
  // =========================================================================
  describe("verifyApiKey - api_key query param", () => {
    it("should accept valid query param api_key", () => {
      process.env.MCP_API_KEY = "pmcp-test-key-789";
      const req = createMockRequest({ url: "https://test.vercel.app/api/sse?api_key=pmcp-test-key-789" });
      expect(verifyApiKey(req as never)).toBe(true);
    });

    it("should reject invalid query param", () => {
      process.env.MCP_API_KEY = "pmcp-test-key-789";
      const req = createMockRequest({ url: "https://test.vercel.app/api/sse?api_key=wrong" });
      expect(verifyApiKey(req as never)).toBe(false);
    });

    it("should reject missing query param", () => {
      process.env.MCP_API_KEY = "pmcp-test-key-789";
      const req = createMockRequest({ url: "https://test.vercel.app/api/sse" });
      expect(verifyApiKey(req as never)).toBe(false);
    });

    it("should handle multiple query params", () => {
      process.env.MCP_API_KEY = "pmcp-test-key-789";
      const req = createMockRequest({ url: "https://test.vercel.app/api/sse?foo=bar&api_key=pmcp-test-key-789" });
      expect(verifyApiKey(req as never)).toBe(true);
    });
  });

  // =========================================================================
  // verifyApiKey - no auth provided
  // =========================================================================
  describe("verifyApiKey - no auth", () => {
    it("should reject when no auth provided but key is configured", () => {
      process.env.MCP_API_KEY = "pmcp-test-key-000";
      const req = createMockRequest();
      expect(verifyApiKey(req as never)).toBe(false);
    });

    it("should reject with unrelated headers", () => {
      process.env.MCP_API_KEY = "pmcp-test-key-000";
      const req = createMockRequest({ headers: { "content-type": "application/json" } });
      expect(verifyApiKey(req as never)).toBe(false);
    });
  });

  // =========================================================================
  // unauthorizedResponse
  // =========================================================================
  describe("unauthorizedResponse", () => {
    it("should return 401 status", () => {
      const res = unauthorizedResponse();
      expect(res.status).toBe(401);
    });

    it("should include error message in body", async () => {
      const res = unauthorizedResponse();
      const body = await res.json();
      expect(body.error).toContain("Unauthorized");
    });
  });
});
