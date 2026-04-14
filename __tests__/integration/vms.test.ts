import { describe, it, expect, vi, beforeEach } from "vitest";
import { setProxmoxEnv, mockFetchSuccess, mockFetchError, mockFetchNetworkError, SAMPLE_VMS, SAMPLE_VM_STATUS, SAMPLE_VM_CONFIG } from "../helpers";
import * as tools from "@/lib/tools";

beforeEach(() => setProxmoxEnv());
function mockApi(data: unknown) { vi.stubGlobal("fetch", mockFetchSuccess(data)); }
function parseResult(r: tools.McpContent) { return JSON.parse(r.content[0].text); }

describe("Integration: VMs", () => {
  // ======================================================================
  // LIST VMs
  // ======================================================================
  describe("listVms full flow", () => {
    it("should list all VMs with status", async () => {
      mockApi(SAMPLE_VMS);
      const result = await tools.listVms({});
      const data = parseResult(result) as Array<Record<string, unknown>>;
      expect(data).toHaveLength(2);
      expect(data[0].name).toBe("test-vm");
    });

    it("should include running VM details", async () => {
      mockApi(SAMPLE_VMS);
      const result = await tools.listVms({});
      const data = parseResult(result) as Array<Record<string, unknown>>;
      const running = data.find(vm => vm.status === "running");
      expect(running).toBeDefined();
      expect(running!.vmid).toBe(100);
    });

    it("should include stopped VM details", async () => {
      mockApi(SAMPLE_VMS);
      const result = await tools.listVms({});
      const data = parseResult(result) as Array<Record<string, unknown>>;
      const stopped = data.find(vm => vm.status === "stopped");
      expect(stopped).toBeDefined();
      expect(stopped!.uptime).toBe(0);
    });

    it("should handle node with no VMs", async () => {
      mockApi([]);
      const result = await tools.listVms({});
      expect(parseResult(result)).toEqual([]);
    });

    it("should pass custom node to API", async () => {
      const fetchMock = mockFetchSuccess(SAMPLE_VMS);
      vi.stubGlobal("fetch", fetchMock);
      await tools.listVms({ node: "pve2" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/qemu");
    });

    it("should handle many VMs", async () => {
      const manyVMs = Array.from({ length: 100 }, (_, i) => ({ vmid: 100 + i, name: `vm-${i}`, status: i % 2 === 0 ? "running" : "stopped" }));
      mockApi(manyVMs);
      const result = await tools.listVms({});
      expect(parseResult(result)).toHaveLength(100);
    });

    it("should handle Proxmox auth failure", async () => {
      vi.stubGlobal("fetch", mockFetchError(401, "Auth required"));
      await expect(tools.listVms({})).rejects.toHaveProperty("status", 401);
    });

    it("should handle connection error", async () => {
      vi.stubGlobal("fetch", mockFetchNetworkError("ETIMEDOUT"));
      await expect(tools.listVms({})).rejects.toThrow("ETIMEDOUT");
    });
  });

  // ======================================================================
  // VM STATUS
  // ======================================================================
  describe("vmStatus full flow", () => {
    it("should return running VM status", async () => {
      mockApi(SAMPLE_VM_STATUS);
      const result = await tools.vmStatus({ vmid: 100 });
      const data = parseResult(result) as Record<string, unknown>;
      expect(data.status).toBe("running");
      expect(data.vmid).toBe(100);
    });

    it("should include CPU info", async () => {
      mockApi(SAMPLE_VM_STATUS);
      const result = await tools.vmStatus({ vmid: 100 });
      const data = parseResult(result) as Record<string, unknown>;
      expect(data.cpus).toBe(2);
    });

    it("should include memory info", async () => {
      mockApi(SAMPLE_VM_STATUS);
      const result = await tools.vmStatus({ vmid: 100 });
      const data = parseResult(result) as Record<string, unknown>;
      expect(data.mem).toBe(1073741824);
      expect(data.maxmem).toBe(2147483648);
    });

    it("should include uptime", async () => {
      mockApi(SAMPLE_VM_STATUS);
      const result = await tools.vmStatus({ vmid: 100 });
      const data = parseResult(result) as Record<string, unknown>;
      expect(data.uptime).toBe(3600);
    });

    it("should include PID for running VM", async () => {
      mockApi(SAMPLE_VM_STATUS);
      const result = await tools.vmStatus({ vmid: 100 });
      const data = parseResult(result) as Record<string, unknown>;
      expect(data.pid).toBe(12345);
    });

    it("should handle stopped VM status", async () => {
      mockApi({ vmid: 101, status: "stopped", cpu: 0, cpus: 4, mem: 0, maxmem: 4294967296, uptime: 0 });
      const result = await tools.vmStatus({ vmid: 101 });
      const data = parseResult(result) as Record<string, unknown>;
      expect(data.status).toBe("stopped");
    });

    it("should use correct path with custom node", async () => {
      const fetchMock = mockFetchSuccess(SAMPLE_VM_STATUS);
      vi.stubGlobal("fetch", fetchMock);
      await tools.vmStatus({ vmid: 100, node: "pve2" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/qemu/100/status/current");
    });

    it("should handle VM not found", async () => {
      vi.stubGlobal("fetch", mockFetchError(404, "VM not found"));
      await expect(tools.vmStatus({ vmid: 999 })).rejects.toHaveProperty("status", 404);
    });

    it("should handle VM with HA status", async () => {
      mockApi({ ...SAMPLE_VM_STATUS, ha: { managed: 1, state: "started" } });
      const result = await tools.vmStatus({ vmid: 100 });
      const data = parseResult(result) as Record<string, unknown>;
      expect(data).toHaveProperty("ha");
    });
  });

  // ======================================================================
  // VM CONFIG
  // ======================================================================
  describe("vmConfig full flow", () => {
    it("should return full VM config", async () => {
      mockApi(SAMPLE_VM_CONFIG);
      const result = await tools.vmConfig({ vmid: 100 });
      const data = parseResult(result) as Record<string, unknown>;
      expect(data.cores).toBe(2);
      expect(data.memory).toBe(2048);
    });

    it("should include network config", async () => {
      mockApi(SAMPLE_VM_CONFIG);
      const result = await tools.vmConfig({ vmid: 100 });
      const data = parseResult(result) as Record<string, unknown>;
      expect(data.net0).toContain("bridge=vmbr0");
    });

    it("should include disk config", async () => {
      mockApi(SAMPLE_VM_CONFIG);
      const result = await tools.vmConfig({ vmid: 100 });
      const data = parseResult(result) as Record<string, unknown>;
      expect(data.scsi0).toContain("size=32G");
    });

    it("should include boot order", async () => {
      mockApi(SAMPLE_VM_CONFIG);
      const result = await tools.vmConfig({ vmid: 100 });
      const data = parseResult(result) as Record<string, unknown>;
      expect(data.boot).toContain("order=");
    });

    it("should handle complex config with many disks", async () => {
      mockApi({ ...SAMPLE_VM_CONFIG, scsi1: "local-lvm:vm-100-disk-1,size=64G", scsi2: "local-lvm:vm-100-disk-2,size=128G" });
      const result = await tools.vmConfig({ vmid: 100 });
      const data = parseResult(result) as Record<string, unknown>;
      expect(data).toHaveProperty("scsi1");
      expect(data).toHaveProperty("scsi2");
    });
  });

  // ======================================================================
  // VM LIFECYCLE
  // ======================================================================
  describe("VM start full flow", () => {
    it("should start VM and return UPID", async () => {
      mockApi("UPID:pve:00001234:0000ABCD:65800000:qmstart:100:root@pam:");
      const result = await tools.vmStart({ vmid: 100 });
      expect(result.content[0].text).toContain("100");
      expect(result.content[0].text).toContain("UPID:");
    });

    it("should use POST method", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.vmStart({ vmid: 100 });
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    });

    it("should handle already running VM (Proxmox returns error)", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "VM already running"));
      await expect(tools.vmStart({ vmid: 100 })).rejects.toHaveProperty("status", 500);
    });

    it("should use custom node for start", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.vmStart({ vmid: 100, node: "pve2" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/");
    });
  });

  describe("VM stop full flow", () => {
    it("should stop VM and return UPID", async () => {
      mockApi("UPID:pve:...:qmstop:100:root@pam:");
      const result = await tools.vmStop({ vmid: 100 });
      expect(result.content[0].text).toContain("停止");
    });

    it("should handle already stopped VM", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "VM not running"));
      await expect(tools.vmStop({ vmid: 101 })).rejects.toHaveProperty("status", 500);
    });

    it("should work with custom node", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.vmStop({ vmid: 100, node: "pve2" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/pve2/qemu/100/status/stop");
    });
  });

  describe("VM shutdown full flow", () => {
    it("should shutdown VM gracefully", async () => {
      mockApi("UPID:...");
      const result = await tools.vmShutdown({ vmid: 100 });
      expect(result.content[0].text).toContain("シャットダウン");
    });

    it("should pass timeout to API", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.vmShutdown({ vmid: 100, timeout: 120 });
      expect(fetchMock.mock.calls[0][1].body).toContain("timeout=120");
    });

    it("should work without timeout", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.vmShutdown({ vmid: 100 });
      expect(fetchMock.mock.calls[0][1].body).toBe("");
    });

    it("should handle timeout on stopped VM", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "VM not running"));
      await expect(tools.vmShutdown({ vmid: 101 })).rejects.toBeDefined();
    });
  });

  describe("VM reboot full flow", () => {
    it("should reboot VM", async () => {
      mockApi("UPID:...");
      const result = await tools.vmReboot({ vmid: 100 });
      expect(result.content[0].text).toContain("再起動");
    });

    it("should handle reboot of stopped VM", async () => {
      vi.stubGlobal("fetch", mockFetchError(500, "VM not running"));
      await expect(tools.vmReboot({ vmid: 101 })).rejects.toBeDefined();
    });

    it("should use correct endpoint", async () => {
      const fetchMock = mockFetchSuccess("UPID:...");
      vi.stubGlobal("fetch", fetchMock);
      await tools.vmReboot({ vmid: 100, node: "compute-01" });
      expect(fetchMock.mock.calls[0][0]).toContain("/nodes/compute-01/qemu/100/status/reboot");
    });
  });

  // ======================================================================
  // VM EDGE CASES
  // ======================================================================
  describe("VM edge cases", () => {
    it("should handle VM with very large VMID", async () => {
      mockApi({ vmid: 999999, name: "big-id", status: "running" });
      const result = await tools.vmStatus({ vmid: 999999 });
      expect(parseResult(result)).toHaveProperty("vmid", 999999);
    });

    it("should handle VM with VMID 100 (minimum common)", async () => {
      const fetchMock = mockFetchSuccess({});
      vi.stubGlobal("fetch", fetchMock);
      await tools.vmStatus({ vmid: 100 });
      expect(fetchMock.mock.calls[0][0]).toContain("/qemu/100/");
    });

    it("should handle start then immediate status check", async () => {
      mockApi("UPID:pve:...");
      const startResult = await tools.vmStart({ vmid: 100 });
      expect(startResult.content[0].text).toContain("起動");

      mockApi({ vmid: 100, status: "running", uptime: 1 });
      const statusResult = await tools.vmStatus({ vmid: 100 });
      expect(parseResult(statusResult)).toHaveProperty("status", "running");
    });

    it("should handle VM config with GPU passthrough", async () => {
      mockApi({ ...SAMPLE_VM_CONFIG, hostpci0: "0000:01:00.0,x-vga=1" });
      const result = await tools.vmConfig({ vmid: 100 });
      const data = parseResult(result) as Record<string, unknown>;
      expect(data).toHaveProperty("hostpci0");
    });

    it("should handle VM config with USB passthrough", async () => {
      mockApi({ ...SAMPLE_VM_CONFIG, usb0: "host=1234:5678" });
      const result = await tools.vmConfig({ vmid: 100 });
      const data = parseResult(result) as Record<string, unknown>;
      expect(data).toHaveProperty("usb0");
    });

    it("should handle sequential lifecycle operations", async () => {
      mockApi("UPID:1");
      const r1 = await tools.vmStart({ vmid: 100 });
      expect(r1.content[0].text).toContain("起動");

      mockApi("UPID:2");
      const r2 = await tools.vmShutdown({ vmid: 100 });
      expect(r2.content[0].text).toContain("シャットダウン");

      mockApi("UPID:3");
      const r3 = await tools.vmStart({ vmid: 100 });
      expect(r3.content[0].text).toContain("起動");
    });

    it("should handle concurrent VM operations", async () => {
      mockApi("UPID:...");
      const results = await Promise.all([
        tools.vmStart({ vmid: 100 }),
        tools.vmStart({ vmid: 101 }),
        tools.vmStart({ vmid: 102 }),
      ]);
      results.forEach(r => expect(r.content[0].text).toContain("起動"));
    });
  });
});
