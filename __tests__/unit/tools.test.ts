import { describe, it, expect, vi, beforeEach } from "vitest";
import { setProxmoxEnv, mockFetchSuccess, mockFetchError } from "../helpers";
import * as tools from "@/lib/tools";
import {
  SAMPLE_NODES, SAMPLE_CLUSTER_STATUS, SAMPLE_CLUSTER_RESOURCES,
  SAMPLE_VMS, SAMPLE_VM_STATUS, SAMPLE_VM_CONFIG,
  SAMPLE_CONTAINERS, SAMPLE_CONTAINER_STATUS, SAMPLE_CONTAINER_CONFIG,
  SAMPLE_STORAGES, SAMPLE_STORAGE_CONTENT,
  SAMPLE_SNAPSHOTS, SAMPLE_TASKS, SAMPLE_TASK_STATUS, SAMPLE_TASK_LOG,
  SAMPLE_NETWORKS, SAMPLE_TEMPLATES,
} from "../helpers";

beforeEach(() => {
  setProxmoxEnv();
});

function mockApi(data: unknown) {
  vi.stubGlobal("fetch", mockFetchSuccess(data));
}

function parseResult(result: tools.McpContent): unknown {
  return JSON.parse(result.content[0].text);
}

// ==========================================================================
// CLUSTER TOOLS
// ==========================================================================
describe("Cluster tools", () => {
  describe("clusterStatus", () => {
    it("should return cluster status data", async () => {
      mockApi(SAMPLE_CLUSTER_STATUS);
      const result = await tools.clusterStatus();
      const data = parseResult(result) as typeof SAMPLE_CLUSTER_STATUS;
      expect(data).toHaveLength(3);
      expect(data[0].type).toBe("cluster");
    });

    it("should return empty array for single node", async () => {
      mockApi([]);
      const result = await tools.clusterStatus();
      expect(parseResult(result)).toEqual([]);
    });

    it("should propagate API errors", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "Internal Error"));
      await expect(tools.clusterStatus()).rejects.toHaveProperty("status", 500);
    });
  });

  describe("clusterResources", () => {
    it("should return all resources when no type filter", async () => {
      mockApi(SAMPLE_CLUSTER_RESOURCES);
      const result = await tools.clusterResources({});
      expect(parseResult(result)).toHaveLength(3);
    });

    it("should pass type filter to API", async () => {
      const fetchMock = mockFetchSuccess([SAMPLE_CLUSTER_RESOURCES[0]]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.clusterResources({ type: "vm" });
      expect(fetchMock.mock.calls[0][0]).toContain("type=vm");
    });

    it("should handle storage type filter", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.clusterResources({ type: "storage" });
      expect(fetchMock.mock.calls[0][0]).toContain("type=storage");
    });

    it("should handle node type filter", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.clusterResources({ type: "node" });
      expect(fetchMock.mock.calls[0][0]).toContain("type=node");
    });
  });
});

// ==========================================================================
// NODE TOOLS
// ==========================================================================
describe("Node tools", () => {
  describe("listNodes", () => {
    it("should format node data with cpu/memory/uptime", async () => {
      mockApi(SAMPLE_NODES);
      const result = await tools.listNodes();
      const data = parseResult(result) as Array<Record<string, string>>;
      expect(data).toHaveLength(2);
      expect(data[0].node).toBe("pve");
      expect(data[0].cpu).toContain("%");
      expect(data[0].memory).toContain("GiB");
      expect(data[0].uptime).toContain("d");
    });

    it("should calculate CPU percentage correctly", async () => {
      mockApi([{ node: "pve", status: "online", cpu: 0.5, maxcpu: 4, mem: 0, maxmem: 1, uptime: 0 }]);
      const result = await tools.listNodes();
      const data = parseResult(result) as Array<Record<string, string>>;
      expect(data[0].cpu).toBe("50.0% (4 cores)");
    });

    it("should calculate memory percentage correctly", async () => {
      mockApi([{ node: "pve", status: "online", cpu: 0, maxcpu: 1, mem: 536870912, maxmem: 1073741824, uptime: 0 }]);
      const result = await tools.listNodes();
      const data = parseResult(result) as Array<Record<string, string>>;
      expect(data[0].memory).toContain("50.0%");
    });

    it("should handle empty node list", async () => {
      mockApi([]);
      const result = await tools.listNodes();
      expect(parseResult(result)).toEqual([]);
    });
  });

  describe("nodeStatus", () => {
    it("should use specified node", async () => {
      const fetchMock = mockFetchSuccess({ kversion: "6.1.0" });
      vi.stubGlobal("fetch", fetchMock);
      await tools.nodeStatus({ node: "pve2" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/status");
    });

    it("should use default node when not specified", async () => {
      const fetchMock = mockFetchSuccess({ kversion: "6.1.0" });
      vi.stubGlobal("fetch", fetchMock);
      await tools.nodeStatus({});
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve/status");
    });

    it("should return node status data", async () => {
      mockApi({ kversion: "6.1.0", uptime: 100000 });
      const result = await tools.nodeStatus({});
      const data = parseResult(result) as Record<string, unknown>;
      expect(data.kversion).toBe("6.1.0");
    });
  });
});

// ==========================================================================
// VM TOOLS
// ==========================================================================
describe("VM tools", () => {
  describe("listVms", () => {
    it("should return VM list", async () => {
      mockApi(SAMPLE_VMS);
      const result = await tools.listVms({});
      expect(parseResult(result)).toHaveLength(2);
    });

    it("should use specified node", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listVms({ node: "pve2" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/qemu");
    });

    it("should use default node", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listVms({});
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve/qemu");
    });
  });

  describe("vmStatus", () => {
    it("should fetch correct VM status path", async () => {
      const fetchMock = mockFetchSuccess(SAMPLE_VM_STATUS);
      vi.stubGlobal("fetch", fetchMock);
      await tools.vmStatus({ vmid: 100 });
      expect(fetchMock.mock.calls[0][0]).toContain("/qemu/100/status/current");
    });

    it("should return VM status data", async () => {
      mockApi(SAMPLE_VM_STATUS);
      const result = await tools.vmStatus({ vmid: 100 });
      const data = parseResult(result) as Record<string, unknown>;
      expect(data.status).toBe("running");
    });
  });

  describe("vmConfig", () => {
    it("should fetch correct VM config path", async () => {
      const fetchMock = mockFetchSuccess(SAMPLE_VM_CONFIG);
      vi.stubGlobal("fetch", fetchMock);
      await tools.vmConfig({ vmid: 100 });
      expect(fetchMock.mock.calls[0][0]).toContain("/qemu/100/config");
    });

    it("should return VM config data", async () => {
      mockApi(SAMPLE_VM_CONFIG);
      const result = await tools.vmConfig({ vmid: 100 });
      const data = parseResult(result) as Record<string, unknown>;
      expect(data.cores).toBe(2);
    });
  });

  describe("vmStart", () => {
    it("should POST to start endpoint", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:000...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.vmStart({ vmid: 100 });
      expect(fetchMock.mock.calls[0][0]).toContain("/qemu/100/status/start");
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    });

    it("should include vmid in response text", async () => {
      mockApi("UPID:pve:000...");
      const result = await tools.vmStart({ vmid: 100 });
      expect(result.content[0].text).toContain("100");
      expect(result.content[0].text).toContain("起動");
    });
  });

  describe("vmStop", () => {
    it("should POST to stop endpoint", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:000...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.vmStop({ vmid: 100 });
      expect(fetchMock.mock.calls[0][0]).toContain("/qemu/100/status/stop");
    });

    it("should include vmid in response text", async () => {
      mockApi("UPID:pve:000...");
      const result = await tools.vmStop({ vmid: 100 });
      expect(result.content[0].text).toContain("100");
      expect(result.content[0].text).toContain("停止");
    });
  });

  describe("vmShutdown", () => {
    it("should POST to shutdown endpoint", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:000...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.vmShutdown({ vmid: 100 });
      expect(fetchMock.mock.calls[0][0]).toContain("/qemu/100/status/shutdown");
    });

    it("should pass timeout parameter", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:000...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.vmShutdown({ vmid: 100, timeout: 30 });
      expect(fetchMock.mock.calls[0][1].body).toContain("timeout=30");
    });

    it("should not pass timeout when undefined", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:000...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.vmShutdown({ vmid: 100 });
      expect(fetchMock.mock.calls[0][1].body).toBe("");
    });
  });

  describe("vmReboot", () => {
    it("should POST to reboot endpoint", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:000...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.vmReboot({ vmid: 100 });
      expect(fetchMock.mock.calls[0][0]).toContain("/qemu/100/status/reboot");
    });
  });
});

// ==========================================================================
// CONTAINER TOOLS
// ==========================================================================
describe("Container tools", () => {
  describe("listContainers", () => {
    it("should return container list", async () => {
      mockApi(SAMPLE_CONTAINERS);
      const result = await tools.listContainers({});
      expect(parseResult(result)).toHaveLength(3);
    });

    it("should use specified node", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listContainers({ node: "pve2" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/lxc");
    });
  });

  describe("containerStatus", () => {
    it("should fetch correct path", async () => {
      const fetchMock = mockFetchSuccess(SAMPLE_CONTAINER_STATUS);
      vi.stubGlobal("fetch", fetchMock);
      await tools.containerStatus({ vmid: 200 });
      expect(fetchMock.mock.calls[0][0]).toContain("/lxc/200/status/current");
    });
  });

  describe("containerConfig", () => {
    it("should fetch correct path", async () => {
      const fetchMock = mockFetchSuccess(SAMPLE_CONTAINER_CONFIG);
      vi.stubGlobal("fetch", fetchMock);
      await tools.containerConfig({ vmid: 200 });
      expect(fetchMock.mock.calls[0][0]).toContain("/lxc/200/config");
    });
  });

  describe("containerStart", () => {
    it("should POST to start endpoint", async () => {
      const fetchMock = mockFetchSuccess("UPID:pve:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.containerStart({ vmid: 200 });
      expect(fetchMock.mock.calls[0][0]).toContain("/lxc/200/status/start");
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    });

    it("should include vmid in response", async () => {
      mockApi("UPID:...");
      const result = await tools.containerStart({ vmid: 200 });
      expect(result.content[0].text).toContain("200");
    });
  });

  describe("containerStop", () => {
    it("should POST to stop endpoint", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.containerStop({ vmid: 200 });
      expect(fetchMock.mock.calls[0][0]).toContain("/lxc/200/status/stop");
    });
  });

  describe("containerShutdown", () => {
    it("should POST to shutdown endpoint", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.containerShutdown({ vmid: 200 });
      expect(fetchMock.mock.calls[0][0]).toContain("/lxc/200/status/shutdown");
    });

    it("should pass timeout when specified", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.containerShutdown({ vmid: 200, timeout: 60 });
      expect(fetchMock.mock.calls[0][1].body).toContain("timeout=60");
    });
  });

  describe("containerReboot", () => {
    it("should POST to reboot endpoint", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.containerReboot({ vmid: 200 });
      expect(fetchMock.mock.calls[0][0]).toContain("/lxc/200/status/reboot");
    });
  });

  describe("createContainer", () => {
    it("should POST with required params", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 300, ostemplate: "local:vztmpl/debian-12.tar.zst" });
      expect(fetchMock.mock.calls[0][0]).toContain("/lxc");
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
      expect(fetchMock.mock.calls[0][1].body).toContain("vmid=300");
      expect(fetchMock.mock.calls[0][1].body).toContain("ostemplate=");
    });

    it("should include optional hostname", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 300, ostemplate: "local:vztmpl/test.tar.zst", hostname: "test-ct" });
      expect(fetchMock.mock.calls[0][1].body).toContain("hostname=test-ct");
    });

    it("should include memory parameter", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 300, ostemplate: "local:vztmpl/test.tar.zst", memory: 2048 });
      expect(fetchMock.mock.calls[0][1].body).toContain("memory=2048");
    });

    it("should include swap parameter", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 300, ostemplate: "local:vztmpl/test.tar.zst", swap: 1024 });
      expect(fetchMock.mock.calls[0][1].body).toContain("swap=1024");
    });

    it("should include cores parameter", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 300, ostemplate: "local:vztmpl/test.tar.zst", cores: 4 });
      expect(fetchMock.mock.calls[0][1].body).toContain("cores=4");
    });

    it("should convert unprivileged true to 1", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 300, ostemplate: "local:vztmpl/test.tar.zst", unprivileged: true });
      expect(fetchMock.mock.calls[0][1].body).toContain("unprivileged=1");
    });

    it("should convert unprivileged false to 0", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 300, ostemplate: "local:vztmpl/test.tar.zst", unprivileged: false });
      expect(fetchMock.mock.calls[0][1].body).toContain("unprivileged=0");
    });

    it("should convert start true to 1", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 300, ostemplate: "local:vztmpl/test.tar.zst", start: true });
      expect(fetchMock.mock.calls[0][1].body).toContain("start=1");
    });

    it("should include net0 parameter", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 300, ostemplate: "local:vztmpl/test.tar.zst", net0: "name=eth0,bridge=vmbr0,ip=dhcp" });
      expect(fetchMock.mock.calls[0][1].body).toContain("net0=");
    });

    it("should include rootfs parameter", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 300, ostemplate: "local:vztmpl/test.tar.zst", rootfs: "local-lvm:8" });
      expect(fetchMock.mock.calls[0][1].body).toContain("rootfs=");
    });

    it("should include storage parameter", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 300, ostemplate: "local:vztmpl/test.tar.zst", storage: "local-lvm" });
      expect(fetchMock.mock.calls[0][1].body).toContain("storage=local-lvm");
    });

    it("should include ssh-public-keys as hyphenated key", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 300, ostemplate: "local:vztmpl/test.tar.zst", ssh_public_keys: "ssh-rsa AAAA..." });
      expect(fetchMock.mock.calls[0][1].body).toContain("ssh-public-keys=");
    });
  });

  describe("cloneContainer", () => {
    it("should POST to clone endpoint with newid", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.cloneContainer({ vmid: 300, newid: 301 });
      expect(fetchMock.mock.calls[0][0]).toContain("/lxc/300/clone");
      expect(fetchMock.mock.calls[0][1].body).toContain("newid=301");
    });

    it("should include hostname for clone", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.cloneContainer({ vmid: 300, newid: 301, hostname: "clone-ct" });
      expect(fetchMock.mock.calls[0][1].body).toContain("hostname=clone-ct");
    });

    it("should convert full=true to 1", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.cloneContainer({ vmid: 300, newid: 301, full: true });
      expect(fetchMock.mock.calls[0][1].body).toContain("full=1");
    });

    it("should convert full=false to 0", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.cloneContainer({ vmid: 300, newid: 301, full: false });
      expect(fetchMock.mock.calls[0][1].body).toContain("full=0");
    });

    it("should include both vmids in response text", async () => {
      mockApi("UPID:...");
      const result = await tools.cloneContainer({ vmid: 300, newid: 301 });
      expect(result.content[0].text).toContain("300");
      expect(result.content[0].text).toContain("301");
    });
  });

  describe("deleteContainer", () => {
    it("should reject when confirm is false", async () => {
      const result = await tools.deleteContainer({ vmid: 200, confirm: false });
      expect(result.content[0].text).toContain("confirm=true");
    });

    it("should DELETE when confirm is true", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.deleteContainer({ vmid: 200, confirm: true });
      expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    });

    it("should include purge param", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.deleteContainer({ vmid: 200, confirm: true, purge: true });
      expect(fetchMock.mock.calls[0][0]).toContain("purge=1");
    });

    it("should include force param", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.deleteContainer({ vmid: 200, confirm: true, force: true });
      expect(fetchMock.mock.calls[0][0]).toContain("force=1");
    });

    it("should not call API when confirm is false", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.deleteContainer({ vmid: 200, confirm: false });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("updateContainerConfig", () => {
    it("should PUT to config endpoint", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.updateContainerConfig({ vmid: 200, memory: 2048 });
      expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
      expect(fetchMock.mock.calls[0][0]).toContain("/lxc/200/config");
    });

    it("should include memory in body", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.updateContainerConfig({ vmid: 200, memory: 2048 });
      expect(fetchMock.mock.calls[0][1].body).toContain("memory=2048");
    });

    it("should include multiple params", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.updateContainerConfig({ vmid: 200, memory: 2048, cores: 2, hostname: "new" });
      const body = fetchMock.mock.calls[0][1].body as string;
      expect(body).toContain("memory=2048");
      expect(body).toContain("cores=2");
      expect(body).toContain("hostname=new");
    });

    it("should convert onboot true to 1", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.updateContainerConfig({ vmid: 200, onboot: true });
      expect(fetchMock.mock.calls[0][1].body).toContain("onboot=1");
    });

    it("should return success message", async () => {
      mockApi(null);
      const result = await tools.updateContainerConfig({ vmid: 200, memory: 2048 });
      expect(result.content[0].text).toContain("200");
      expect(result.content[0].text).toContain("設定更新完了");
    });
  });
});

// ==========================================================================
// STORAGE TOOLS
// ==========================================================================
describe("Storage tools", () => {
  describe("listStorages", () => {
    it("should return storage list", async () => {
      mockApi(SAMPLE_STORAGES);
      const result = await tools.listStorages({});
      expect(parseResult(result)).toHaveLength(2);
    });

    it("should pass content filter", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listStorages({ content: "images" });
      expect(fetchMock.mock.calls[0][0]).toContain("content=images");
    });

    it("should not include content param when undefined", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listStorages({});
      expect(fetchMock.mock.calls[0][0]).not.toContain("content=");
    });
  });

  describe("storageContent", () => {
    it("should return storage content", async () => {
      mockApi(SAMPLE_STORAGE_CONTENT);
      const result = await tools.storageContent({ storage: "local" });
      expect(parseResult(result)).toHaveLength(2);
    });

    it("should pass content filter", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.storageContent({ storage: "local", content: "vztmpl" });
      expect(fetchMock.mock.calls[0][0]).toContain("content=vztmpl");
    });

    it("should use correct storage in path", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.storageContent({ storage: "local-lvm" });
      expect(fetchMock.mock.calls[0][0]).toContain("/storage/local-lvm/content");
    });
  });
});

// ==========================================================================
// SNAPSHOT TOOLS
// ==========================================================================
describe("Snapshot tools", () => {
  describe("listSnapshots", () => {
    it("should use correct path for lxc", async () => {
      const fetchMock = mockFetchSuccess(SAMPLE_SNAPSHOTS);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listSnapshots({ vmid: 200, type: "lxc" });
      expect(fetchMock.mock.calls[0][0]).toContain("/lxc/200/snapshot");
    });

    it("should use correct path for qemu", async () => {
      const fetchMock = mockFetchSuccess(SAMPLE_SNAPSHOTS);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listSnapshots({ vmid: 100, type: "qemu" });
      expect(fetchMock.mock.calls[0][0]).toContain("/qemu/100/snapshot");
    });
  });

  describe("createSnapshot", () => {
    it("should POST with snapname", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createSnapshot({ vmid: 200, type: "lxc", snapname: "snap1" });
      expect(fetchMock.mock.calls[0][1].body).toContain("snapname=snap1");
    });

    it("should include description when provided", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createSnapshot({ vmid: 200, type: "lxc", snapname: "snap1", description: "Before update" });
      expect(fetchMock.mock.calls[0][1].body).toContain("description=Before+update");
    });

    it("should include snapname in response", async () => {
      mockApi("UPID:...");
      const result = await tools.createSnapshot({ vmid: 200, type: "lxc", snapname: "snap1" });
      expect(result.content[0].text).toContain("snap1");
    });
  });

  describe("rollbackSnapshot", () => {
    it("should POST to rollback endpoint", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.rollbackSnapshot({ vmid: 200, type: "lxc", snapname: "snap1" });
      expect(fetchMock.mock.calls[0][0]).toContain("/snapshot/snap1/rollback");
    });
  });

  describe("deleteSnapshot", () => {
    it("should DELETE snapshot", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.deleteSnapshot({ vmid: 200, type: "lxc", snapname: "snap1" });
      expect(fetchMock.mock.calls[0][0]).toContain("/snapshot/snap1");
      expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
    });
  });
});

// ==========================================================================
// TASK TOOLS
// ==========================================================================
describe("Task tools", () => {
  describe("listTasks", () => {
    it("should return task list", async () => {
      mockApi(SAMPLE_TASKS);
      const result = await tools.listTasks({});
      expect(parseResult(result)).toHaveLength(2);
    });

    it("should pass limit parameter", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listTasks({ limit: 10 });
      expect(fetchMock.mock.calls[0][0]).toContain("limit=10");
    });

    it("should pass vmid filter", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listTasks({ vmid: 200 });
      expect(fetchMock.mock.calls[0][0]).toContain("vmid=200");
    });

    it("should not add query string when no params", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listTasks({});
      expect(fetchMock.mock.calls[0][0]).toMatch(/\/tasks$/);
    });
  });

  describe("taskStatus", () => {
    it("should encode UPID in URL", async () => {
      const upid = "UPID:pve:00001234:0000ABCD:65800000:vzstart:200:root@pam:";
      const fetchMock = mockFetchSuccess(SAMPLE_TASK_STATUS);
      vi.stubGlobal("fetch", fetchMock);
      await tools.taskStatus({ upid });
      expect(fetchMock.mock.calls[0][0]).toContain(encodeURIComponent(upid));
    });
  });

  describe("taskLog", () => {
    it("should return concatenated log lines", async () => {
      mockApi(SAMPLE_TASK_LOG);
      const result = await tools.taskLog({ upid: "UPID:pve:..." });
      expect(result.content[0].text).toContain("Starting container 200");
      expect(result.content[0].text).toContain("TASK OK");
    });

    it("should pass limit parameter", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.taskLog({ upid: "UPID:pve:...", limit: 100 });
      expect(fetchMock.mock.calls[0][0]).toContain("limit=100");
    });

    it("should handle empty log", async () => {
      mockApi([]);
      const result = await tools.taskLog({ upid: "UPID:pve:..." });
      expect(result.content[0].text).toBe("");
    });
  });
});

// ==========================================================================
// NETWORK TOOLS
// ==========================================================================
describe("Network tools", () => {
  describe("listNetworks", () => {
    it("should return network list", async () => {
      mockApi(SAMPLE_NETWORKS);
      const result = await tools.listNetworks({});
      expect(parseResult(result)).toHaveLength(3);
    });

    it("should pass type filter", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listNetworks({ type: "bridge" });
      expect(fetchMock.mock.calls[0][0]).toContain("type=bridge");
    });
  });
});

// ==========================================================================
// TEMPLATE TOOLS
// ==========================================================================
describe("Template tools", () => {
  describe("listTemplates", () => {
    it("should fetch from local storage by default", async () => {
      const fetchMock = mockFetchSuccess(SAMPLE_TEMPLATES);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listTemplates({});
      expect(fetchMock.mock.calls[0][0]).toContain("/storage/local/content");
    });

    it("should use specified storage", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listTemplates({ storage: "nfs" });
      expect(fetchMock.mock.calls[0][0]).toContain("/storage/nfs/content");
    });

    it("should filter by vztmpl content type", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listTemplates({});
      expect(fetchMock.mock.calls[0][0]).toContain("content=vztmpl");
    });
  });

  describe("downloadTemplate", () => {
    it("should POST to aplinfo endpoint", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.downloadTemplate({ template: "debian-12.tar.zst" });
      expect(fetchMock.mock.calls[0][0]).toContain("/aplinfo");
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    });

    it("should use default storage", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.downloadTemplate({ template: "debian-12.tar.zst" });
      expect(fetchMock.mock.calls[0][1].body).toContain("storage=local");
    });

    it("should include template name in response", async () => {
      mockApi("UPID:...");
      const result = await tools.downloadTemplate({ template: "debian-12.tar.zst" });
      expect(result.content[0].text).toContain("debian-12.tar.zst");
    });
  });
});

// ==========================================================================
// GENERIC API
// ==========================================================================
describe("Generic API tool", () => {
  describe("apiRequest", () => {
    it("should make GET request by default", async () => {
      const fetchMock = mockFetchSuccess({ version: "8.0" });
      vi.stubGlobal("fetch", fetchMock);
      await tools.apiRequest({ path: "version" });
      expect(fetchMock.mock.calls[0][1].method).toBe("GET");
    });

    it("should use specified method", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.apiRequest({ path: "nodes/pve/lxc/200/status/start", method: "POST" });
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    });

    it("should pass body for POST", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.apiRequest({ path: "nodes/pve/lxc", method: "POST", body: { vmid: 999 } });
      expect(fetchMock.mock.calls[0][1].body).toContain("vmid=999");
    });

    it("should return JSON content", async () => {
      mockApi({ version: "8.0" });
      const result = await tools.apiRequest({ path: "version" });
      const data = parseResult(result) as Record<string, string>;
      expect(data.version).toBe("8.0");
    });

    it("should handle arbitrary paths", async () => {
      const fetchMock = mockFetchSuccess({});
      vi.stubGlobal("fetch", fetchMock);
      await tools.apiRequest({ path: "nodes/pve/qemu/100/agent/exec" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve/qemu/100/agent/exec");
    });
  });
});
