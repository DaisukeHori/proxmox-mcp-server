import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  setProxmoxEnv, mockFetchSuccess, mockFetchError, mockFetchNetworkError,
  SAMPLE_NODES, SAMPLE_CLUSTER_STATUS, SAMPLE_CLUSTER_RESOURCES,
} from "../helpers";
import * as tools from "@/lib/tools";
import { verifyApiKey } from "@/lib/auth";
import { createMockRequest } from "../helpers";

beforeEach(() => setProxmoxEnv({ MCP_API_KEY: "test-key-integration" }));
function mockApi(data: unknown) { vi.stubGlobal("fetch", mockFetchSuccess(data)); }
function parseResult(r: tools.McpContent) { return JSON.parse(r.content[0].text); }

// ==========================================================================
// AUTH + CLUSTER INTEGRATION
// ==========================================================================
describe("Integration: Auth + Cluster", () => {
  describe("Auth verification before cluster calls", () => {
    it("should accept valid Bearer token", () => {
      const req = createMockRequest({ headers: { authorization: "Bearer test-key-integration" } });
      expect(verifyApiKey(req as never)).toBe(true);
    });

    it("should reject invalid Bearer token", () => {
      const req = createMockRequest({ headers: { authorization: "Bearer wrong" } });
      expect(verifyApiKey(req as never)).toBe(false);
    });

    it("should reject request without auth", () => {
      const req = createMockRequest();
      expect(verifyApiKey(req as never)).toBe(false);
    });

    it("auth + clusterStatus success flow", async () => {
      const req = createMockRequest({ headers: { authorization: "Bearer test-key-integration" } });
      expect(verifyApiKey(req as never)).toBe(true);
      mockApi(SAMPLE_CLUSTER_STATUS);
      const result = await tools.clusterStatus();
      const data = parseResult(result) as Array<Record<string, unknown>>;
      expect(data.length).toBeGreaterThan(0);
      expect(data[0]).toHaveProperty("type");
    });

    it("auth + clusterStatus should include cluster type", async () => {
      const req = createMockRequest({ headers: { authorization: "Bearer test-key-integration" } });
      expect(verifyApiKey(req as never)).toBe(true);
      mockApi(SAMPLE_CLUSTER_STATUS);
      const result = await tools.clusterStatus();
      const data = parseResult(result) as Array<Record<string, unknown>>;
      expect(data.find(d => d.type === "cluster")).toBeDefined();
    });

    it("auth + clusterStatus should include node entries", async () => {
      mockApi(SAMPLE_CLUSTER_STATUS);
      const result = await tools.clusterStatus();
      const data = parseResult(result) as Array<Record<string, unknown>>;
      const nodes = data.filter(d => d.type === "node");
      expect(nodes.length).toBe(2);
    });
  });

  describe("Cluster resources full flow", () => {
    it("should return resources with all types", async () => {
      mockApi(SAMPLE_CLUSTER_RESOURCES);
      const result = await tools.clusterResources({});
      const data = parseResult(result) as Array<Record<string, unknown>>;
      const types = new Set(data.map(d => d.type));
      expect(types.has("qemu")).toBe(true);
      expect(types.has("lxc")).toBe(true);
      expect(types.has("storage")).toBe(true);
    });

    it("should filter VM resources only", async () => {
      const vmOnly = SAMPLE_CLUSTER_RESOURCES.filter(r => r.type === "qemu");
      mockApi(vmOnly);
      const result = await tools.clusterResources({ type: "vm" });
      const data = parseResult(result) as Array<Record<string, unknown>>;
      expect(data.every(d => d.type === "qemu")).toBe(true);
    });

    it("should handle empty cluster", async () => {
      mockApi([]);
      const result = await tools.clusterResources({});
      expect(parseResult(result)).toEqual([]);
    });

    it("should include vmid in resource entries", async () => {
      mockApi(SAMPLE_CLUSTER_RESOURCES);
      const result = await tools.clusterResources({});
      const data = parseResult(result) as Array<Record<string, unknown>>;
      const vms = data.filter(d => d.type === "qemu");
      expect(vms[0]).toHaveProperty("vmid");
    });

    it("should include name in resource entries", async () => {
      mockApi(SAMPLE_CLUSTER_RESOURCES);
      const result = await tools.clusterResources({});
      const data = parseResult(result) as Array<Record<string, unknown>>;
      expect(data[0]).toHaveProperty("name");
    });

    it("should handle Proxmox 401 error", async () => {
      vi.stubGlobal("fetch", mockFetchError(401, "No ticket"));
      await expect(tools.clusterResources({})).rejects.toHaveProperty("status", 401);
    });

    it("should handle Proxmox 500 error", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "Server error"));
      await expect(tools.clusterResources({})).rejects.toHaveProperty("status", 500);
    });

    it("should handle network timeout", async () => {
      vi.stubGlobal("fetch", mockFetchNetworkError("Timeout"));
      await expect(tools.clusterResources({})).rejects.toThrow("Timeout");
    });
  });
});

// ==========================================================================
// NODES INTEGRATION
// ==========================================================================
describe("Integration: Nodes", () => {
  describe("listNodes full flow", () => {
    it("should return formatted nodes with all fields", async () => {
      mockApi(SAMPLE_NODES);
      const result = await tools.listNodes();
      const data = parseResult(result) as Array<Record<string, string>>;
      expect(data[0]).toHaveProperty("node");
      expect(data[0]).toHaveProperty("status");
      expect(data[0]).toHaveProperty("cpu");
      expect(data[0]).toHaveProperty("memory");
      expect(data[0]).toHaveProperty("uptime");
    });

    it("should format node pve correctly", async () => {
      mockApi(SAMPLE_NODES);
      const result = await tools.listNodes();
      const data = parseResult(result) as Array<Record<string, string>>;
      const pve = data.find(n => n.node === "pve");
      expect(pve).toBeDefined();
      expect(pve!.status).toBe("online");
      expect(pve!.cpu).toContain("5.2%");
      expect(pve!.cpu).toContain("16 cores");
    });

    it("should format node pve2 correctly", async () => {
      mockApi(SAMPLE_NODES);
      const result = await tools.listNodes();
      const data = parseResult(result) as Array<Record<string, string>>;
      const pve2 = data.find(n => n.node === "pve2");
      expect(pve2!.cpu).toContain("12.3%");
      expect(pve2!.uptime).toContain("1d");
    });

    it("should handle single node cluster", async () => {
      mockApi([SAMPLE_NODES[0]]);
      const result = await tools.listNodes();
      const data = parseResult(result) as Array<Record<string, string>>;
      expect(data).toHaveLength(1);
    });

    it("should handle offline node", async () => {
      mockApi([{ node: "pve3", status: "offline", cpu: 0, maxcpu: 4, mem: 0, maxmem: 8589934592, uptime: 0 }]);
      const result = await tools.listNodes();
      const data = parseResult(result) as Array<Record<string, string>>;
      expect(data[0].status).toBe("offline");
      expect(data[0].uptime).toBe("0m");
    });

    it("should show correct memory usage for node", async () => {
      mockApi(SAMPLE_NODES);
      const result = await tools.listNodes();
      const data = parseResult(result) as Array<Record<string, string>>;
      expect(data[0].memory).toContain("8.00 GiB");
      expect(data[0].memory).toContain("62.50 GiB");
    });

    it("should handle 0% CPU", async () => {
      mockApi([{ node: "idle", status: "online", cpu: 0, maxcpu: 1, mem: 0, maxmem: 1073741824, uptime: 100 }]);
      const result = await tools.listNodes();
      const data = parseResult(result) as Array<Record<string, string>>;
      expect(data[0].cpu).toContain("0.0%");
    });

    it("should handle 100% CPU", async () => {
      mockApi([{ node: "busy", status: "online", cpu: 1.0, maxcpu: 2, mem: 0, maxmem: 1073741824, uptime: 100 }]);
      const result = await tools.listNodes();
      const data = parseResult(result) as Array<Record<string, string>>;
      expect(data[0].cpu).toContain("100.0%");
    });

    it("should handle API error gracefully", async () => {
      vi.stubGlobal("fetch", mockFetchError(403, "Permission denied"));
      await expect(tools.listNodes()).rejects.toHaveProperty("status", 403);
    });

    it("should handle network error", async () => {
      vi.stubGlobal("fetch", mockFetchNetworkError("ECONNREFUSED"));
      await expect(tools.listNodes()).rejects.toThrow("ECONNREFUSED");
    });
  });

  describe("nodeStatus full flow", () => {
    it("should return detailed node status", async () => {
      const nodeData = { kversion: "6.8.12-1-pve", uptime: 259200, cpuinfo: { cores: 16 } };
      mockApi(nodeData);
      const result = await tools.nodeStatus({});
      expect(parseResult(result)).toHaveProperty("kversion");
    });

    it("should use custom node name", async () => {
      const fetchMock = mockFetchSuccess({});
      vi.stubGlobal("fetch", fetchMock);
      await tools.nodeStatus({ node: "compute-01" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/compute-01/status");
    });

    it("should use default node when not specified", async () => {
      const fetchMock = mockFetchSuccess({});
      vi.stubGlobal("fetch", fetchMock);
      await tools.nodeStatus({});
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve/status");
    });

    it("should use custom default node from env", async () => {
      process.env.PROXMOX_DEFAULT_NODE = "custom-node";
      const fetchMock = mockFetchSuccess({});
      vi.stubGlobal("fetch", fetchMock);
      await tools.nodeStatus({});
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/custom-node/status");
    });

    it("should handle 404 for non-existent node", async () => {
      vi.stubGlobal("fetch", mockFetchError(404, "Node not found"));
      await expect(tools.nodeStatus({ node: "nonexistent" })).rejects.toHaveProperty("status", 404);
    });

    it("should include all status fields", async () => {
      const nodeData = { kversion: "6.8", uptime: 100, pveversion: "8.2.2", cpuinfo: { cores: 16, cpus: 1, model: "Intel" }, memory: { total: 67108864000, used: 8589934592 } };
      mockApi(nodeData);
      const result = await tools.nodeStatus({});
      const data = parseResult(result) as Record<string, unknown>;
      expect(data).toHaveProperty("cpuinfo");
      expect(data).toHaveProperty("memory");
    });

    it("should handle connection refused to node", async () => {
      vi.stubGlobal("fetch", mockFetchNetworkError("Connection refused"));
      await expect(tools.nodeStatus({})).rejects.toThrow("Connection refused");
    });
  });

  describe("Node operations with different auth methods", () => {
    it("should work with X-API-Key auth + node listing", async () => {
      const req = createMockRequest({ headers: { "x-api-key": "test-key-integration" } });
      expect(verifyApiKey(req as never)).toBe(true);
      mockApi(SAMPLE_NODES);
      const result = await tools.listNodes();
      expect(parseResult(result)).toHaveLength(2);
    });

    it("should work with query param auth + node status", async () => {
      const req = createMockRequest({ url: "https://test.vercel.app/api/sse?api_key=test-key-integration" });
      expect(verifyApiKey(req as never)).toBe(true);
      mockApi({ kversion: "6.8" });
      const result = await tools.nodeStatus({});
      expect(parseResult(result)).toHaveProperty("kversion");
    });

    it("should reject wrong key and not execute tool", async () => {
      const req = createMockRequest({ headers: { authorization: "Bearer wrong-key" } });
      expect(verifyApiKey(req as never)).toBe(false);
      // Tool should not be called in this case (controller responsibility)
    });

    it("should reject empty key and not execute tool", async () => {
      const req = createMockRequest({ headers: { authorization: "Bearer " } });
      expect(verifyApiKey(req as never)).toBe(false);
    });
  });
});

// ==========================================================================
// EDGE CASES
// ==========================================================================
describe("Integration: Edge cases", () => {
  it("should handle very large node count", async () => {
    const manyNodes = Array.from({ length: 50 }, (_, i) => ({
      node: `pve${i}`, status: "online", cpu: Math.random(), maxcpu: 8,
      mem: Math.random() * 8589934592, maxmem: 8589934592, uptime: Math.floor(Math.random() * 864000),
    }));
    mockApi(manyNodes);
    const result = await tools.listNodes();
    const data = parseResult(result) as Array<Record<string, string>>;
    expect(data).toHaveLength(50);
  });

  it("should handle special characters in node name", async () => {
    const fetchMock = mockFetchSuccess({});
    vi.stubGlobal("fetch", fetchMock);
    await tools.nodeStatus({ node: "node-with-dashes" });
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/node-with-dashes/");
  });

  it("should handle unicode in cluster name", async () => {
    mockApi([{ type: "cluster", name: "テストクラスタ", nodes: 1, quorate: 1 }]);
    const result = await tools.clusterStatus();
    const data = parseResult(result) as Array<Record<string, unknown>>;
    expect(data[0].name).toBe("テストクラスタ");
  });

  it("should handle resources with zero CPU", async () => {
    mockApi([{ id: "qemu/100", type: "qemu", vmid: 100, cpu: 0, maxcpu: 0, mem: 0, maxmem: 0 }]);
    const result = await tools.clusterResources({});
    const data = parseResult(result) as Array<Record<string, unknown>>;
    expect(data[0].cpu).toBe(0);
  });

  it("should handle concurrent requests", async () => {
    mockApi(SAMPLE_NODES);
    const [r1, r2, r3] = await Promise.all([
      tools.listNodes(),
      tools.listNodes(),
      tools.listNodes(),
    ]);
    expect(parseResult(r1)).toHaveLength(2);
    expect(parseResult(r2)).toHaveLength(2);
    expect(parseResult(r3)).toHaveLength(2);
  });
});
