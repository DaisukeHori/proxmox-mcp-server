import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  setProxmoxEnv, mockFetchSuccess, mockFetchError, mockFetchNetworkError,
  SAMPLE_STORAGES, SAMPLE_STORAGE_CONTENT, SAMPLE_SNAPSHOTS,
  SAMPLE_TASKS, SAMPLE_TASK_STATUS, SAMPLE_TASK_LOG,
  SAMPLE_NETWORKS, SAMPLE_TEMPLATES,
} from "../helpers";
import * as tools from "@/lib/tools";
import { verifyApiKey, unauthorizedResponse } from "@/lib/auth";
import { createMockRequest } from "../helpers";

beforeEach(() => setProxmoxEnv({ MCP_API_KEY: "integ-key-2" }));
function mockApi(data: unknown) { vi.stubGlobal("fetch", mockFetchSuccess(data)); }
function parseResult(r: tools.McpContent) { return JSON.parse(r.content[0].text); }

// ==========================================================================
// STORAGE INTEGRATION
// ==========================================================================
describe("Integration: Storage", () => {
  describe("listStorages full flow", () => {
    it("should list all storages", async () => {
      mockApi(SAMPLE_STORAGES);
      const data = parseResult(await tools.listStorages({})) as Array<Record<string, unknown>>;
      expect(data).toHaveLength(2);
    });

    it("should include storage types", async () => {
      mockApi(SAMPLE_STORAGES);
      const data = parseResult(await tools.listStorages({})) as Array<Record<string, unknown>>;
      expect(data[0].type).toBe("dir");
      expect(data[1].type).toBe("lvmthin");
    });

    it("should include usage info", async () => {
      mockApi(SAMPLE_STORAGES);
      const data = parseResult(await tools.listStorages({})) as Array<Record<string, unknown>>;
      expect(data[0]).toHaveProperty("used");
      expect(data[0]).toHaveProperty("avail");
      expect(data[0]).toHaveProperty("total");
    });

    it("should filter by content type", async () => {
      const fetchMock = mockFetchSuccess([SAMPLE_STORAGES[0]]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listStorages({ content: "vztmpl" });
      expect(fetchMock.mock.calls[0][0]).toContain("content=vztmpl");
    });

    it("should filter by images content", async () => {
      const fetchMock = mockFetchSuccess([SAMPLE_STORAGES[1]]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listStorages({ content: "images" });
      expect(fetchMock.mock.calls[0][0]).toContain("content=images");
    });

    it("should use custom node", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listStorages({ node: "pve2" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/storage");
    });

    it("should handle empty storage list", async () => {
      mockApi([]);
      expect(parseResult(await tools.listStorages({}))).toEqual([]);
    });

    it("should handle API error", async () => {
      vi.stubGlobal("fetch", mockFetchError(403, "Forbidden"));
      await expect(tools.listStorages({})).rejects.toHaveProperty("status", 403);
    });

    it("should include used_fraction", async () => {
      mockApi(SAMPLE_STORAGES);
      const data = parseResult(await tools.listStorages({})) as Array<Record<string, unknown>>;
      expect(data[0]).toHaveProperty("used_fraction");
    });

    it("should include active and enabled flags", async () => {
      mockApi(SAMPLE_STORAGES);
      const data = parseResult(await tools.listStorages({})) as Array<Record<string, unknown>>;
      expect(data[0].active).toBe(1);
      expect(data[0].enabled).toBe(1);
    });
  });

  describe("storageContent full flow", () => {
    it("should list storage contents", async () => {
      mockApi(SAMPLE_STORAGE_CONTENT);
      const data = parseResult(await tools.storageContent({ storage: "local" })) as Array<Record<string, unknown>>;
      expect(data).toHaveLength(2);
    });

    it("should include templates", async () => {
      mockApi(SAMPLE_STORAGE_CONTENT);
      const data = parseResult(await tools.storageContent({ storage: "local" })) as Array<Record<string, unknown>>;
      const tmpl = data.find(d => d.content === "vztmpl");
      expect(tmpl).toBeDefined();
      expect(tmpl!.volid).toContain("debian-12");
    });

    it("should include ISOs", async () => {
      mockApi(SAMPLE_STORAGE_CONTENT);
      const data = parseResult(await tools.storageContent({ storage: "local" })) as Array<Record<string, unknown>>;
      const iso = data.find(d => d.content === "iso");
      expect(iso).toBeDefined();
    });

    it("should filter by content type", async () => {
      const fetchMock = mockFetchSuccess([SAMPLE_STORAGE_CONTENT[0]]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.storageContent({ storage: "local", content: "vztmpl" });
      expect(fetchMock.mock.calls[0][0]).toContain("content=vztmpl");
    });

    it("should use correct storage path", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.storageContent({ storage: "local-lvm" });
      expect(fetchMock.mock.calls[0][0]).toContain("/storage/local-lvm/content");
    });

    it("should handle empty storage", async () => {
      mockApi([]);
      expect(parseResult(await tools.storageContent({ storage: "empty" }))).toEqual([]);
    });

    it("should handle storage not found", async () => {
      vi.stubGlobal("fetch", mockFetchError(404, "Storage not found"));
      await expect(tools.storageContent({ storage: "nonexistent" })).rejects.toHaveProperty("status", 404);
    });
  });
});

// ==========================================================================
// SNAPSHOT INTEGRATION
// ==========================================================================
describe("Integration: Snapshots", () => {
  describe("listSnapshots full flow", () => {
    it("should list LXC snapshots", async () => {
      mockApi(SAMPLE_SNAPSHOTS);
      const data = parseResult(await tools.listSnapshots({ vmid: 200, type: "lxc" })) as Array<Record<string, unknown>>;
      expect(data).toHaveLength(2);
    });

    it("should list QEMU snapshots", async () => {
      mockApi(SAMPLE_SNAPSHOTS);
      const data = parseResult(await tools.listSnapshots({ vmid: 100, type: "qemu" })) as Array<Record<string, unknown>>;
      expect(data).toHaveLength(2);
    });

    it("should include snapshot name and description", async () => {
      mockApi(SAMPLE_SNAPSHOTS);
      const data = parseResult(await tools.listSnapshots({ vmid: 200, type: "lxc" })) as Array<Record<string, unknown>>;
      expect(data[1].name).toBe("snap1");
      expect(data[1].description).toBe("Before update");
    });

    it("should include snapshot time", async () => {
      mockApi(SAMPLE_SNAPSHOTS);
      const data = parseResult(await tools.listSnapshots({ vmid: 200, type: "lxc" })) as Array<Record<string, unknown>>;
      expect(data[1].snaptime).toBe(1700000000);
    });

    it("should handle no snapshots", async () => {
      mockApi([{ name: "current" }]);
      const data = parseResult(await tools.listSnapshots({ vmid: 200, type: "lxc" })) as Array<Record<string, unknown>>;
      expect(data).toHaveLength(1);
    });

    it("should handle VM not found", async () => {
      vi.stubGlobal("fetch", mockFetchError(404, "Not found"));
      await expect(tools.listSnapshots({ vmid: 999, type: "lxc" })).rejects.toBeDefined();
    });
  });

  describe("createSnapshot full flow", () => {
    it("should create LXC snapshot", async () => {
      mockApi("UPID:pve:...:vzsnapshot:200:root@pam:");
      const result = await tools.createSnapshot({ vmid: 200, type: "lxc", snapname: "backup-before-update" });
      expect(result.content[0].text).toContain("backup-before-update");
      expect(result.content[0].text).toContain("作成");
    });

    it("should create QEMU snapshot", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createSnapshot({ vmid: 100, type: "qemu", snapname: "snap1" });
      expect(fetchMock.mock.calls[0][0]).toContain("/qemu/100/snapshot");
    });

    it("should include description", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createSnapshot({ vmid: 200, type: "lxc", snapname: "snap1", description: "Safe point" });
      expect(fetchMock.mock.calls[0][1].body).toContain("description=Safe+point");
    });

    it("should handle snapshot creation failure", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "Cannot snapshot"));
      await expect(tools.createSnapshot({ vmid: 200, type: "lxc", snapname: "fail" })).rejects.toBeDefined();
    });

    it("should handle duplicate snapshot name", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "Snapshot already exists"));
      await expect(tools.createSnapshot({ vmid: 200, type: "lxc", snapname: "existing" })).rejects.toBeDefined();
    });
  });

  describe("rollbackSnapshot full flow", () => {
    it("should rollback LXC snapshot", async () => {
      mockApi("UPID:...");
      const result = await tools.rollbackSnapshot({ vmid: 200, type: "lxc", snapname: "snap1" });
      expect(result.content[0].text).toContain("ロールバック");
    });

    it("should rollback QEMU snapshot", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.rollbackSnapshot({ vmid: 100, type: "qemu", snapname: "snap1" });
      expect(fetchMock.mock.calls[0][0]).toContain("/qemu/100/snapshot/snap1/rollback");
    });

    it("should handle non-existent snapshot", async () => {
      vi.stubGlobal("fetch", mockFetchError(404, "Snapshot not found"));
      await expect(tools.rollbackSnapshot({ vmid: 200, type: "lxc", snapname: "nope" })).rejects.toBeDefined();
    });

    it("should use correct API path", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.rollbackSnapshot({ vmid: 200, type: "lxc", snapname: "snap1" });
      expect(fetchMock.mock.calls[0][0]).toContain("/lxc/200/snapshot/snap1/rollback");
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    });
  });

  describe("deleteSnapshot full flow", () => {
    it("should delete snapshot", async () => {
      mockApi("UPID:...");
      const result = await tools.deleteSnapshot({ vmid: 200, type: "lxc", snapname: "snap1" });
      expect(result.content[0].text).toContain("削除");
    });

    it("should use DELETE method", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.deleteSnapshot({ vmid: 200, type: "lxc", snapname: "snap1" });
      expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    });

    it("should handle delete failure", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "Cannot delete"));
      await expect(tools.deleteSnapshot({ vmid: 200, type: "lxc", snapname: "fail" })).rejects.toBeDefined();
    });
  });
});

// ==========================================================================
// TASK INTEGRATION
// ==========================================================================
describe("Integration: Tasks", () => {
  describe("listTasks full flow", () => {
    it("should list recent tasks", async () => {
      mockApi(SAMPLE_TASKS);
      const data = parseResult(await tools.listTasks({})) as Array<Record<string, unknown>>;
      expect(data).toHaveLength(2);
    });

    it("should include task type and status", async () => {
      mockApi(SAMPLE_TASKS);
      const data = parseResult(await tools.listTasks({})) as Array<Record<string, unknown>>;
      expect(data[0].type).toBe("vzstart");
      expect(data[0].status).toBe("OK");
    });

    it("should include UPID", async () => {
      mockApi(SAMPLE_TASKS);
      const data = parseResult(await tools.listTasks({})) as Array<Record<string, unknown>>;
      expect(data[0].upid).toContain("UPID:");
    });

    it("should filter by limit", async () => {
      const fetchMock = mockFetchSuccess([SAMPLE_TASKS[0]]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listTasks({ limit: 1 });
      expect(fetchMock.mock.calls[0][0]).toContain("limit=1");
    });

    it("should filter by vmid", async () => {
      const fetchMock = mockFetchSuccess([SAMPLE_TASKS[0]]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listTasks({ vmid: 200 });
      expect(fetchMock.mock.calls[0][0]).toContain("vmid=200");
    });

    it("should combine limit and vmid", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listTasks({ limit: 5, vmid: 100 });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("limit=5");
      expect(url).toContain("vmid=100");
    });

    it("should handle empty task list", async () => {
      mockApi([]);
      expect(parseResult(await tools.listTasks({}))).toEqual([]);
    });

    it("should handle custom node", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listTasks({ node: "pve2" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/tasks");
    });
  });

  describe("taskStatus full flow", () => {
    it("should return completed task status", async () => {
      mockApi(SAMPLE_TASK_STATUS);
      const data = parseResult(await tools.taskStatus({ upid: "UPID:pve:..." })) as Record<string, unknown>;
      expect(data.status).toBe("stopped");
      expect(data.exitstatus).toBe("OK");
    });

    it("should return running task status", async () => {
      mockApi({ status: "running", type: "vzdump" });
      const data = parseResult(await tools.taskStatus({ upid: "UPID:pve:..." })) as Record<string, unknown>;
      expect(data.status).toBe("running");
    });

    it("should encode UPID correctly", async () => {
      const upid = "UPID:pve:00001234:0000ABCD:65800000:vzstart:200:root@pam:";
      const fetchMock = mockFetchSuccess(SAMPLE_TASK_STATUS);
      vi.stubGlobal("fetch", fetchMock);
      await tools.taskStatus({ upid });
      expect(fetchMock.mock.calls[0][0]).toContain("/tasks/");
    });

    it("should handle task not found", async () => {
      vi.stubGlobal("fetch", mockFetchError(404, "Task not found"));
      await expect(tools.taskStatus({ upid: "UPID:invalid" })).rejects.toBeDefined();
    });

    it("should include task type in status", async () => {
      mockApi(SAMPLE_TASK_STATUS);
      const data = parseResult(await tools.taskStatus({ upid: "UPID:pve:..." })) as Record<string, unknown>;
      expect(data.type).toBe("vzstart");
    });
  });

  describe("taskLog full flow", () => {
    it("should return log lines as text", async () => {
      mockApi(SAMPLE_TASK_LOG);
      const result = await tools.taskLog({ upid: "UPID:pve:..." });
      expect(result.content[0].text).toContain("Starting container 200");
      expect(result.content[0].text).toContain("TASK OK");
    });

    it("should join lines with newlines", async () => {
      mockApi(SAMPLE_TASK_LOG);
      const result = await tools.taskLog({ upid: "UPID:pve:..." });
      expect(result.content[0].text.split("\n")).toHaveLength(3);
    });

    it("should pass limit", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.taskLog({ upid: "UPID:pve:...", limit: 10 });
      expect(fetchMock.mock.calls[0][0]).toContain("limit=10");
    });

    it("should handle empty log", async () => {
      mockApi([]);
      const result = await tools.taskLog({ upid: "UPID:pve:..." });
      expect(result.content[0].text).toBe("");
    });

    it("should handle large log output", async () => {
      const manyLines = Array.from({ length: 500 }, (_, i) => ({ n: i + 1, t: `Line ${i + 1}: Some log output` }));
      mockApi(manyLines);
      const result = await tools.taskLog({ upid: "UPID:pve:..." });
      expect(result.content[0].text.split("\n")).toHaveLength(500);
    });
  });
});

// ==========================================================================
// NETWORK INTEGRATION
// ==========================================================================
describe("Integration: Network", () => {
  describe("listNetworks full flow", () => {
    it("should list all interfaces", async () => {
      mockApi(SAMPLE_NETWORKS);
      const data = parseResult(await tools.listNetworks({})) as Array<Record<string, unknown>>;
      expect(data).toHaveLength(3);
    });

    it("should include bridge interfaces", async () => {
      mockApi(SAMPLE_NETWORKS);
      const data = parseResult(await tools.listNetworks({})) as Array<Record<string, unknown>>;
      const bridge = data.find(n => n.type === "bridge");
      expect(bridge).toBeDefined();
      expect(bridge!.iface).toBe("vmbr0");
    });

    it("should include eth interfaces", async () => {
      mockApi(SAMPLE_NETWORKS);
      const data = parseResult(await tools.listNetworks({})) as Array<Record<string, unknown>>;
      expect(data.find(n => n.type === "eth")).toBeDefined();
    });

    it("should include loopback", async () => {
      mockApi(SAMPLE_NETWORKS);
      const data = parseResult(await tools.listNetworks({})) as Array<Record<string, unknown>>;
      expect(data.find(n => n.type === "loopback")).toBeDefined();
    });

    it("should filter by bridge type", async () => {
      const fetchMock = mockFetchSuccess([SAMPLE_NETWORKS[0]]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listNetworks({ type: "bridge" });
      expect(fetchMock.mock.calls[0][0]).toContain("type=bridge");
    });

    it("should include IP address info", async () => {
      mockApi(SAMPLE_NETWORKS);
      const data = parseResult(await tools.listNetworks({})) as Array<Record<string, unknown>>;
      const bridge = data.find(n => n.iface === "vmbr0");
      expect(bridge!.address).toBe("192.168.70.226");
    });

    it("should handle custom node", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listNetworks({ node: "pve2" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/network");
    });

    it("should handle empty network list", async () => {
      mockApi([]);
      expect(parseResult(await tools.listNetworks({}))).toEqual([]);
    });

    it("should handle API error", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "Internal error"));
      await expect(tools.listNetworks({})).rejects.toBeDefined();
    });

    it("should include bridge_ports info", async () => {
      mockApi(SAMPLE_NETWORKS);
      const data = parseResult(await tools.listNetworks({})) as Array<Record<string, unknown>>;
      const bridge = data.find(n => n.iface === "vmbr0");
      expect(bridge!.bridge_ports).toBe("enp3s0");
    });
  });
});

// ==========================================================================
// TEMPLATE INTEGRATION
// ==========================================================================
describe("Integration: Templates", () => {
  describe("listTemplates full flow", () => {
    it("should list available templates", async () => {
      mockApi(SAMPLE_TEMPLATES);
      const data = parseResult(await tools.listTemplates({})) as Array<Record<string, unknown>>;
      expect(data).toHaveLength(2);
    });

    it("should include debian template", async () => {
      mockApi(SAMPLE_TEMPLATES);
      const data = parseResult(await tools.listTemplates({})) as Array<Record<string, unknown>>;
      expect(data.find(t => (t.volid as string).includes("debian"))).toBeDefined();
    });

    it("should include ubuntu template", async () => {
      mockApi(SAMPLE_TEMPLATES);
      const data = parseResult(await tools.listTemplates({})) as Array<Record<string, unknown>>;
      expect(data.find(t => (t.volid as string).includes("ubuntu"))).toBeDefined();
    });

    it("should use local storage by default", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listTemplates({});
      expect(fetchMock.mock.calls[0][0]).toContain("/storage/local/content");
    });

    it("should use custom storage", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listTemplates({ storage: "nfs-templates" });
      expect(fetchMock.mock.calls[0][0]).toContain("/storage/nfs-templates/content");
    });

    it("should always filter by vztmpl", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listTemplates({});
      expect(fetchMock.mock.calls[0][0]).toContain("content=vztmpl");
    });

    it("should handle empty template list", async () => {
      mockApi([]);
      expect(parseResult(await tools.listTemplates({}))).toEqual([]);
    });

    it("should handle storage not found", async () => {
      vi.stubGlobal("fetch", mockFetchError(404, "Storage not found"));
      await expect(tools.listTemplates({ storage: "none" })).rejects.toBeDefined();
    });

    it("should include template sizes", async () => {
      mockApi(SAMPLE_TEMPLATES);
      const data = parseResult(await tools.listTemplates({})) as Array<Record<string, unknown>>;
      expect(data[0]).toHaveProperty("size");
    });
  });

  describe("downloadTemplate full flow", () => {
    it("should trigger download", async () => {
      mockApi("UPID:pve:...:apldownload:...:root@pam:");
      const result = await tools.downloadTemplate({ template: "debian-12-standard_12.7-1_amd64.tar.zst" });
      expect(result.content[0].text).toContain("debian-12");
      expect(result.content[0].text).toContain("ダウンロード");
    });

    it("should use local storage by default", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.downloadTemplate({ template: "test.tar.zst" });
      expect(fetchMock.mock.calls[0][1].body).toContain("storage=local");
    });

    it("should use custom storage", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.downloadTemplate({ template: "test.tar.zst", storage: "nfs" });
      expect(fetchMock.mock.calls[0][1].body).toContain("storage=nfs");
    });

    it("should include template name in POST body", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.downloadTemplate({ template: "ubuntu-22.04-standard.tar.zst" });
      expect(fetchMock.mock.calls[0][1].body).toContain("template=ubuntu-22.04-standard.tar.zst");
    });

    it("should use POST method", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.downloadTemplate({ template: "test.tar.zst" });
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    });

    it("should handle download failure", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "Download failed"));
      await expect(tools.downloadTemplate({ template: "bad.tar.zst" })).rejects.toBeDefined();
    });

    it("should handle custom node", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.downloadTemplate({ template: "test.tar.zst", node: "pve2" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/aplinfo");
    });
  });
});

// ==========================================================================
// GENERIC API INTEGRATION
// ==========================================================================
describe("Integration: Generic API", () => {
  describe("apiRequest full flow", () => {
    it("should make GET request to arbitrary endpoint", async () => {
      mockApi({ version: "8.2.2", release: "8.2", repoid: "abc123" });
      const data = parseResult(await tools.apiRequest({ path: "version" })) as Record<string, unknown>;
      expect(data.version).toBe("8.2.2");
    });

    it("should make POST request", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.apiRequest({ path: "nodes/pve/qemu/100/agent/exec", method: "POST", body: { command: "ls" } });
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
      expect(fetchMock.mock.calls[0][1].body).toContain("command=ls");
    });

    it("should make PUT request", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.apiRequest({ path: "nodes/pve/lxc/200/config", method: "PUT", body: { memory: 4096 } });
      expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
    });

    it("should make DELETE request", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.apiRequest({ path: "nodes/pve/lxc/201", method: "DELETE" });
      expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    });

    it("should access nested API paths", async () => {
      const fetchMock = mockFetchSuccess({});
      vi.stubGlobal("fetch", fetchMock);
      await tools.apiRequest({ path: "nodes/pve/qemu/100/agent/get-fsinfo" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve/qemu/100/agent/get-fsinfo");
    });

    it("should access cluster endpoints", async () => {
      const fetchMock = mockFetchSuccess({});
      vi.stubGlobal("fetch", fetchMock);
      await tools.apiRequest({ path: "cluster/options" });
      expect(fetchMock.mock.calls[0][0]).toContain("/cluster/options");
    });

    it("should access access/users endpoint", async () => {
      mockApi([{ userid: "root@pam" }, { userid: "ccp@pve" }]);
      const data = parseResult(await tools.apiRequest({ path: "access/users" })) as Array<Record<string, string>>;
      expect(data).toHaveLength(2);
    });

    it("should handle API error with details", async () => {
      vi.stubGlobal("fetch", mockFetchError(400, "Parameter verification failed"));
      await expect(tools.apiRequest({ path: "nodes/pve/lxc", method: "POST", body: {} })).rejects.toHaveProperty("status", 400);
    });

    it("should handle network errors", async () => {
      vi.stubGlobal("fetch", mockFetchNetworkError("Connection reset"));
      await expect(tools.apiRequest({ path: "nodes" })).rejects.toThrow("Connection reset");
    });

    it("should return JSON formatted response", async () => {
      mockApi({ key: "value", nested: { a: 1 } });
      const result = await tools.apiRequest({ path: "test" });
      const text = result.content[0].text;
      expect(text).toContain('"key"');
      expect(text).toContain('"nested"');
      expect(JSON.parse(text)).toEqual({ key: "value", nested: { a: 1 } });
    });
  });

  describe("Generic API edge cases", () => {
    it("should handle empty response", async () => {
      mockApi(null);
      const result = await tools.apiRequest({ path: "nodes/pve/time" });
      expect(result.content[0].text).toBe("null");
    });

    it("should handle very large response", async () => {
      const large = { items: Array.from({ length: 1000 }, (_, i) => ({ id: i, data: "x".repeat(100) })) };
      mockApi(large);
      const result = await tools.apiRequest({ path: "large-endpoint" });
      const parsed = parseResult(result) as Record<string, unknown[]>;
      expect(parsed.items).toHaveLength(1000);
    });
  });
});

// ==========================================================================
// CROSS-TOOL AUTH INTEGRATION
// ==========================================================================
describe("Integration: Cross-tool Auth", () => {
  it("auth pass → listStorages success", async () => {
    const req = createMockRequest({ headers: { authorization: "Bearer integ-key-2" } });
    expect(verifyApiKey(req as never)).toBe(true);
    mockApi(SAMPLE_STORAGES);
    expect(parseResult(await tools.listStorages({}))).toHaveLength(2);
  });

  it("auth fail → no tool execution", () => {
    const req = createMockRequest({ headers: { authorization: "Bearer wrong" } });
    expect(verifyApiKey(req as never)).toBe(false);
  });

  it("auth via query param → snapshot creation", async () => {
    const req = createMockRequest({ url: "https://test.vercel.app/api/sse?api_key=integ-key-2" });
    expect(verifyApiKey(req as never)).toBe(true);
    mockApi("UPID:...");
    const result = await tools.createSnapshot({ vmid: 200, type: "lxc", snapname: "auth-test" });
    expect(result.content[0].text).toContain("auth-test");
  });

  it("auth via X-API-Key → task listing", async () => {
    const req = createMockRequest({ headers: { "x-api-key": "integ-key-2" } });
    expect(verifyApiKey(req as never)).toBe(true);
    mockApi(SAMPLE_TASKS);
    expect(parseResult(await tools.listTasks({}))).toHaveLength(2);
  });

  it("unauthorized response has correct structure", async () => {
    const res = unauthorizedResponse();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("multiple sequential authenticated requests", async () => {
    const req = createMockRequest({ headers: { authorization: "Bearer integ-key-2" } });
    expect(verifyApiKey(req as never)).toBe(true);

    mockApi(SAMPLE_STORAGES);
    const r1 = await tools.listStorages({});
    expect(parseResult(r1)).toHaveLength(2);

    mockApi(SAMPLE_TEMPLATES);
    const r2 = await tools.listTemplates({});
    expect(parseResult(r2)).toHaveLength(2);

    mockApi(SAMPLE_NETWORKS);
    const r3 = await tools.listNetworks({});
    expect(parseResult(r3)).toHaveLength(3);
  });
});
