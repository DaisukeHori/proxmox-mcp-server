import { vi } from "vitest";

// ---------------------------------------------------------------------------
// Environment helpers
// ---------------------------------------------------------------------------

export function setProxmoxEnv(overrides: Partial<{
  PROXMOX_BASE_URL: string;
  PROXMOX_TOKEN_ID: string;
  PROXMOX_TOKEN_SECRET: string;
  PROXMOX_DEFAULT_NODE: string;
  MCP_API_KEY: string;
}> = {}) {
  process.env.PROXMOX_BASE_URL = overrides.PROXMOX_BASE_URL ?? "https://proxmox.test.local";
  process.env.PROXMOX_TOKEN_ID = overrides.PROXMOX_TOKEN_ID ?? "test@pve!test-token";
  process.env.PROXMOX_TOKEN_SECRET = overrides.PROXMOX_TOKEN_SECRET ?? "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  process.env.PROXMOX_DEFAULT_NODE = overrides.PROXMOX_DEFAULT_NODE ?? "pve";
  if (overrides.MCP_API_KEY !== undefined) {
    process.env.MCP_API_KEY = overrides.MCP_API_KEY;
  }
}

// ---------------------------------------------------------------------------
// Fetch mock helpers
// ---------------------------------------------------------------------------

export function mockFetchSuccess(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: async () => ({ data }),
    text: async () => JSON.stringify({ data }),
  });
}

export function mockFetchError(status: number, message: string) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: message,
    json: async () => ({ errors: { message } }),
    text: async () => message,
  });
}

export function mockFetchNetworkError(errorMessage = "Network error") {
  return vi.fn().mockRejectedValue(new Error(errorMessage));
}

export function mockFetchSequence(responses: Array<{ data?: unknown; status?: number; error?: string }>) {
  const fn = vi.fn();
  responses.forEach((r, i) => {
    if (r.error) {
      fn.mockRejectedValueOnce(new Error(r.error));
    } else {
      fn.mockResolvedValueOnce({
        ok: (r.status ?? 200) >= 200 && (r.status ?? 200) < 300,
        status: r.status ?? 200,
        statusText: "OK",
        json: async () => ({ data: r.data }),
        text: async () => JSON.stringify({ data: r.data }),
      });
    }
  });
  return fn;
}

// ---------------------------------------------------------------------------
// Mock NextRequest
// ---------------------------------------------------------------------------

export function createMockRequest(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
} = {}) {
  const url = options.url ?? "https://test.vercel.app/api/mcp";
  const headers = new Map(Object.entries(options.headers ?? {}));
  return {
    method: options.method ?? "POST",
    url,
    headers: {
      get: (key: string) => headers.get(key.toLowerCase()) ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// Sample Proxmox API responses
// ---------------------------------------------------------------------------

export const SAMPLE_NODES = [
  {
    node: "pve",
    status: "online",
    cpu: 0.0523,
    maxcpu: 16,
    mem: 8589934592,
    maxmem: 67108864000,
    uptime: 259200,
  },
  {
    node: "pve2",
    status: "online",
    cpu: 0.1234,
    maxcpu: 8,
    mem: 4294967296,
    maxmem: 33554432000,
    uptime: 86400,
  },
];

export const SAMPLE_CLUSTER_STATUS = [
  { type: "cluster", name: "cluster1", version: 3, nodes: 2, quorate: 1 },
  { type: "node", name: "pve", nodeid: 1, online: 1, ip: "192.168.70.226" },
  { type: "node", name: "pve2", nodeid: 2, online: 1, ip: "192.168.70.227" },
];

export const SAMPLE_CLUSTER_RESOURCES = [
  { id: "qemu/100", type: "qemu", node: "pve", vmid: 100, name: "test-vm", status: "running", cpu: 0.01, maxcpu: 2, mem: 1073741824, maxmem: 2147483648 },
  { id: "lxc/200", type: "lxc", node: "pve", vmid: 200, name: "test-ct", status: "running", cpu: 0.005, maxcpu: 1, mem: 536870912, maxmem: 1073741824 },
  { id: "storage/local", type: "storage", node: "pve", storage: "local", status: "available", disk: 10737418240, maxdisk: 107374182400 },
];

export const SAMPLE_VMS = [
  { vmid: 100, name: "test-vm", status: "running", cpu: 0.015, maxcpu: 2, mem: 1073741824, maxmem: 2147483648, uptime: 3600 },
  { vmid: 101, name: "dev-vm", status: "stopped", cpu: 0, maxcpu: 4, mem: 0, maxmem: 4294967296, uptime: 0 },
];

export const SAMPLE_VM_STATUS = {
  vmid: 100,
  name: "test-vm",
  status: "running",
  cpu: 0.015,
  cpus: 2,
  mem: 1073741824,
  maxmem: 2147483648,
  disk: 0,
  maxdisk: 34359738368,
  uptime: 3600,
  pid: 12345,
  qmpstatus: "running",
};

export const SAMPLE_VM_CONFIG = {
  boot: "order=scsi0;ide2;net0",
  cores: 2,
  memory: 2048,
  name: "test-vm",
  net0: "virtio=AA:BB:CC:DD:EE:FF,bridge=vmbr0",
  ostype: "l26",
  scsi0: "local-lvm:vm-100-disk-0,size=32G",
  scsihw: "virtio-scsi-pci",
  smbios1: "uuid=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
};

export const SAMPLE_CONTAINERS = [
  { vmid: 200, name: "test-ct", status: "running", cpu: 0.005, maxcpu: 1, mem: 536870912, maxmem: 1073741824, uptime: 7200, type: "lxc" },
  { vmid: 201, name: "dev-ct", status: "stopped", cpu: 0, maxcpu: 2, mem: 0, maxmem: 2147483648, uptime: 0, type: "lxc" },
  { vmid: 300, name: "template-ct", status: "stopped", cpu: 0, maxcpu: 1, mem: 0, maxmem: 536870912, uptime: 0, type: "lxc", template: 1 },
];

export const SAMPLE_CONTAINER_STATUS = {
  vmid: 200,
  name: "test-ct",
  status: "running",
  cpu: 0.005,
  cpus: 1,
  mem: 536870912,
  maxmem: 1073741824,
  disk: 2147483648,
  maxdisk: 8589934592,
  uptime: 7200,
  type: "lxc",
};

export const SAMPLE_CONTAINER_CONFIG = {
  arch: "amd64",
  cores: 1,
  hostname: "test-ct",
  memory: 1024,
  net0: "name=eth0,bridge=vmbr0,hwaddr=AA:BB:CC:DD:EE:FF,ip=dhcp,type=veth",
  ostype: "debian",
  rootfs: "local-lvm:vm-200-disk-0,size=8G",
  swap: 512,
  unprivileged: 1,
};

export const SAMPLE_STORAGES = [
  { storage: "local", type: "dir", content: "vztmpl,iso,backup", active: 1, enabled: 1, shared: 0, used: 10737418240, avail: 96636764160, total: 107374182400, used_fraction: 0.1 },
  { storage: "local-lvm", type: "lvmthin", content: "images,rootdir", active: 1, enabled: 1, shared: 0, used: 21474836480, avail: 85899345920, total: 107374182400, used_fraction: 0.2 },
];

export const SAMPLE_STORAGE_CONTENT = [
  { volid: "local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst", format: "tzst", size: 134217728, content: "vztmpl" },
  { volid: "local:iso/ubuntu-22.04.3-live-server-amd64.iso", format: "iso", size: 2147483648, content: "iso" },
];

export const SAMPLE_SNAPSHOTS = [
  { name: "current", description: "", snaptime: 0, parent: "snap1" },
  { name: "snap1", description: "Before update", snaptime: 1700000000, parent: "" },
];

export const SAMPLE_TASKS = [
  { upid: "UPID:pve:00001234:0000ABCD:65800000:vzstart:200:root@pam:", node: "pve", pid: 4660, pstart: 43981, starttime: 1702887424, type: "vzstart", id: "200", user: "root@pam", status: "OK" },
  { upid: "UPID:pve:00005678:0000EFGH:65800100:vzdestroy:201:root@pam:", node: "pve", pid: 22136, pstart: 61415, starttime: 1702887680, type: "vzdestroy", id: "201", user: "root@pam", status: "" },
];

export const SAMPLE_TASK_STATUS = {
  status: "stopped",
  exitstatus: "OK",
  type: "vzstart",
  id: "200",
  user: "root@pam",
  node: "pve",
  pid: 4660,
  starttime: 1702887424,
};

export const SAMPLE_TASK_LOG = [
  { n: 1, t: "Starting container 200" },
  { n: 2, t: "Container 200 started successfully" },
  { n: 3, t: "TASK OK" },
];

export const SAMPLE_NETWORKS = [
  { iface: "vmbr0", type: "bridge", active: 1, address: "192.168.70.226", netmask: "255.255.255.0", bridge_ports: "enp3s0", bridge_stp: "off", bridge_fd: "0" },
  { iface: "enp3s0", type: "eth", active: 1, address: "", netmask: "" },
  { iface: "lo", type: "loopback", active: 1, address: "127.0.0.1", netmask: "255.0.0.0" },
];

export const SAMPLE_TEMPLATES = [
  { volid: "local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst", format: "tzst", size: 134217728, content: "vztmpl" },
  { volid: "local:vztmpl/ubuntu-22.04-standard_22.04-1_amd64.tar.zst", format: "tzst", size: 150994944, content: "vztmpl" },
];
