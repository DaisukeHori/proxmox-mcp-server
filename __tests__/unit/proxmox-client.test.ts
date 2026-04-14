import { describe, it, expect, vi, beforeEach } from "vitest";
import { setProxmoxEnv, mockFetchSuccess, mockFetchError, mockFetchNetworkError } from "../helpers";

// We need to import after env is set, so use dynamic import pattern
// But for formatBytes/formatUptime/textContent/jsonContent we can import directly
import { formatBytes, formatUptime, textContent, jsonContent, getDefaultNode } from "@/lib/proxmox-client";

describe("proxmox-client", () => {
  // =========================================================================
  // getConfig (tested indirectly via proxmoxRequest)
  // =========================================================================
  describe("getConfig / environment validation", () => {
    it("should throw when PROXMOX_BASE_URL is missing", async () => {
      process.env.PROXMOX_TOKEN_ID = "test@pve!token";
      process.env.PROXMOX_TOKEN_SECRET = "secret";
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await expect(proxmoxRequest("nodes")).rejects.toThrow("Missing Proxmox configuration");
    });

    it("should throw when PROXMOX_TOKEN_ID is missing", async () => {
      process.env.PROXMOX_BASE_URL = "https://test.local";
      process.env.PROXMOX_TOKEN_SECRET = "secret";
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await expect(proxmoxRequest("nodes")).rejects.toThrow("Missing Proxmox configuration");
    });

    it("should throw when PROXMOX_TOKEN_SECRET is missing", async () => {
      process.env.PROXMOX_BASE_URL = "https://test.local";
      process.env.PROXMOX_TOKEN_ID = "test@pve!token";
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await expect(proxmoxRequest("nodes")).rejects.toThrow("Missing Proxmox configuration");
    });

    it("should throw when all env vars are missing", async () => {
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await expect(proxmoxRequest("nodes")).rejects.toThrow("Missing Proxmox configuration");
    });

    it("should not throw when all required env vars are set", async () => {
      setProxmoxEnv();
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await expect(proxmoxRequest("nodes")).resolves.toBeDefined();
    });

    it("should strip trailing slashes from base URL", async () => {
      setProxmoxEnv({ PROXMOX_BASE_URL: "https://test.local///" });
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes");
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("https://test.local/api2/json/nodes"),
        expect.anything()
      );
    });

    it("should strip leading slashes from path", async () => {
      setProxmoxEnv();
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("///nodes");
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api2/json/nodes"),
        expect.anything()
      );
    });

    it("should use correct Authorization header format", async () => {
      setProxmoxEnv({ PROXMOX_TOKEN_ID: "user@pve!tok", PROXMOX_TOKEN_SECRET: "abc-123" });
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes");
      const callHeaders = fetchMock.mock.calls[0][1].headers;
      expect(callHeaders.Authorization).toBe("PVEAPIToken=user@pve!tok=abc-123");
    });
  });

  // =========================================================================
  // proxmoxRequest - GET
  // =========================================================================
  describe("proxmoxRequest GET", () => {
    beforeEach(() => setProxmoxEnv());

    it("should make GET request by default", async () => {
      const fetchMock = mockFetchSuccess({ version: "8.0" });
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("version");
      expect(fetchMock.mock.calls[0][1].method).toBe("GET");
    });

    it("should unwrap data from response", async () => {
      const fetchMock = mockFetchSuccess({ version: "8.0" });
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      const result = await proxmoxRequest("version");
      expect(result).toEqual({ version: "8.0" });
    });

    it("should handle array response data", async () => {
      const fetchMock = mockFetchSuccess([{ node: "pve" }]);
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      const result = await proxmoxRequest("nodes");
      expect(result).toEqual([{ node: "pve" }]);
    });

    it("should handle empty array response", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      const result = await proxmoxRequest("nodes/pve/qemu");
      expect(result).toEqual([]);
    });

    it("should handle null data response", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      const result = await proxmoxRequest("nodes/pve/status");
      expect(result).toBeNull();
    });

    it("should not send Content-Type for GET", async () => {
      const fetchMock = mockFetchSuccess({});
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes");
      expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBeUndefined();
    });

    it("should not send body for GET", async () => {
      const fetchMock = mockFetchSuccess({});
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes");
      expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    });

    it("should construct correct URL for nested paths", async () => {
      const fetchMock = mockFetchSuccess({});
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/qemu/100/status/current");
      expect(fetchMock.mock.calls[0][0]).toContain("/api2/json/nodes/pve/qemu/100/status/current");
    });
  });

  // =========================================================================
  // proxmoxRequest - POST
  // =========================================================================
  describe("proxmoxRequest POST", () => {
    beforeEach(() => setProxmoxEnv());

    it("should send POST with form-encoded body", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:...");
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/lxc/200/status/start", "POST");
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    });

    it("should set Content-Type to form-urlencoded for POST with body", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:...");
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/lxc", "POST", { vmid: 300, ostemplate: "local:vztmpl/test.tar.zst" });
      expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    });

    it("should encode body params as URLSearchParams", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:...");
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/lxc", "POST", { vmid: 300, hostname: "test-ct" });
      const body = fetchMock.mock.calls[0][1].body as string;
      expect(body).toContain("vmid=300");
      expect(body).toContain("hostname=test-ct");
    });

    it("should skip undefined values in body", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:...");
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/lxc", "POST", { vmid: 300, hostname: undefined });
      const body = fetchMock.mock.calls[0][1].body as string;
      expect(body).toContain("vmid=300");
      expect(body).not.toContain("hostname");
    });

    it("should skip null values in body", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:...");
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/lxc", "POST", { vmid: 300, hostname: null });
      const body = fetchMock.mock.calls[0][1].body as string;
      expect(body).not.toContain("hostname");
    });

    it("should convert boolean values to strings", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:...");
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/lxc", "POST", { vmid: 300, unprivileged: 1 });
      const body = fetchMock.mock.calls[0][1].body as string;
      expect(body).toContain("unprivileged=1");
    });

    it("should handle POST with empty body object", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:...");
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/lxc/200/status/start", "POST", {});
      expect(fetchMock.mock.calls[0][1].body).toBe("");
    });

    it("should handle POST without body", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:...");
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/lxc/200/status/start", "POST");
      expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    });
  });

  // =========================================================================
  // proxmoxRequest - PUT
  // =========================================================================
  describe("proxmoxRequest PUT", () => {
    beforeEach(() => setProxmoxEnv());

    it("should send PUT method", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/lxc/200/config", "PUT", { memory: 2048 });
      expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
    });

    it("should form-encode PUT body", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/lxc/200/config", "PUT", { memory: 2048, cores: 2 });
      const body = fetchMock.mock.calls[0][1].body as string;
      expect(body).toContain("memory=2048");
      expect(body).toContain("cores=2");
    });

    it("should set Content-Type for PUT with body", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/lxc/200/config", "PUT", { memory: 2048 });
      expect(fetchMock.mock.calls[0][1].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    });

    it("should handle multiple params in PUT", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/lxc/200/config", "PUT", {
        memory: 4096, cores: 4, hostname: "updated", swap: 1024,
      });
      const body = fetchMock.mock.calls[0][1].body as string;
      expect(body).toContain("memory=4096");
      expect(body).toContain("cores=4");
      expect(body).toContain("hostname=updated");
      expect(body).toContain("swap=1024");
    });
  });

  // =========================================================================
  // proxmoxRequest - DELETE
  // =========================================================================
  describe("proxmoxRequest DELETE", () => {
    beforeEach(() => setProxmoxEnv());

    it("should send DELETE method", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:...");
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/lxc/200", "DELETE");
      expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    });

    it("should append body params as query string for DELETE", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:...");
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/lxc/200", "DELETE", { purge: 1, force: 1 });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("purge=1");
      expect(url).toContain("force=1");
    });

    it("should use ? separator for DELETE with body", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:...");
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/lxc/200", "DELETE", { purge: 1 });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toMatch(/\?purge=1/);
    });

    it("should handle DELETE without body", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:...");
      vi.stubGlobal("fetch", fetchMock);
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await proxmoxRequest("nodes/pve/lxc/200/snapshot/snap1", "DELETE");
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).not.toContain("?");
    });
  });

  // =========================================================================
  // Error handling
  // =========================================================================
  describe("error handling", () => {
    beforeEach(() => setProxmoxEnv());

    it("should throw on 401 Unauthorized", async () => {
      vi.stubGlobal("fetch", mockFetchError(401, "Unauthorized"));
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await expect(proxmoxRequest("nodes")).rejects.toHaveProperty("status", 401);
    });

    it("should throw on 403 Forbidden", async () => {
      vi.stubGlobal("fetch", mockFetchError(403, "Forbidden"));
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await expect(proxmoxRequest("nodes")).rejects.toHaveProperty("status", 403);
    });

    it("should throw on 404 Not Found", async () => {
      vi.stubGlobal("fetch", mockFetchError(404, "Not Found"));
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await expect(proxmoxRequest("nodes/nonexistent")).rejects.toHaveProperty("status", 404);
    });

    it("should throw on 500 Internal Server Error", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "Internal Server Error"));
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await expect(proxmoxRequest("nodes")).rejects.toHaveProperty("status", 500);
    });

    it("should include status in error object", async () => {
      vi.stubGlobal("fetch", mockFetchError(502, "Bad Gateway"));
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      try {
        await proxmoxRequest("nodes");
        expect.unreachable("Should have thrown");
      } catch (e: unknown) {
        const err = e as { status: number; message: string };
        expect(err.status).toBe(502);
        expect(err.message).toContain("502");
      }
    });

    it("should include error body text in message", async () => {
      vi.stubGlobal("fetch", mockFetchError(400, "Parameter verification failed"));
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      try {
        await proxmoxRequest("nodes");
        expect.unreachable("Should have thrown");
      } catch (e: unknown) {
        expect((e as { message: string }).message).toContain("Parameter verification failed");
      }
    });

    it("should handle network errors (fetch rejects)", async () => {
      vi.stubGlobal("fetch", mockFetchNetworkError("ECONNREFUSED"));
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await expect(proxmoxRequest("nodes")).rejects.toThrow("ECONNREFUSED");
    });

    it("should handle timeout errors", async () => {
      vi.stubGlobal("fetch", mockFetchNetworkError("AbortError: The operation was aborted"));
      const { proxmoxRequest } = await import("@/lib/proxmox-client");
      await expect(proxmoxRequest("nodes")).rejects.toThrow("AbortError");
    });
  });

  // =========================================================================
  // formatBytes
  // =========================================================================
  describe("formatBytes", () => {
    it("should return '0 B' for 0", () => {
      expect(formatBytes(0)).toBe("0 B");
    });

    it("should format bytes", () => {
      expect(formatBytes(512)).toBe("512.00 B");
    });

    it("should format KiB", () => {
      expect(formatBytes(1024)).toBe("1.00 KiB");
    });

    it("should format KiB with decimals", () => {
      expect(formatBytes(1536)).toBe("1.50 KiB");
    });

    it("should format MiB", () => {
      expect(formatBytes(1048576)).toBe("1.00 MiB");
    });

    it("should format GiB", () => {
      expect(formatBytes(1073741824)).toBe("1.00 GiB");
    });

    it("should format GiB with decimals", () => {
      expect(formatBytes(8589934592)).toBe("8.00 GiB");
    });

    it("should format TiB", () => {
      expect(formatBytes(1099511627776)).toBe("1.00 TiB");
    });

    it("should format large GiB values", () => {
      expect(formatBytes(67108864000)).toBe("62.50 GiB");
    });

    it("should format 512 MiB", () => {
      expect(formatBytes(536870912)).toBe("512.00 MiB");
    });
  });

  // =========================================================================
  // formatUptime
  // =========================================================================
  describe("formatUptime", () => {
    it("should return '0m' for 0 seconds", () => {
      expect(formatUptime(0)).toBe("0m");
    });

    it("should format minutes only", () => {
      expect(formatUptime(300)).toBe("5m");
    });

    it("should format hours only", () => {
      expect(formatUptime(3600)).toBe("1h");
    });

    it("should format hours and minutes", () => {
      expect(formatUptime(3900)).toBe("1h 5m");
    });

    it("should format days only", () => {
      expect(formatUptime(86400)).toBe("1d");
    });

    it("should format days and hours", () => {
      expect(formatUptime(90000)).toBe("1d 1h");
    });

    it("should format days, hours and minutes", () => {
      expect(formatUptime(90060)).toBe("1d 1h 1m");
    });

    it("should format 3 days", () => {
      expect(formatUptime(259200)).toBe("3d");
    });

    it("should format complex uptime", () => {
      expect(formatUptime(100000)).toBe("1d 3h 46m");
    });

    it("should format seconds < 60 as 0m", () => {
      expect(formatUptime(30)).toBe("0m");
    });
  });

  // =========================================================================
  // textContent / jsonContent
  // =========================================================================
  describe("textContent", () => {
    it("should wrap text in content array", () => {
      const result = textContent("hello");
      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      expect(result.content[0].text).toBe("hello");
    });

    it("should handle empty string", () => {
      expect(textContent("").content[0].text).toBe("");
    });

    it("should handle Japanese text", () => {
      expect(textContent("タスク完了").content[0].text).toBe("タスク完了");
    });
  });

  describe("jsonContent", () => {
    it("should stringify object", () => {
      const result = jsonContent({ key: "value" });
      expect(JSON.parse(result.content[0].text)).toEqual({ key: "value" });
    });

    it("should stringify array", () => {
      const result = jsonContent([1, 2, 3]);
      expect(JSON.parse(result.content[0].text)).toEqual([1, 2, 3]);
    });

    it("should handle null", () => {
      const result = jsonContent(null);
      expect(result.content[0].text).toBe("null");
    });

    it("should pretty-print with 2 spaces", () => {
      const result = jsonContent({ a: 1 });
      expect(result.content[0].text).toContain("\n");
    });
  });

  // =========================================================================
  // getDefaultNode
  // =========================================================================
  describe("getDefaultNode", () => {
    it("should return env value when set", () => {
      process.env.PROXMOX_DEFAULT_NODE = "custom-node";
      expect(getDefaultNode()).toBe("custom-node");
    });

    it("should return 'pve' as default", () => {
      expect(getDefaultNode()).toBe("pve");
    });

    it("should handle empty string as falsy", () => {
      process.env.PROXMOX_DEFAULT_NODE = "";
      expect(getDefaultNode()).toBe("pve");
    });
  });
});
