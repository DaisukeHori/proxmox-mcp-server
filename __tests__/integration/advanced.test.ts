import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  setProxmoxEnv, mockFetchSuccess, mockFetchError, mockFetchNetworkError,
  SAMPLE_VMS, SAMPLE_VM_STATUS, SAMPLE_VM_CONFIG,
  SAMPLE_CONTAINERS, SAMPLE_CONTAINER_STATUS, SAMPLE_CONTAINER_CONFIG,
  SAMPLE_STORAGES, SAMPLE_SNAPSHOTS, SAMPLE_TASKS, SAMPLE_TASK_LOG,
  SAMPLE_NODES, SAMPLE_NETWORKS, SAMPLE_TEMPLATES, SAMPLE_CLUSTER_STATUS,
} from "../helpers";
import * as tools from "@/lib/tools";
import { verifyApiKey } from "@/lib/auth";
import { createMockRequest } from "../helpers";

beforeEach(() => setProxmoxEnv({ MCP_API_KEY: "adv-key" }));
function mockApi(data: unknown) { vi.stubGlobal("fetch", mockFetchSuccess(data)); }
function parseResult(r: tools.McpContent) { return JSON.parse(r.content[0].text); }

// ==========================================================================
// LARGE SCALE OPERATIONS
// ==========================================================================
describe("Integration: Large scale operations", () => {
  it("should handle 50 containers in list", async () => {
    const cts = Array.from({ length: 50 }, (_, i) => ({ vmid: 200 + i, name: `ct-${i}`, status: i % 3 === 0 ? "stopped" : "running" }));
    mockApi(cts);
    const data = parseResult(await tools.listContainers({})) as Array<Record<string, unknown>>;
    expect(data).toHaveLength(50);
    expect(data.filter(c => c.status === "running").length).toBe(33);
    expect(data.filter(c => c.status === "stopped").length).toBe(17);
  });

  it("should handle 100 VMs in list", async () => {
    const vms = Array.from({ length: 100 }, (_, i) => ({ vmid: 100 + i, name: `vm-${i}`, status: "running" }));
    mockApi(vms);
    expect(parseResult(await tools.listVms({}))).toHaveLength(100);
  });

  it("should handle 20 snapshots for one VM", async () => {
    const snaps = Array.from({ length: 20 }, (_, i) => ({ name: `snap-${i}`, description: `Snapshot ${i}`, snaptime: 1700000000 + i * 86400 }));
    mockApi(snaps);
    expect(parseResult(await tools.listSnapshots({ vmid: 100, type: "qemu" }))).toHaveLength(20);
  });

  it("should handle 500 task entries", async () => {
    const tasks = Array.from({ length: 500 }, (_, i) => ({ upid: `UPID:pve:${i}`, type: "vzstart", status: i % 10 === 0 ? "" : "OK" }));
    mockApi(tasks);
    expect(parseResult(await tools.listTasks({}))).toHaveLength(500);
  });

  it("should handle cluster with 10 nodes", async () => {
    const nodes = Array.from({ length: 10 }, (_, i) => ({
      node: `pve${i + 1}`, status: "online", cpu: Math.random() * 0.5, maxcpu: 32,
      mem: Math.random() * 68719476736, maxmem: 68719476736, uptime: 86400 * (i + 1),
    }));
    mockApi(nodes);
    const data = parseResult(await tools.listNodes()) as Array<Record<string, string>>;
    expect(data).toHaveLength(10);
    data.forEach(n => {
      expect(n.cpu).toContain("%");
      expect(n.memory).toContain("GiB");
    });
  });

  it("should handle 10 storage entries", async () => {
    const stores = Array.from({ length: 10 }, (_, i) => ({
      storage: `storage-${i}`, type: i % 2 === 0 ? "dir" : "lvmthin", active: 1, enabled: 1,
      used: i * 1073741824, avail: 107374182400 - i * 1073741824, total: 107374182400,
    }));
    mockApi(stores);
    expect(parseResult(await tools.listStorages({}))).toHaveLength(10);
  });
});

// ==========================================================================
// API PATH CONSTRUCTION
// ==========================================================================
describe("Integration: API path construction", () => {
  it("should construct correct path for VM status with node + vmid", async () => {
    const f = mockFetchSuccess(SAMPLE_VM_STATUS);
    vi.stubGlobal("fetch", f);
    await tools.vmStatus({ node: "node-a", vmid: 123 });
    expect(f.mock.calls[0][0]).toMatch(/\/nodes\/node-a\/qemu\/123\/status\/current$/);
  });

  it("should construct correct path for VM config", async () => {
    const f = mockFetchSuccess(SAMPLE_VM_CONFIG);
    vi.stubGlobal("fetch", f);
    await tools.vmConfig({ node: "node-b", vmid: 456 });
    expect(f.mock.calls[0][0]).toMatch(/\/nodes\/node-b\/qemu\/456\/config$/);
  });

  it("should construct correct path for container clone", async () => {
    const f = mockFetchSuccess("UPID:...");
    vi.stubGlobal("fetch", f);
    await tools.cloneContainer({ node: "node-c", vmid: 300, newid: 999 });
    expect(f.mock.calls[0][0]).toMatch(/\/nodes\/node-c\/lxc\/300\/clone$/);
  });

  it("should construct correct path for container delete", async () => {
    const f = mockFetchSuccess("UPID:...");
    vi.stubGlobal("fetch", f);
    await tools.deleteContainer({ node: "node-d", vmid: 201, confirm: true });
    expect(f.mock.calls[0][0]).toContain("/nodes/node-d/lxc/201");
  });

  it("should construct correct path for QEMU snapshot", async () => {
    const f = mockFetchSuccess("UPID:...");
    vi.stubGlobal("fetch", f);
    await tools.createSnapshot({ node: "node-e", vmid: 100, type: "qemu", snapname: "s1" });
    expect(f.mock.calls[0][0]).toMatch(/\/nodes\/node-e\/qemu\/100\/snapshot$/);
  });

  it("should construct correct path for LXC snapshot rollback", async () => {
    const f = mockFetchSuccess("UPID:...");
    vi.stubGlobal("fetch", f);
    await tools.rollbackSnapshot({ node: "node-f", vmid: 200, type: "lxc", snapname: "snap-name" });
    expect(f.mock.calls[0][0]).toMatch(/\/nodes\/node-f\/lxc\/200\/snapshot\/snap-name\/rollback$/);
  });

  it("should construct correct path for task status with encoded UPID", async () => {
    const upid = "UPID:pve:00001:00002:AABB:vzstart:200:root@pam:";
    const f = mockFetchSuccess(SAMPLE_TASKS[0]);
    vi.stubGlobal("fetch", f);
    await tools.taskStatus({ node: "pve", upid });
    expect(f.mock.calls[0][0]).toContain("/tasks/");
    expect(f.mock.calls[0][0]).toContain(encodeURIComponent(upid));
  });

  it("should construct correct path for generic API with deep path", async () => {
    const f = mockFetchSuccess({});
    vi.stubGlobal("fetch", f);
    await tools.apiRequest({ path: "nodes/pve/qemu/100/agent/get-fsinfo" });
    expect(f.mock.calls[0][0]).toContain("/api2/json/nodes/pve/qemu/100/agent/get-fsinfo");
  });

  it("should construct storage content path correctly", async () => {
    const f = mockFetchSuccess([]);
    vi.stubGlobal("fetch", f);
    await tools.storageContent({ node: "pve2", storage: "nfs-backup", content: "backup" });
    expect(f.mock.calls[0][0]).toContain("/nodes/pve2/storage/nfs-backup/content");
    expect(f.mock.calls[0][0]).toContain("content=backup");
  });

  it("should construct template list path correctly", async () => {
    const f = mockFetchSuccess([]);
    vi.stubGlobal("fetch", f);
    await tools.listTemplates({ node: "pve3", storage: "ceph" });
    expect(f.mock.calls[0][0]).toContain("/nodes/pve3/storage/ceph/content");
    expect(f.mock.calls[0][0]).toContain("content=vztmpl");
  });
});

// ==========================================================================
// HTTP METHOD VERIFICATION
// ==========================================================================
describe("Integration: HTTP method verification", () => {
  it("listNodes uses GET", async () => {
    const f = mockFetchSuccess(SAMPLE_NODES); vi.stubGlobal("fetch", f);
    await tools.listNodes();
    expect(f.mock.calls[0][1].method).toBe("GET");
  });

  it("listVms uses GET", async () => {
    const f = mockFetchSuccess([]); vi.stubGlobal("fetch", f);
    await tools.listVms({});
    expect(f.mock.calls[0][1].method).toBe("GET");
  });

  it("listContainers uses GET", async () => {
    const f = mockFetchSuccess([]); vi.stubGlobal("fetch", f);
    await tools.listContainers({});
    expect(f.mock.calls[0][1].method).toBe("GET");
  });

  it("listStorages uses GET", async () => {
    const f = mockFetchSuccess([]); vi.stubGlobal("fetch", f);
    await tools.listStorages({});
    expect(f.mock.calls[0][1].method).toBe("GET");
  });

  it("listNetworks uses GET", async () => {
    const f = mockFetchSuccess([]); vi.stubGlobal("fetch", f);
    await tools.listNetworks({});
    expect(f.mock.calls[0][1].method).toBe("GET");
  });

  it("listTasks uses GET", async () => {
    const f = mockFetchSuccess([]); vi.stubGlobal("fetch", f);
    await tools.listTasks({});
    expect(f.mock.calls[0][1].method).toBe("GET");
  });

  it("vmStart uses POST", async () => {
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.vmStart({ vmid: 100 });
    expect(f.mock.calls[0][1].method).toBe("POST");
  });

  it("vmStop uses POST", async () => {
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.vmStop({ vmid: 100 });
    expect(f.mock.calls[0][1].method).toBe("POST");
  });

  it("vmShutdown uses POST", async () => {
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.vmShutdown({ vmid: 100 });
    expect(f.mock.calls[0][1].method).toBe("POST");
  });

  it("vmReboot uses POST", async () => {
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.vmReboot({ vmid: 100 });
    expect(f.mock.calls[0][1].method).toBe("POST");
  });

  it("containerStart uses POST", async () => {
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.containerStart({ vmid: 200 });
    expect(f.mock.calls[0][1].method).toBe("POST");
  });

  it("containerStop uses POST", async () => {
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.containerStop({ vmid: 200 });
    expect(f.mock.calls[0][1].method).toBe("POST");
  });

  it("containerShutdown uses POST", async () => {
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.containerShutdown({ vmid: 200 });
    expect(f.mock.calls[0][1].method).toBe("POST");
  });

  it("containerReboot uses POST", async () => {
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.containerReboot({ vmid: 200 });
    expect(f.mock.calls[0][1].method).toBe("POST");
  });

  it("createContainer uses POST", async () => {
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.createContainer({ vmid: 300, ostemplate: "local:vztmpl/test.tar.zst" });
    expect(f.mock.calls[0][1].method).toBe("POST");
  });

  it("cloneContainer uses POST", async () => {
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.cloneContainer({ vmid: 300, newid: 301 });
    expect(f.mock.calls[0][1].method).toBe("POST");
  });

  it("deleteContainer uses DELETE", async () => {
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.deleteContainer({ vmid: 201, confirm: true });
    expect(f.mock.calls[0][1].method).toBe("DELETE");
  });

  it("updateContainerConfig uses PUT", async () => {
    const f = mockFetchSuccess(null); vi.stubGlobal("fetch", f);
    await tools.updateContainerConfig({ vmid: 200, memory: 2048 });
    expect(f.mock.calls[0][1].method).toBe("PUT");
  });

  it("createSnapshot uses POST", async () => {
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.createSnapshot({ vmid: 200, type: "lxc", snapname: "s" });
    expect(f.mock.calls[0][1].method).toBe("POST");
  });

  it("rollbackSnapshot uses POST", async () => {
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.rollbackSnapshot({ vmid: 200, type: "lxc", snapname: "s" });
    expect(f.mock.calls[0][1].method).toBe("POST");
  });

  it("deleteSnapshot uses DELETE", async () => {
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.deleteSnapshot({ vmid: 200, type: "lxc", snapname: "s" });
    expect(f.mock.calls[0][1].method).toBe("DELETE");
  });

  it("downloadTemplate uses POST", async () => {
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.downloadTemplate({ template: "test.tar.zst" });
    expect(f.mock.calls[0][1].method).toBe("POST");
  });
});

// ==========================================================================
// PROXMOX AUTH HEADER VERIFICATION
// ==========================================================================
describe("Integration: Proxmox auth header in requests", () => {
  it("should send PVEAPIToken header on every request", async () => {
    setProxmoxEnv({ PROXMOX_TOKEN_ID: "myuser@pve!mytoken", PROXMOX_TOKEN_SECRET: "11111111-2222-3333-4444-555555555555" });
    const f = mockFetchSuccess([]); vi.stubGlobal("fetch", f);
    await tools.listNodes();
    const authHeader = f.mock.calls[0][1].headers.Authorization;
    expect(authHeader).toBe("PVEAPIToken=myuser@pve!mytoken=11111111-2222-3333-4444-555555555555");
  });

  it("should send auth header for POST requests", async () => {
    setProxmoxEnv();
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.vmStart({ vmid: 100 });
    expect(f.mock.calls[0][1].headers.Authorization).toContain("PVEAPIToken=");
  });

  it("should send auth header for PUT requests", async () => {
    setProxmoxEnv();
    const f = mockFetchSuccess(null); vi.stubGlobal("fetch", f);
    await tools.updateContainerConfig({ vmid: 200, memory: 2048 });
    expect(f.mock.calls[0][1].headers.Authorization).toContain("PVEAPIToken=");
  });

  it("should send auth header for DELETE requests", async () => {
    setProxmoxEnv();
    const f = mockFetchSuccess("UPID:..."); vi.stubGlobal("fetch", f);
    await tools.deleteContainer({ vmid: 201, confirm: true });
    expect(f.mock.calls[0][1].headers.Authorization).toContain("PVEAPIToken=");
  });
});

// ==========================================================================
// MCP AUTH + PROXMOX AUTH DUAL LAYER
// ==========================================================================
describe("Integration: Dual auth layer (MCP + Proxmox)", () => {
  it("MCP auth pass + Proxmox auth pass = success", async () => {
    const req = createMockRequest({ headers: { authorization: "Bearer adv-key" } });
    expect(verifyApiKey(req as never)).toBe(true);
    mockApi(SAMPLE_NODES);
    const result = await tools.listNodes();
    expect(parseResult(result)).toHaveLength(2);
  });

  it("MCP auth pass + Proxmox auth fail = Proxmox 401", async () => {
    const req = createMockRequest({ headers: { authorization: "Bearer adv-key" } });
    expect(verifyApiKey(req as never)).toBe(true);
    vi.stubGlobal("fetch", mockFetchError(401, "No ticket"));
    await expect(tools.listNodes()).rejects.toHaveProperty("status", 401);
  });

  it("MCP auth fail = blocked before Proxmox call", () => {
    const req = createMockRequest({ headers: { authorization: "Bearer wrong" } });
    expect(verifyApiKey(req as never)).toBe(false);
    // No Proxmox API call should be made
  });

  it("MCP auth via query + Proxmox permission denied", async () => {
    const req = createMockRequest({ url: "https://test.vercel.app/api/sse?api_key=adv-key" });
    expect(verifyApiKey(req as never)).toBe(true);
    vi.stubGlobal("fetch", mockFetchError(403, "Permission denied"));
    await expect(tools.vmStop({ vmid: 100 })).rejects.toHaveProperty("status", 403);
  });

  it("MCP auth via X-API-Key + Proxmox success", async () => {
    const req = createMockRequest({ headers: { "x-api-key": "adv-key" } });
    expect(verifyApiKey(req as never)).toBe(true);
    mockApi(SAMPLE_CLUSTER_STATUS);
    const data = parseResult(await tools.clusterStatus()) as Array<Record<string, unknown>>;
    expect(data.length).toBeGreaterThan(0);
  });
});
