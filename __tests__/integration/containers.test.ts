import { describe, it, expect, vi, beforeEach } from "vitest";
import { setProxmoxEnv, mockFetchSuccess, mockFetchError, mockFetchNetworkError, SAMPLE_CONTAINERS, SAMPLE_CONTAINER_STATUS, SAMPLE_CONTAINER_CONFIG } from "../helpers";
import * as tools from "@/lib/tools";

beforeEach(() => setProxmoxEnv());
function mockApi(data: unknown) { vi.stubGlobal("fetch", mockFetchSuccess(data)); }
function parseResult(r: tools.McpContent) { return JSON.parse(r.content[0].text); }

describe("Integration: Containers", () => {
  // ======================================================================
  // LIST CONTAINERS
  // ======================================================================
  describe("listContainers full flow", () => {
    it("should list all containers", async () => {
      mockApi(SAMPLE_CONTAINERS);
      const result = await tools.listContainers({});
      expect(parseResult(result)).toHaveLength(3);
    });

    it("should include running containers", async () => {
      mockApi(SAMPLE_CONTAINERS);
      const data = parseResult(await tools.listContainers({})) as Array<Record<string, unknown>>;
      expect(data.filter(c => c.status === "running")).toHaveLength(1);
    });

    it("should include stopped containers", async () => {
      mockApi(SAMPLE_CONTAINERS);
      const data = parseResult(await tools.listContainers({})) as Array<Record<string, unknown>>;
      expect(data.filter(c => c.status === "stopped")).toHaveLength(2);
    });

    it("should identify template containers", async () => {
      mockApi(SAMPLE_CONTAINERS);
      const data = parseResult(await tools.listContainers({})) as Array<Record<string, unknown>>;
      expect(data.find(c => c.template === 1)).toBeDefined();
    });

    it("should handle empty container list", async () => {
      mockApi([]);
      expect(parseResult(await tools.listContainers({}))).toEqual([]);
    });

    it("should pass custom node", async () => {
      const fetchMock = mockFetchSuccess([]);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listContainers({ node: "pve2" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/lxc");
    });

    it("should handle API 401", async () => {
      vi.stubGlobal("fetch", mockFetchError(401, "No ticket"));
      await expect(tools.listContainers({})).rejects.toHaveProperty("status", 401);
    });

    it("should handle network error", async () => {
      vi.stubGlobal("fetch", mockFetchNetworkError("DNS resolution failed"));
      await expect(tools.listContainers({})).rejects.toThrow("DNS");
    });

    it("should handle large container count", async () => {
      const many = Array.from({ length: 200 }, (_, i) => ({ vmid: 200 + i, name: `ct-${i}`, status: "running" }));
      mockApi(many);
      expect(parseResult(await tools.listContainers({}))).toHaveLength(200);
    });
  });

  // ======================================================================
  // CONTAINER STATUS
  // ======================================================================
  describe("containerStatus full flow", () => {
    it("should return detailed status", async () => {
      mockApi(SAMPLE_CONTAINER_STATUS);
      const data = parseResult(await tools.containerStatus({ vmid: 200 })) as Record<string, unknown>;
      expect(data.status).toBe("running");
      expect(data.vmid).toBe(200);
    });

    it("should include memory info", async () => {
      mockApi(SAMPLE_CONTAINER_STATUS);
      const data = parseResult(await tools.containerStatus({ vmid: 200 })) as Record<string, unknown>;
      expect(data.mem).toBe(536870912);
      expect(data.maxmem).toBe(1073741824);
    });

    it("should include disk info", async () => {
      mockApi(SAMPLE_CONTAINER_STATUS);
      const data = parseResult(await tools.containerStatus({ vmid: 200 })) as Record<string, unknown>;
      expect(data.disk).toBe(2147483648);
    });

    it("should handle 404 for non-existent container", async () => {
      vi.stubGlobal("fetch", mockFetchError(404, "CT not found"));
      await expect(tools.containerStatus({ vmid: 999 })).rejects.toHaveProperty("status", 404);
    });

    it("should include uptime for running container", async () => {
      mockApi(SAMPLE_CONTAINER_STATUS);
      const data = parseResult(await tools.containerStatus({ vmid: 200 })) as Record<string, unknown>;
      expect(data.uptime).toBe(7200);
    });

    it("should handle stopped container status", async () => {
      mockApi({ vmid: 201, status: "stopped", cpu: 0, cpus: 2, mem: 0, maxmem: 0, uptime: 0 });
      const data = parseResult(await tools.containerStatus({ vmid: 201 })) as Record<string, unknown>;
      expect(data.status).toBe("stopped");
    });
  });

  // ======================================================================
  // CONTAINER CONFIG
  // ======================================================================
  describe("containerConfig full flow", () => {
    it("should return full config", async () => {
      mockApi(SAMPLE_CONTAINER_CONFIG);
      const data = parseResult(await tools.containerConfig({ vmid: 200 })) as Record<string, unknown>;
      expect(data.hostname).toBe("test-ct");
      expect(data.cores).toBe(1);
    });

    it("should include network config", async () => {
      mockApi(SAMPLE_CONTAINER_CONFIG);
      const data = parseResult(await tools.containerConfig({ vmid: 200 })) as Record<string, unknown>;
      expect(data.net0).toContain("bridge=vmbr0");
    });

    it("should include rootfs config", async () => {
      mockApi(SAMPLE_CONTAINER_CONFIG);
      const data = parseResult(await tools.containerConfig({ vmid: 200 })) as Record<string, unknown>;
      expect(data.rootfs).toContain("size=8G");
    });

    it("should include unprivileged flag", async () => {
      mockApi(SAMPLE_CONTAINER_CONFIG);
      const data = parseResult(await tools.containerConfig({ vmid: 200 })) as Record<string, unknown>;
      expect(data.unprivileged).toBe(1);
    });

    it("should handle complex config with mounts", async () => {
      mockApi({ ...SAMPLE_CONTAINER_CONFIG, mp0: "local-lvm:vm-200-disk-1,mp=/data,size=32G" });
      const data = parseResult(await tools.containerConfig({ vmid: 200 })) as Record<string, unknown>;
      expect(data).toHaveProperty("mp0");
    });
  });

  // ======================================================================
  // CONTAINER LIFECYCLE
  // ======================================================================
  describe("containerStart full flow", () => {
    it("should start container", async () => {
      mockApi("UPID:pve:...:vzstart:200:root@pam:");
      const result = await tools.containerStart({ vmid: 200 });
      expect(result.content[0].text).toContain("200");
      expect(result.content[0].text).toContain("起動");
    });

    it("should use custom node", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.containerStart({ vmid: 200, node: "pve2" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/lxc/200/status/start");
    });

    it("should handle already running container", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "CT already running"));
      await expect(tools.containerStart({ vmid: 200 })).rejects.toBeDefined();
    });
  });

  describe("containerStop full flow", () => {
    it("should stop container", async () => {
      mockApi("UPID:...");
      const result = await tools.containerStop({ vmid: 200 });
      expect(result.content[0].text).toContain("停止");
    });

    it("should handle already stopped container", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "CT not running"));
      await expect(tools.containerStop({ vmid: 201 })).rejects.toBeDefined();
    });
  });

  describe("containerShutdown full flow", () => {
    it("should gracefully shutdown", async () => {
      mockApi("UPID:...");
      const result = await tools.containerShutdown({ vmid: 200 });
      expect(result.content[0].text).toContain("シャットダウン");
    });

    it("should pass timeout", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.containerShutdown({ vmid: 200, timeout: 30 });
      expect(fetchMock.mock.calls[0][1].body).toContain("timeout=30");
    });

    it("should work without timeout", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.containerShutdown({ vmid: 200 });
      expect(fetchMock.mock.calls[0][1].body).toBe("");
    });
  });

  describe("containerReboot full flow", () => {
    it("should reboot container", async () => {
      mockApi("UPID:...");
      const result = await tools.containerReboot({ vmid: 200 });
      expect(result.content[0].text).toContain("再起動");
    });
  });

  // ======================================================================
  // CREATE CONTAINER
  // ======================================================================
  describe("createContainer full flow", () => {
    it("should create with minimal params", async () => {
      mockApi("UPID:pve:...:vzcreate:300:root@pam:");
      const result = await tools.createContainer({ vmid: 300, ostemplate: "local:vztmpl/debian-12.tar.zst" });
      expect(result.content[0].text).toContain("300");
      expect(result.content[0].text).toContain("作成");
    });

    it("should create with all optional params", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({
        vmid: 301, ostemplate: "local:vztmpl/debian-12.tar.zst",
        hostname: "web-01", memory: 2048, swap: 1024, cores: 4,
        rootfs: "local-lvm:16", net0: "name=eth0,bridge=vmbr0,ip=dhcp",
        password: "secret123", storage: "local-lvm", unprivileged: true, start: true,
      });
      const body = fetchMock.mock.calls[0][1].body as string;
      expect(body).toContain("vmid=301");
      expect(body).toContain("hostname=web-01");
      expect(body).toContain("memory=2048");
      expect(body).toContain("swap=1024");
      expect(body).toContain("cores=4");
      expect(body).toContain("unprivileged=1");
      expect(body).toContain("start=1");
    });

    it("should handle duplicate VMID error", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "CT 300 already exists"));
      await expect(tools.createContainer({ vmid: 300, ostemplate: "local:vztmpl/test.tar.zst" })).rejects.toBeDefined();
    });

    it("should handle invalid template error", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "Template not found"));
      await expect(tools.createContainer({ vmid: 302, ostemplate: "local:vztmpl/nonexistent.tar.zst" })).rejects.toBeDefined();
    });

    it("should handle insufficient storage error", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "Not enough space"));
      await expect(tools.createContainer({ vmid: 303, ostemplate: "local:vztmpl/test.tar.zst", rootfs: "local-lvm:1000" })).rejects.toBeDefined();
    });

    it("should create unprivileged=false as 0", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 304, ostemplate: "local:vztmpl/test.tar.zst", unprivileged: false });
      expect(fetchMock.mock.calls[0][1].body).toContain("unprivileged=0");
    });

    it("should create start=false as 0", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 304, ostemplate: "local:vztmpl/test.tar.zst", start: false });
      expect(fetchMock.mock.calls[0][1].body).toContain("start=0");
    });

    it("should include ssh-public-keys", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 305, ostemplate: "local:vztmpl/test.tar.zst", ssh_public_keys: "ssh-ed25519 AAAA..." });
      expect(fetchMock.mock.calls[0][1].body).toContain("ssh-public-keys=");
    });

    it("should use custom node for creation", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 306, ostemplate: "local:vztmpl/test.tar.zst", node: "pve2" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/lxc");
    });

    it("should not include undefined optional params", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.createContainer({ vmid: 307, ostemplate: "local:vztmpl/test.tar.zst" });
      const body = fetchMock.mock.calls[0][1].body as string;
      expect(body).not.toContain("hostname");
      expect(body).not.toContain("memory");
      expect(body).not.toContain("cores");
    });
  });

  // ======================================================================
  // CLONE CONTAINER
  // ======================================================================
  describe("cloneContainer full flow", () => {
    it("should clone with minimal params", async () => {
      mockApi("UPID:...:vzclone:300:root@pam:");
      const result = await tools.cloneContainer({ vmid: 300, newid: 310 });
      expect(result.content[0].text).toContain("300");
      expect(result.content[0].text).toContain("310");
    });

    it("should clone with all params", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.cloneContainer({ vmid: 300, newid: 311, hostname: "clone-01", full: true, storage: "local-lvm", description: "Cloned for testing" });
      const body = fetchMock.mock.calls[0][1].body as string;
      expect(body).toContain("newid=311");
      expect(body).toContain("hostname=clone-01");
      expect(body).toContain("full=1");
      expect(body).toContain("storage=local-lvm");
    });

    it("should create linked clone by default", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.cloneContainer({ vmid: 300, newid: 312 });
      const body = fetchMock.mock.calls[0][1].body as string;
      expect(body).not.toContain("full=");
    });

    it("should handle clone of running container", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "CT is running"));
      await expect(tools.cloneContainer({ vmid: 200, newid: 313 })).rejects.toBeDefined();
    });

    it("should handle duplicate newid", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "CT 200 already exists"));
      await expect(tools.cloneContainer({ vmid: 300, newid: 200 })).rejects.toBeDefined();
    });

    it("should handle clone with description", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.cloneContainer({ vmid: 300, newid: 314, description: "テスト用クローン" });
      expect(fetchMock.mock.calls[0][1].body).toContain("description=");
    });
  });

  // ======================================================================
  // DELETE CONTAINER
  // ======================================================================
  describe("deleteContainer full flow", () => {
    it("should reject without confirm", async () => {
      const result = await tools.deleteContainer({ vmid: 201, confirm: false });
      expect(result.content[0].text).toContain("confirm=true");
    });

    it("should delete with confirm=true", async () => {
      mockApi("UPID:pve:...:vzdestroy:201:root@pam:");
      const result = await tools.deleteContainer({ vmid: 201, confirm: true });
      expect(result.content[0].text).toContain("201");
      expect(result.content[0].text).toContain("削除");
    });

    it("should not call API without confirm", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.deleteContainer({ vmid: 201, confirm: false });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should pass purge option", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.deleteContainer({ vmid: 201, confirm: true, purge: true });
      expect(fetchMock.mock.calls[0][0]).toContain("purge=1");
    });

    it("should pass force option", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.deleteContainer({ vmid: 200, confirm: true, force: true });
      expect(fetchMock.mock.calls[0][0]).toContain("force=1");
    });

    it("should pass both purge and force", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.deleteContainer({ vmid: 200, confirm: true, purge: true, force: true });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain("purge=1");
      expect(url).toContain("force=1");
    });

    it("should handle delete of running container without force", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "CT is running"));
      await expect(tools.deleteContainer({ vmid: 200, confirm: true })).rejects.toBeDefined();
    });

    it("should handle delete of non-existent container", async () => {
      vi.stubGlobal("fetch", mockFetchError(404, "CT 999 not found"));
      await expect(tools.deleteContainer({ vmid: 999, confirm: true })).rejects.toHaveProperty("status", 404);
    });
  });

  // ======================================================================
  // UPDATE CONTAINER CONFIG
  // ======================================================================
  describe("updateContainerConfig full flow", () => {
    it("should update memory", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      const result = await tools.updateContainerConfig({ vmid: 200, memory: 4096 });
      expect(result.content[0].text).toContain("設定更新完了");
      expect(fetchMock.mock.calls[0][1].body).toContain("memory=4096");
    });

    it("should update cores", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.updateContainerConfig({ vmid: 200, cores: 8 });
      expect(fetchMock.mock.calls[0][1].body).toContain("cores=8");
    });

    it("should update hostname", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.updateContainerConfig({ vmid: 200, hostname: "new-name" });
      expect(fetchMock.mock.calls[0][1].body).toContain("hostname=new-name");
    });

    it("should update multiple fields at once", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.updateContainerConfig({ vmid: 200, memory: 2048, cores: 4, hostname: "updated" });
      const body = fetchMock.mock.calls[0][1].body as string;
      expect(body).toContain("memory=2048");
      expect(body).toContain("cores=4");
      expect(body).toContain("hostname=updated");
    });

    it("should set onboot to 1 for true", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.updateContainerConfig({ vmid: 200, onboot: true });
      expect(fetchMock.mock.calls[0][1].body).toContain("onboot=1");
    });

    it("should set onboot to 0 for false", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.updateContainerConfig({ vmid: 200, onboot: false });
      expect(fetchMock.mock.calls[0][1].body).toContain("onboot=0");
    });

    it("should update swap", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.updateContainerConfig({ vmid: 200, swap: 2048 });
      expect(fetchMock.mock.calls[0][1].body).toContain("swap=2048");
    });

    it("should update description", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.updateContainerConfig({ vmid: 200, description: "Updated description" });
      expect(fetchMock.mock.calls[0][1].body).toContain("description=Updated+description");
    });

    it("should update network config", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.updateContainerConfig({ vmid: 200, net0: "name=eth0,bridge=vmbr0,ip=10.0.0.50/24,gw=10.0.0.1" });
      expect(fetchMock.mock.calls[0][1].body).toContain("net0=");
    });

    it("should update startup order", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.updateContainerConfig({ vmid: 200, startup: "order=1,up=5,down=5" });
      expect(fetchMock.mock.calls[0][1].body).toContain("startup=");
    });

    it("should use PUT method", async () => {
      const fetchMock = mockFetchSuccess(null);
      vi.stubGlobal("fetch", fetchMock);
      await tools.updateContainerConfig({ vmid: 200, memory: 2048 });
      expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
    });

    it("should handle permission denied", async () => {
      vi.stubGlobal("fetch", mockFetchError(403, "No permission"));
      await expect(tools.updateContainerConfig({ vmid: 200, memory: 2048 })).rejects.toHaveProperty("status", 403);
    });

    it("should include vmid in response", async () => {
      mockApi(null);
      const result = await tools.updateContainerConfig({ vmid: 200, memory: 2048 });
      expect(result.content[0].text).toContain("200");
    });
  });

  // ======================================================================
  // CONTAINER EDGE CASES
  // ======================================================================
  describe("Container edge cases", () => {
    it("should handle lifecycle: create → start → stop → delete", async () => {
      mockApi("UPID:1");
      const r1 = await tools.createContainer({ vmid: 400, ostemplate: "local:vztmpl/debian-12.tar.zst" });
      expect(r1.content[0].text).toContain("作成");

      mockApi("UPID:2");
      const r2 = await tools.containerStart({ vmid: 400 });
      expect(r2.content[0].text).toContain("起動");

      mockApi("UPID:3");
      const r3 = await tools.containerStop({ vmid: 400 });
      expect(r3.content[0].text).toContain("停止");

      mockApi("UPID:4");
      const r4 = await tools.deleteContainer({ vmid: 400, confirm: true });
      expect(r4.content[0].text).toContain("削除");
    });

    it("should handle clone → config update → start", async () => {
      mockApi("UPID:1");
      await tools.cloneContainer({ vmid: 300, newid: 401, hostname: "cloned" });

      mockApi(null);
      await tools.updateContainerConfig({ vmid: 401, memory: 4096, cores: 4 });

      mockApi("UPID:3");
      const result = await tools.containerStart({ vmid: 401 });
      expect(result.content[0].text).toContain("起動");
    });

    it("should handle container with CCP template VMID 300", async () => {
      mockApi(SAMPLE_CONTAINER_CONFIG);
      const result = await tools.containerConfig({ vmid: 300 });
      expect(parseResult(result)).toHaveProperty("hostname");
    });

    it("should handle concurrent container operations", async () => {
      mockApi("UPID:...");
      const results = await Promise.all([
        tools.containerStart({ vmid: 200 }),
        tools.containerStart({ vmid: 201 }),
        tools.containerStart({ vmid: 202 }),
        tools.containerStart({ vmid: 203 }),
      ]);
      results.forEach(r => expect(r.content[0].text).toContain("起動"));
    });

    it("should handle container with Japanese hostname", async () => {
      mockApi({ ...SAMPLE_CONTAINER_CONFIG, hostname: "テスト-サーバー" });
      const data = parseResult(await tools.containerConfig({ vmid: 200 })) as Record<string, unknown>;
      expect(data.hostname).toBe("テスト-サーバー");
    });

    it("should handle container with multiple mount points", async () => {
      mockApi({
        ...SAMPLE_CONTAINER_CONFIG,
        mp0: "local-lvm:vm-200-disk-1,mp=/data,size=32G",
        mp1: "local-lvm:vm-200-disk-2,mp=/backup,size=64G",
        mp2: "local-lvm:vm-200-disk-3,mp=/logs,size=16G",
      });
      const data = parseResult(await tools.containerConfig({ vmid: 200 })) as Record<string, unknown>;
      expect(data).toHaveProperty("mp0");
      expect(data).toHaveProperty("mp1");
      expect(data).toHaveProperty("mp2");
    });
  });
});
