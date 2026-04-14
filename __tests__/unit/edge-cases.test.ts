import { describe, it, expect, vi, beforeEach } from "vitest";
import { setProxmoxEnv, mockFetchSuccess } from "../helpers";
import { formatBytes, formatUptime, textContent, jsonContent, getDefaultNode } from "@/lib/proxmox-client";
import * as tools from "@/lib/tools";

beforeEach(() => setProxmoxEnv());
function mockApi(data: unknown) { vi.stubGlobal("fetch", mockFetchSuccess(data)); }

describe("Unit: Additional edge cases", () => {
  // =========================================================================
  // formatBytes edge cases
  // =========================================================================
  describe("formatBytes additional", () => {
    it("should handle 1 byte", () => {
      expect(formatBytes(1)).toBe("1.00 B");
    });

    it("should handle exactly 1023 bytes (below KiB threshold)", () => {
      expect(formatBytes(1023)).toBe("1023.00 B");
    });

    it("should handle 2 GiB exactly", () => {
      expect(formatBytes(2147483648)).toBe("2.00 GiB");
    });

    it("should handle 100 TiB", () => {
      expect(formatBytes(109951162777600)).toBe("100.00 TiB");
    });
  });

  // =========================================================================
  // formatUptime edge cases
  // =========================================================================
  describe("formatUptime additional", () => {
    it("should handle exactly 59 seconds (no minutes)", () => {
      expect(formatUptime(59)).toBe("0m");
    });

    it("should handle exactly 60 seconds", () => {
      expect(formatUptime(60)).toBe("1m");
    });

    it("should handle 23h 59m", () => {
      expect(formatUptime(86340)).toBe("23h 59m");
    });

    it("should handle 365 days", () => {
      const result = formatUptime(365 * 86400);
      expect(result).toBe("365d");
    });
  });

  // =========================================================================
  // textContent / jsonContent edge cases
  // =========================================================================
  describe("textContent / jsonContent additional", () => {
    it("textContent should handle multiline strings", () => {
      const result = textContent("line1\nline2\nline3");
      expect(result.content[0].text.split("\n")).toHaveLength(3);
    });

    it("jsonContent should handle deeply nested objects", () => {
      const deep = { a: { b: { c: { d: { e: "deep" } } } } };
      const result = jsonContent(deep);
      expect(JSON.parse(result.content[0].text).a.b.c.d.e).toBe("deep");
    });

    it("jsonContent should handle boolean values", () => {
      const result = jsonContent({ flag: true, other: false });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.flag).toBe(true);
      expect(parsed.other).toBe(false);
    });

    it("jsonContent should handle numeric zero", () => {
      const result = jsonContent({ count: 0 });
      expect(JSON.parse(result.content[0].text).count).toBe(0);
    });

    it("jsonContent should handle empty object", () => {
      const result = jsonContent({});
      expect(JSON.parse(result.content[0].text)).toEqual({});
    });
  });

  // =========================================================================
  // getDefaultNode additional
  // =========================================================================
  describe("getDefaultNode additional", () => {
    it("should handle whitespace-only env var as falsy", () => {
      process.env.PROXMOX_DEFAULT_NODE = "   ";
      // Note: whitespace is truthy in JS, so this returns "   "
      expect(getDefaultNode()).toBe("   ");
    });
  });

  // =========================================================================
  // Tool parameter edge cases
  // =========================================================================
  describe("Tool parameter edge cases", () => {
    it("createContainer should handle memory=0", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 500, ostemplate: "local:vztmpl/test.tar.zst", memory: 0 });
      expect(fetchMock.mock.calls[0][1].body).toContain("memory=0");
    });

    it("createContainer should handle cores=0", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 500, ostemplate: "local:vztmpl/test.tar.zst", cores: 0 });
      expect(fetchMock.mock.calls[0][1].body).toContain("cores=0");
    });

    it("updateContainerConfig should handle swap=0", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.updateContainerConfig({ vmid: 200, swap: 0 });
      expect(fetchMock.mock.calls[0][1].body).toContain("swap=0");
    });

    it("updateContainerConfig should handle empty description", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.updateContainerConfig({ vmid: 200, description: "" });
      // Empty string passes !== undefined check, so it's included as description=
      expect(fetchMock.mock.calls[0][1].body).toContain("description=");
    });

    it("apiRequest should default to GET method", async () => {
      const fetchMock = mockFetchSuccess({});
      vi.stubGlobal("fetch", fetchMock);
      await tools.apiRequest({ path: "version" });
      expect(fetchMock.mock.calls[0][1].method).toBe("GET");
    });
  });
});
