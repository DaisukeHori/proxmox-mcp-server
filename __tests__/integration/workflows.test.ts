import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  setProxmoxEnv, mockFetchSuccess, mockFetchError, mockFetchNetworkError, mockFetchSequence,
  SAMPLE_NODES, SAMPLE_VMS, SAMPLE_VM_STATUS, SAMPLE_VM_CONFIG,
  SAMPLE_CONTAINERS, SAMPLE_CONTAINER_STATUS, SAMPLE_CONTAINER_CONFIG,
  SAMPLE_STORAGES, SAMPLE_STORAGE_CONTENT, SAMPLE_SNAPSHOTS,
  SAMPLE_TASKS, SAMPLE_TASK_STATUS, SAMPLE_TASK_LOG,
  SAMPLE_NETWORKS, SAMPLE_TEMPLATES, SAMPLE_CLUSTER_RESOURCES,
} from "../helpers";
import * as tools from "@/lib/tools";
import { verifyApiKey } from "@/lib/auth";
import { createMockRequest } from "../helpers";

beforeEach(() => setProxmoxEnv({ MCP_API_KEY: "wf-key" }));
function mockApi(data: unknown) { vi.stubGlobal("fetch", mockFetchSuccess(data)); }
function parseResult(r: tools.McpContent) { return JSON.parse(r.content[0].text); }

// ==========================================================================
// WORKFLOW: VM Provisioning Pipeline
// ==========================================================================
describe("Integration: VM provisioning workflow", () => {
  it("should list VMs → check status → get config", async () => {
    mockApi(SAMPLE_VMS);
    const vms = parseResult(await tools.listVms({})) as Array<Record<string, unknown>>;
    expect(vms.length).toBeGreaterThan(0);

    mockApi(SAMPLE_VM_STATUS);
    const status = parseResult(await tools.vmStatus({ vmid: vms[0].vmid as number })) as Record<string, unknown>;
    expect(status.status).toBe("running");

    mockApi(SAMPLE_VM_CONFIG);
    const config = parseResult(await tools.vmConfig({ vmid: vms[0].vmid as number })) as Record<string, unknown>;
    expect(config.cores).toBeDefined();
  });

  it("should start VM → check running → shutdown → check stopped", async () => {
    mockApi("UPID:1");
    await tools.vmStart({ vmid: 100 });

    mockApi({ ...SAMPLE_VM_STATUS, status: "running" });
    const s1 = parseResult(await tools.vmStatus({ vmid: 100 })) as Record<string, unknown>;
    expect(s1.status).toBe("running");

    mockApi("UPID:2");
    await tools.vmShutdown({ vmid: 100 });

    mockApi({ ...SAMPLE_VM_STATUS, status: "stopped", uptime: 0 });
    const s2 = parseResult(await tools.vmStatus({ vmid: 100 })) as Record<string, unknown>;
    expect(s2.status).toBe("stopped");
  });

  it("should handle start failure → retry → success", async () => {
    vi.stubGlobal("fetch", mockFetchError(500, "Lock failed"));
    await expect(tools.vmStart({ vmid: 100 })).rejects.toBeDefined();

    mockApi("UPID:ok");
    const result = await tools.vmStart({ vmid: 100 });
    expect(result.content[0].text).toContain("起動");
  });
});

// ==========================================================================
// WORKFLOW: Container Lifecycle
// ==========================================================================
describe("Integration: Container lifecycle workflow", () => {
  it("should list templates → create container → start → verify", async () => {
    mockApi(SAMPLE_TEMPLATES);
    const templates = parseResult(await tools.listTemplates({})) as Array<Record<string, unknown>>;
    expect(templates.length).toBeGreaterThan(0);

    mockApi("UPID:create");
    await tools.createContainer({
      vmid: 500, ostemplate: templates[0].volid as string,
      hostname: "test-wf", memory: 1024, cores: 2,
    });

    mockApi("UPID:start");
    await tools.containerStart({ vmid: 500 });

    mockApi({ vmid: 500, status: "running", uptime: 5 });
    const st = parseResult(await tools.containerStatus({ vmid: 500 })) as Record<string, unknown>;
    expect(st.status).toBe("running");
  });

  it("should clone template → update config → start", async () => {
    mockApi("UPID:clone");
    await tools.cloneContainer({ vmid: 300, newid: 501, hostname: "clone-wf" });

    mockApi(null);
    await tools.updateContainerConfig({ vmid: 501, memory: 4096, cores: 4 });

    mockApi("UPID:start");
    const r = await tools.containerStart({ vmid: 501 });
    expect(r.content[0].text).toContain("起動");
  });

  it("should stop → snapshot → update → rollback → start", async () => {
    mockApi("UPID:stop");
    await tools.containerStop({ vmid: 200 });

    mockApi("UPID:snap");
    await tools.createSnapshot({ vmid: 200, type: "lxc", snapname: "pre-update" });

    mockApi(null);
    await tools.updateContainerConfig({ vmid: 200, memory: 8192 });

    mockApi("UPID:rollback");
    await tools.rollbackSnapshot({ vmid: 200, type: "lxc", snapname: "pre-update" });

    mockApi("UPID:start");
    const r = await tools.containerStart({ vmid: 200 });
    expect(r.content[0].text).toContain("起動");
  });

  it("should create → verify config → delete", async () => {
    mockApi("UPID:create");
    await tools.createContainer({ vmid: 502, ostemplate: "local:vztmpl/debian-12.tar.zst" });

    mockApi(SAMPLE_CONTAINER_CONFIG);
    const cfg = parseResult(await tools.containerConfig({ vmid: 502 })) as Record<string, unknown>;
    expect(cfg).toHaveProperty("hostname");

    mockApi("UPID:del");
    const r = await tools.deleteContainer({ vmid: 502, confirm: true });
    expect(r.content[0].text).toContain("削除");
  });

  it("should handle delete without confirm then with confirm", async () => {
    const r1 = await tools.deleteContainer({ vmid: 200, confirm: false });
    expect(r1.content[0].text).toContain("confirm=true");

    mockApi("UPID:del");
    const r2 = await tools.deleteContainer({ vmid: 200, confirm: true });
    expect(r2.content[0].text).toContain("削除");
  });
});

// ==========================================================================
// WORKFLOW: Infrastructure Survey
// ==========================================================================
describe("Integration: Infrastructure survey workflow", () => {
  it("should survey entire cluster: nodes → VMs → CTs → storage", async () => {
    mockApi(SAMPLE_NODES);
    const nodes = parseResult(await tools.listNodes()) as Array<Record<string, string>>;
    expect(nodes.length).toBeGreaterThan(0);

    mockApi(SAMPLE_VMS);
    const vms = parseResult(await tools.listVms({})) as Array<Record<string, unknown>>;

    mockApi(SAMPLE_CONTAINERS);
    const cts = parseResult(await tools.listContainers({})) as Array<Record<string, unknown>>;

    mockApi(SAMPLE_STORAGES);
    const st = parseResult(await tools.listStorages({})) as Array<Record<string, unknown>>;

    expect(vms.length + cts.length).toBeGreaterThan(0);
    expect(st.length).toBeGreaterThan(0);
  });

  it("should check all nodes health", async () => {
    mockApi(SAMPLE_NODES);
    const nodes = parseResult(await tools.listNodes()) as Array<Record<string, string>>;

    for (const node of nodes) {
      mockApi({ kversion: "6.8", uptime: 100000 });
      const status = parseResult(await tools.nodeStatus({ node: node.node })) as Record<string, unknown>;
      expect(status).toHaveProperty("kversion");
    }
  });

  it("should list all networks across cluster", async () => {
    mockApi(SAMPLE_NETWORKS);
    const nets = parseResult(await tools.listNetworks({})) as Array<Record<string, unknown>>;
    expect(nets.length).toBeGreaterThan(0);

    const bridges = nets.filter(n => n.type === "bridge");
    expect(bridges.length).toBeGreaterThan(0);
  });

  it("should check cluster resources with type filters", async () => {
    const vmResources = SAMPLE_CLUSTER_RESOURCES.filter(r => r.type === "qemu");
    mockApi(vmResources);
    const vms = parseResult(await tools.clusterResources({ type: "vm" })) as Array<Record<string, unknown>>;
    expect(vms.every(v => v.type === "qemu")).toBe(true);

    const storageResources = SAMPLE_CLUSTER_RESOURCES.filter(r => r.type === "storage");
    mockApi(storageResources);
    const stores = parseResult(await tools.clusterResources({ type: "storage" })) as Array<Record<string, unknown>>;
    expect(stores.every(s => s.type === "storage")).toBe(true);
  });
});

// ==========================================================================
// WORKFLOW: Snapshot Management
// ==========================================================================
describe("Integration: Snapshot management workflow", () => {
  it("should create → list → verify → delete snapshot", async () => {
    mockApi("UPID:snap");
    await tools.createSnapshot({ vmid: 200, type: "lxc", snapname: "test-snap", description: "Testing" });

    mockApi([...SAMPLE_SNAPSHOTS, { name: "test-snap", description: "Testing", snaptime: Date.now() }]);
    const snaps = parseResult(await tools.listSnapshots({ vmid: 200, type: "lxc" })) as Array<Record<string, unknown>>;
    expect(snaps.find(s => s.name === "test-snap")).toBeDefined();

    mockApi("UPID:del");
    const r = await tools.deleteSnapshot({ vmid: 200, type: "lxc", snapname: "test-snap" });
    expect(r.content[0].text).toContain("削除");
  });

  it("should create snapshot → rollback → verify", async () => {
    mockApi("UPID:snap");
    await tools.createSnapshot({ vmid: 100, type: "qemu", snapname: "before-change" });

    mockApi("UPID:rollback");
    const r = await tools.rollbackSnapshot({ vmid: 100, type: "qemu", snapname: "before-change" });
    expect(r.content[0].text).toContain("ロールバック");
  });

  it("should handle snapshot on different VM types", async () => {
    mockApi("UPID:snap1");
    await tools.createSnapshot({ vmid: 100, type: "qemu", snapname: "qemu-snap" });

    mockApi("UPID:snap2");
    await tools.createSnapshot({ vmid: 200, type: "lxc", snapname: "lxc-snap" });
  });
});

// ==========================================================================
// WORKFLOW: Task Monitoring
// ==========================================================================
describe("Integration: Task monitoring workflow", () => {
  it("should start operation → get UPID → monitor status → read log", async () => {
    mockApi("UPID:pve:00001234:0000ABCD:65800000:vzstart:200:root@pam:");
    const startResult = await tools.containerStart({ vmid: 200 });
    expect(startResult.content[0].text).toContain("UPID:");

    mockApi({ status: "running", type: "vzstart" });
    const taskSt = parseResult(await tools.taskStatus({ upid: "UPID:pve:00001234:0000ABCD:65800000:vzstart:200:root@pam:" })) as Record<string, unknown>;
    expect(taskSt.status).toBe("running");

    mockApi(SAMPLE_TASK_LOG);
    const log = await tools.taskLog({ upid: "UPID:pve:00001234:0000ABCD:65800000:vzstart:200:root@pam:" });
    expect(log.content[0].text).toContain("TASK OK");
  });

  it("should list tasks filtered by VMID", async () => {
    const filtered = [SAMPLE_TASKS[0]];
    mockApi(filtered);
    const data = parseResult(await tools.listTasks({ vmid: 200, limit: 10 })) as Array<Record<string, unknown>>;
    expect(data).toHaveLength(1);
    expect(data[0].id).toBe("200");
  });

  it("should handle completed vs running tasks", async () => {
    mockApi(SAMPLE_TASK_STATUS);
    const completed = parseResult(await tools.taskStatus({ upid: "UPID:completed" })) as Record<string, unknown>;
    expect(completed.status).toBe("stopped");
    expect(completed.exitstatus).toBe("OK");

    mockApi({ status: "running", type: "vzdump" });
    const running = parseResult(await tools.taskStatus({ upid: "UPID:running" })) as Record<string, unknown>;
    expect(running.status).toBe("running");
  });

  it("should monitor task log growth", async () => {
    mockApi([{ n: 1, t: "Starting..." }]);
    const log1 = await tools.taskLog({ upid: "UPID:test", limit: 10 });
    expect(log1.content[0].text).toContain("Starting");

    mockApi([{ n: 1, t: "Starting..." }, { n: 2, t: "In progress..." }, { n: 3, t: "Done" }]);
    const log2 = await tools.taskLog({ upid: "UPID:test", limit: 10 });
    expect(log2.content[0].text).toContain("Done");
  });
});

// ==========================================================================
// ERROR PROPAGATION
// ==========================================================================
describe("Integration: Error propagation", () => {
  describe("Proxmox API errors", () => {
    it("should propagate 400 Bad Request", async () => {
      vi.stubGlobal("fetch", mockFetchError(400, "Parameter verification failed"));
      await expect(tools.createContainer({ vmid: 999, ostemplate: "bad" })).rejects.toHaveProperty("status", 400);
    });

    it("should propagate 401 Unauthorized", async () => {
      vi.stubGlobal("fetch", mockFetchError(401, "No ticket"));
      await expect(tools.listNodes()).rejects.toHaveProperty("status", 401);
    });

    it("should propagate 403 Forbidden", async () => {
      vi.stubGlobal("fetch", mockFetchError(403, "Permission denied"));
      await expect(tools.vmStop({ vmid: 100 })).rejects.toHaveProperty("status", 403);
    });

    it("should propagate 404 Not Found for VMs", async () => {
      vi.stubGlobal("fetch", mockFetchError(404, "VM 999 not found"));
      await expect(tools.vmStatus({ vmid: 999 })).rejects.toHaveProperty("status", 404);
    });

    it("should propagate 404 Not Found for CTs", async () => {
      vi.stubGlobal("fetch", mockFetchError(404, "CT 999 not found"));
      await expect(tools.containerStatus({ vmid: 999 })).rejects.toHaveProperty("status", 404);
    });

    it("should propagate 500 Internal Server Error", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "Internal error"));
      await expect(tools.clusterStatus()).rejects.toHaveProperty("status", 500);
    });

    it("should propagate 502 Bad Gateway", async () => {
      vi.stubGlobal("fetch", mockFetchError(502, "Bad Gateway"));
      await expect(tools.listVms({})).rejects.toHaveProperty("status", 502);
    });

    it("should propagate 503 Service Unavailable", async () => {
      vi.stubGlobal("fetch", mockFetchError(503, "Service unavailable"));
      await expect(tools.nodeStatus({})).rejects.toHaveProperty("status", 503);
    });
  });

  describe("Network errors", () => {
    it("should propagate ECONNREFUSED", async () => {
      vi.stubGlobal("fetch", mockFetchNetworkError("ECONNREFUSED"));
      await expect(tools.listNodes()).rejects.toThrow("ECONNREFUSED");
    });

    it("should propagate ETIMEDOUT", async () => {
      vi.stubGlobal("fetch", mockFetchNetworkError("ETIMEDOUT"));
      await expect(tools.listContainers({})).rejects.toThrow("ETIMEDOUT");
    });

    it("should propagate DNS resolution failure", async () => {
      vi.stubGlobal("fetch", mockFetchNetworkError("ENOTFOUND"));
      await expect(tools.listStorages({})).rejects.toThrow("ENOTFOUND");
    });

    it("should propagate SSL errors", async () => {
      vi.stubGlobal("fetch", mockFetchNetworkError("UNABLE_TO_VERIFY_LEAF_SIGNATURE"));
      await expect(tools.clusterResources({})).rejects.toThrow("UNABLE_TO_VERIFY_LEAF_SIGNATURE");
    });

    it("should propagate abort errors", async () => {
      vi.stubGlobal("fetch", mockFetchNetworkError("AbortError: signal timed out"));
      await expect(tools.vmStatus({ vmid: 100 })).rejects.toThrow("AbortError");
    });
  });

  describe("Error recovery", () => {
    it("should recover after transient error on listNodes", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "Temporary error"));
      await expect(tools.listNodes()).rejects.toBeDefined();

      mockApi(SAMPLE_NODES);
      const result = await tools.listNodes();
      expect(parseResult(result)).toHaveLength(2);
    });

    it("should recover after transient error on containerStart", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "Lock conflict"));
      await expect(tools.containerStart({ vmid: 200 })).rejects.toBeDefined();

      mockApi("UPID:ok");
      const r = await tools.containerStart({ vmid: 200 });
      expect(r.content[0].text).toContain("起動");
    });

    it("should recover after network error on vmConfig", async () => {
      vi.stubGlobal("fetch", mockFetchNetworkError("ECONNRESET"));
      await expect(tools.vmConfig({ vmid: 100 })).rejects.toBeDefined();

      mockApi(SAMPLE_VM_CONFIG);
      const r = await tools.vmConfig({ vmid: 100 });
      expect(parseResult(r)).toHaveProperty("cores");
    });
  });
});

// ==========================================================================
// CONCURRENT OPERATIONS
// ==========================================================================
describe("Integration: Concurrent operations", () => {
  it("should handle 5 concurrent VM status checks", async () => {
    mockApi(SAMPLE_VM_STATUS);
    const results = await Promise.all(
      [100, 101, 102, 103, 104].map(vmid => tools.vmStatus({ vmid }))
    );
    results.forEach(r => expect(parseResult(r)).toHaveProperty("status"));
  });

  it("should handle concurrent container and VM listing", async () => {
    mockApi(SAMPLE_VMS);
    const vmPromise = tools.listVms({});
    mockApi(SAMPLE_CONTAINERS);
    const ctPromise = tools.listContainers({});

    const [vms, cts] = await Promise.all([vmPromise, ctPromise]);
    expect(parseResult(vms).length).toBeGreaterThan(0);
    expect(parseResult(cts).length).toBeGreaterThan(0);
  });

  it("should handle concurrent snapshot + task listing", async () => {
    mockApi(SAMPLE_SNAPSHOTS);
    const snapPromise = tools.listSnapshots({ vmid: 200, type: "lxc" });
    mockApi(SAMPLE_TASKS);
    const taskPromise = tools.listTasks({});

    const [snaps, tasks] = await Promise.all([snapPromise, taskPromise]);
    expect(parseResult(snaps).length).toBeGreaterThan(0);
    expect(parseResult(tasks).length).toBeGreaterThan(0);
  });

  it("should handle 10 concurrent container starts", async () => {
    mockApi("UPID:batch");
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => tools.containerStart({ vmid: 200 + i }))
    );
    results.forEach(r => expect(r.content[0].text).toContain("起動"));
  });

  it("should handle concurrent operations on same VM", async () => {
    mockApi(SAMPLE_VM_STATUS);
    const statusPromise = tools.vmStatus({ vmid: 100 });
    mockApi(SAMPLE_VM_CONFIG);
    const configPromise = tools.vmConfig({ vmid: 100 });

    const [status, config] = await Promise.all([statusPromise, configPromise]);
    expect(parseResult(status)).toHaveProperty("status");
    expect(parseResult(config)).toHaveProperty("cores");
  });
});

// ==========================================================================
// NODE-SPECIFIC OPERATIONS
// ==========================================================================
describe("Integration: Node-specific operations", () => {
  it("should list VMs on specific node", async () => {
    const fetchMock = mockFetchSuccess(SAMPLE_VMS);
    vi.stubGlobal("fetch", fetchMock);
    await tools.listVms({ node: "pve2" });
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/qemu");
  });

  it("should list containers on specific node", async () => {
    const fetchMock = mockFetchSuccess(SAMPLE_CONTAINERS);
    vi.stubGlobal("fetch", fetchMock);
    await tools.listContainers({ node: "pve2" });
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/lxc");
  });

  it("should list storage on specific node", async () => {
    const fetchMock = mockFetchSuccess(SAMPLE_STORAGES);
    vi.stubGlobal("fetch", fetchMock);
    await tools.listStorages({ node: "pve2" });
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/storage");
  });

  it("should list networks on specific node", async () => {
    const fetchMock = mockFetchSuccess(SAMPLE_NETWORKS);
    vi.stubGlobal("fetch", fetchMock);
    await tools.listNetworks({ node: "pve2" });
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/network");
  });

  it("should list tasks on specific node", async () => {
    const fetchMock = mockFetchSuccess(SAMPLE_TASKS);
    vi.stubGlobal("fetch", fetchMock);
    await tools.listTasks({ node: "pve2" });
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/tasks");
  });

  it("should start VM on specific node", async () => {
    const fetchMock = mockFetchSuccess("UPID:...");
    vi.stubGlobal("fetch", fetchMock);
    await tools.vmStart({ vmid: 100, node: "pve2" });
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/qemu/100/status/start");
  });

  it("should stop container on specific node", async () => {
    const fetchMock = mockFetchSuccess("UPID:...");
    vi.stubGlobal("fetch", fetchMock);
    await tools.containerStop({ vmid: 200, node: "pve2" });
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/lxc/200/status/stop");
  });

  it("should create container on specific node", async () => {
    const fetchMock = mockFetchSuccess("UPID:...");
    vi.stubGlobal("fetch", fetchMock);
    await tools.createContainer({ vmid: 600, ostemplate: "local:vztmpl/test.tar.zst", node: "pve2" });
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/lxc");
  });

  it("should clone container on specific node", async () => {
    const fetchMock = mockFetchSuccess("UPID:...");
    vi.stubGlobal("fetch", fetchMock);
    await tools.cloneContainer({ vmid: 300, newid: 601, node: "pve2" });
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/lxc/300/clone");
  });

  it("should delete container on specific node", async () => {
    const fetchMock = mockFetchSuccess("UPID:...");
    vi.stubGlobal("fetch", fetchMock);
    await tools.deleteContainer({ vmid: 201, confirm: true, node: "pve2" });
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/lxc/201");
  });

  it("should update container config on specific node", async () => {
    const fetchMock = mockFetchSuccess(null);
    vi.stubGlobal("fetch", fetchMock);
    await tools.updateContainerConfig({ vmid: 200, node: "pve2", memory: 2048 });
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/lxc/200/config");
  });

  it("should create snapshot on specific node", async () => {
    const fetchMock = mockFetchSuccess("UPID:...");
    vi.stubGlobal("fetch", fetchMock);
    await tools.createSnapshot({ vmid: 200, type: "lxc", snapname: "snap1", node: "pve2" });
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/lxc/200/snapshot");
  });

  it("should rollback snapshot on specific node", async () => {
    const fetchMock = mockFetchSuccess("UPID:...");
    vi.stubGlobal("fetch", fetchMock);
    await tools.rollbackSnapshot({ vmid: 200, type: "lxc", snapname: "snap1", node: "pve2" });
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/lxc/200/snapshot/snap1/rollback");
  });

  it("should download template on specific node", async () => {
    const fetchMock = mockFetchSuccess("UPID:...");
    vi.stubGlobal("fetch", fetchMock);
    await tools.downloadTemplate({ template: "test.tar.zst", node: "pve2" });
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/aplinfo");
  });
});

// ==========================================================================
// DEFAULT NODE BEHAVIOR
// ==========================================================================
describe("Integration: Default node behavior", () => {
  it("should use pve as default node for all operations", async () => {
    const operations = [
      () => tools.listVms({}),
      () => tools.listContainers({}),
      () => tools.listStorages({}),
      () => tools.listNetworks({}),
      () => tools.listTasks({}),
      () => tools.nodeStatus({}),
    ];

    for (const op of operations) {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await op();
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve/");
    }
  });

  it("should use custom default node from env", async () => {
    process.env.PROXMOX_DEFAULT_NODE = "custom-node-01";
    const fetchMock = mockFetchSuccess([]);
    vi.stubGlobal("fetch", fetchMock);
    await tools.listVms({});
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/custom-node-01/");
  });

  it("should prefer explicit node over default", async () => {
    process.env.PROXMOX_DEFAULT_NODE = "default-node";
    const fetchMock = mockFetchSuccess([]);
    vi.stubGlobal("fetch", fetchMock);
    await tools.listVms({ node: "explicit-node" });
    expect(fetchMock.mock.calls[0][0]).toContain("/nodes/explicit-node/");
    expect(fetchMock.mock.calls[0][0]).not.toContain("default-node");
  });
});

// ==========================================================================
// AUTH + TOOL COMBINATIONS
// ==========================================================================
describe("Integration: Auth + tool combinations", () => {
  it("Bearer auth → VM start → task check", async () => {
    const req = createMockRequest({ headers: { authorization: "Bearer wf-key" } });
    expect(verifyApiKey(req as never)).toBe(true);

    mockApi("UPID:pve:12345");
    const startR = await tools.vmStart({ vmid: 100 });
    expect(startR.content[0].text).toContain("UPID:");

    mockApi({ status: "stopped", exitstatus: "OK" });
    const taskR = parseResult(await tools.taskStatus({ upid: "UPID:pve:12345" })) as Record<string, unknown>;
    expect(taskR.exitstatus).toBe("OK");
  });

  it("X-API-Key auth → container create → config → delete", async () => {
    const req = createMockRequest({ headers: { "x-api-key": "wf-key" } });
    expect(verifyApiKey(req as never)).toBe(true);

    mockApi("UPID:create");
    await tools.createContainer({ vmid: 700, ostemplate: "local:vztmpl/test.tar.zst" });

    mockApi(SAMPLE_CONTAINER_CONFIG);
    const cfg = parseResult(await tools.containerConfig({ vmid: 700 })) as Record<string, unknown>;
    expect(cfg).toHaveProperty("hostname");

    mockApi("UPID:del");
    await tools.deleteContainer({ vmid: 700, confirm: true });
  });

  it("query param auth → snapshot workflow", async () => {
    const req = createMockRequest({ url: "https://test.vercel.app/api/sse?api_key=wf-key" });
    expect(verifyApiKey(req as never)).toBe(true);

    mockApi("UPID:snap");
    await tools.createSnapshot({ vmid: 200, type: "lxc", snapname: "auth-snap" });

    mockApi(SAMPLE_SNAPSHOTS);
    const snaps = parseResult(await tools.listSnapshots({ vmid: 200, type: "lxc" }));
    expect(snaps).toBeDefined();

    mockApi("UPID:del-snap");
    await tools.deleteSnapshot({ vmid: 200, type: "lxc", snapname: "auth-snap" });
  });

  it("reject invalid auth → no operations", () => {
    const req = createMockRequest({ headers: { authorization: "Bearer invalid" } });
    expect(verifyApiKey(req as never)).toBe(false);
  });

  it("reject missing auth → no operations", () => {
    const req = createMockRequest();
    expect(verifyApiKey(req as never)).toBe(false);
  });
});

// ==========================================================================
// RESPONSE FORMAT VALIDATION
// ==========================================================================
describe("Integration: Response format validation", () => {
  it("JSON responses should be valid JSON", async () => {
    mockApi(SAMPLE_NODES);
    const result = await tools.listNodes();
    expect(() => JSON.parse(result.content[0].text)).not.toThrow();
  });

  it("text responses should be non-empty for successful operations", async () => {
    mockApi("UPID:test");
    const result = await tools.vmStart({ vmid: 100 });
    expect(result.content[0].text.length).toBeGreaterThan(0);
  });

  it("all responses should have content array with type text", async () => {
    mockApi(SAMPLE_VMS);
    const result = await tools.listVms({});
    expect(result.content).toBeInstanceOf(Array);
    expect(result.content[0].type).toBe("text");
    expect(typeof result.content[0].text).toBe("string");
  });

  it("JSON content should be pretty-printed", async () => {
    mockApi({ key: "value" });
    const result = await tools.vmStatus({ vmid: 100 });
    expect(result.content[0].text).toContain("\n");
    expect(result.content[0].text).toContain("  ");
  });

  it("task log should be newline-separated text", async () => {
    mockApi(SAMPLE_TASK_LOG);
    const result = await tools.taskLog({ upid: "UPID:test" });
    const lines = result.content[0].text.split("\n");
    expect(lines.length).toBe(SAMPLE_TASK_LOG.length);
  });

  it("delete container without confirm returns error message", async () => {
    const result = await tools.deleteContainer({ vmid: 200, confirm: false });
    expect(result.content[0].text).toContain("エラー");
    expect(result.content[0].text).toContain("confirm=true");
  });

  it("container update returns Japanese success message", async () => {
    mockApi(null);
    const result = await tools.updateContainerConfig({ vmid: 200, memory: 2048 });
    expect(result.content[0].text).toContain("設定更新完了");
  });

  it("start operations return Japanese text with UPID", async () => {
    mockApi("UPID:pve:test");
    const vm = await tools.vmStart({ vmid: 100 });
    expect(vm.content[0].text).toContain("起動");
    expect(vm.content[0].text).toContain("UPID:");

    mockApi("UPID:pve:test2");
    const ct = await tools.containerStart({ vmid: 200 });
    expect(ct.content[0].text).toContain("起動");
  });

  it("stop operations return Japanese text", async () => {
    mockApi("UPID:test");
    const vm = await tools.vmStop({ vmid: 100 });
    expect(vm.content[0].text).toContain("停止");

    mockApi("UPID:test2");
    const ct = await tools.containerStop({ vmid: 200 });
    expect(ct.content[0].text).toContain("停止");
  });

  it("shutdown operations return Japanese text", async () => {
    mockApi("UPID:test");
    const r = await tools.vmShutdown({ vmid: 100 });
    expect(r.content[0].text).toContain("シャットダウン");
  });

  it("reboot operations return Japanese text", async () => {
    mockApi("UPID:test");
    const r = await tools.vmReboot({ vmid: 100 });
    expect(r.content[0].text).toContain("再起動");
  });

  it("clone operations include both source and target IDs", async () => {
    mockApi("UPID:test");
    const r = await tools.cloneContainer({ vmid: 300, newid: 400 });
    expect(r.content[0].text).toContain("300");
    expect(r.content[0].text).toContain("400");
  });

  it("snapshot operations include snapshot name", async () => {
    mockApi("UPID:test");
    const create = await tools.createSnapshot({ vmid: 200, type: "lxc", snapname: "my-snap" });
    expect(create.content[0].text).toContain("my-snap");

    mockApi("UPID:test2");
    const rollback = await tools.rollbackSnapshot({ vmid: 200, type: "lxc", snapname: "my-snap" });
    expect(rollback.content[0].text).toContain("my-snap");

    mockApi("UPID:test3");
    const del = await tools.deleteSnapshot({ vmid: 200, type: "lxc", snapname: "my-snap" });
    expect(del.content[0].text).toContain("my-snap");
  });

  it("template download includes template name", async () => {
    mockApi("UPID:test");
    const r = await tools.downloadTemplate({ template: "ubuntu-24.04.tar.zst" });
    expect(r.content[0].text).toContain("ubuntu-24.04.tar.zst");
  });
});
