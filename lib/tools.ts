/**
 * Extracted tool handler functions for testability.
 * Each function implements the core logic of one MCP tool.
 * These are imported by the route handler and registered with the MCP server.
 */

import {
  proxmoxRequest,
  getDefaultNode,
  formatBytes,
  formatUptime,
  jsonContent,
  textContent,
} from "./proxmox-client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpContent {
  content: Array<{ type: "text"; text: string }>;
}

// ---------------------------------------------------------------------------
// CLUSTER
// ---------------------------------------------------------------------------

export async function clusterStatus(): Promise<McpContent> {
  const data = await proxmoxRequest("cluster/status");
  return jsonContent(data);
}

export async function clusterResources(params: { type?: string }): Promise<McpContent> {
  const path = params.type
    ? `cluster/resources?type=${params.type}`
    : "cluster/resources";
  const data = await proxmoxRequest(path);
  return jsonContent(data);
}

// ---------------------------------------------------------------------------
// NODES
// ---------------------------------------------------------------------------

export async function listNodes(): Promise<McpContent> {
  const nodes = await proxmoxRequest<
    Array<{
      node: string;
      status: string;
      cpu: number;
      maxcpu: number;
      mem: number;
      maxmem: number;
      uptime: number;
    }>
  >("nodes");

  const formatted = nodes.map((n) => ({
    node: n.node,
    status: n.status,
    cpu: `${(n.cpu * 100).toFixed(1)}% (${n.maxcpu} cores)`,
    memory: `${formatBytes(n.mem)} / ${formatBytes(n.maxmem)} (${((n.mem / n.maxmem) * 100).toFixed(1)}%)`,
    uptime: formatUptime(n.uptime),
  }));

  return jsonContent(formatted);
}

export async function nodeStatus(params: { node?: string }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/status`);
  return jsonContent(data);
}

// ---------------------------------------------------------------------------
// QEMU VMs
// ---------------------------------------------------------------------------

export async function listVms(params: { node?: string }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/qemu`);
  return jsonContent(data);
}

export async function vmStatus(params: { node?: string; vmid: number }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/qemu/${params.vmid}/status/current`);
  return jsonContent(data);
}

export async function vmConfig(params: { node?: string; vmid: number }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/qemu/${params.vmid}/config`);
  return jsonContent(data);
}

export async function vmStart(params: { node?: string; vmid: number }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/qemu/${params.vmid}/status/start`, "POST");
  return textContent(`VM ${params.vmid} 起動タスク発行: ${data}`);
}

export async function vmStop(params: { node?: string; vmid: number }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/qemu/${params.vmid}/status/stop`, "POST");
  return textContent(`VM ${params.vmid} 停止タスク発行: ${data}`);
}

export async function vmShutdown(params: { node?: string; vmid: number; timeout?: number }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const body: Record<string, unknown> = {};
  if (params.timeout !== undefined) body.timeout = params.timeout;
  const data = await proxmoxRequest(`nodes/${n}/qemu/${params.vmid}/status/shutdown`, "POST", body);
  return textContent(`VM ${params.vmid} シャットダウンタスク発行: ${data}`);
}

export async function vmReboot(params: { node?: string; vmid: number }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/qemu/${params.vmid}/status/reboot`, "POST");
  return textContent(`VM ${params.vmid} 再起動タスク発行: ${data}`);
}

// ---------------------------------------------------------------------------
// LXC CONTAINERS
// ---------------------------------------------------------------------------

export async function listContainers(params: { node?: string }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/lxc`);
  return jsonContent(data);
}

export async function containerStatus(params: { node?: string; vmid: number }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/lxc/${params.vmid}/status/current`);
  return jsonContent(data);
}

export async function containerConfig(params: { node?: string; vmid: number }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/lxc/${params.vmid}/config`);
  return jsonContent(data);
}

export async function containerStart(params: { node?: string; vmid: number }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/lxc/${params.vmid}/status/start`, "POST");
  return textContent(`コンテナ ${params.vmid} 起動タスク発行: ${data}`);
}

export async function containerStop(params: { node?: string; vmid: number }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/lxc/${params.vmid}/status/stop`, "POST");
  return textContent(`コンテナ ${params.vmid} 停止タスク発行: ${data}`);
}

export async function containerShutdown(params: { node?: string; vmid: number; timeout?: number }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const body: Record<string, unknown> = {};
  if (params.timeout !== undefined) body.timeout = params.timeout;
  const data = await proxmoxRequest(`nodes/${n}/lxc/${params.vmid}/status/shutdown`, "POST", body);
  return textContent(`コンテナ ${params.vmid} シャットダウンタスク発行: ${data}`);
}

export async function containerReboot(params: { node?: string; vmid: number }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/lxc/${params.vmid}/status/reboot`, "POST");
  return textContent(`コンテナ ${params.vmid} 再起動タスク発行: ${data}`);
}

export async function createContainer(params: {
  node?: string;
  vmid: number;
  ostemplate: string;
  hostname?: string;
  memory?: number;
  swap?: number;
  cores?: number;
  rootfs?: string;
  net0?: string;
  password?: string;
  ssh_public_keys?: string;
  storage?: string;
  unprivileged?: boolean;
  start?: boolean;
}): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const body: Record<string, unknown> = {
    vmid: params.vmid,
    ostemplate: params.ostemplate,
  };
  if (params.hostname) body.hostname = params.hostname;
  if (params.memory !== undefined) body.memory = params.memory;
  if (params.swap !== undefined) body.swap = params.swap;
  if (params.cores !== undefined) body.cores = params.cores;
  if (params.rootfs) body.rootfs = params.rootfs;
  if (params.net0) body.net0 = params.net0;
  if (params.password) body.password = params.password;
  if (params.ssh_public_keys) body["ssh-public-keys"] = params.ssh_public_keys;
  if (params.storage) body.storage = params.storage;
  if (params.unprivileged !== undefined) body.unprivileged = params.unprivileged ? 1 : 0;
  if (params.start !== undefined) body.start = params.start ? 1 : 0;

  const data = await proxmoxRequest(`nodes/${n}/lxc`, "POST", body);
  return textContent(`コンテナ ${params.vmid} 作成タスク発行: ${data}`);
}

export async function cloneContainer(params: {
  node?: string;
  vmid: number;
  newid: number;
  hostname?: string;
  full?: boolean;
  storage?: string;
  description?: string;
}): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const body: Record<string, unknown> = { newid: params.newid };
  if (params.hostname) body.hostname = params.hostname;
  if (params.full !== undefined) body.full = params.full ? 1 : 0;
  if (params.storage) body.storage = params.storage;
  if (params.description) body.description = params.description;

  const data = await proxmoxRequest(`nodes/${n}/lxc/${params.vmid}/clone`, "POST", body);
  return textContent(`コンテナ ${params.vmid} → ${params.newid} クローンタスク発行: ${data}`);
}

export async function deleteContainer(params: {
  node?: string;
  vmid: number;
  confirm: boolean;
  purge?: boolean;
  force?: boolean;
}): Promise<McpContent> {
  if (!params.confirm) {
    return textContent(
      "エラー: confirm=true を指定してください。この操作はコンテナを完全に削除します。"
    );
  }
  const n = params.node || getDefaultNode();
  const body: Record<string, unknown> = {};
  if (params.purge) body.purge = 1;
  if (params.force) body.force = 1;

  const data = await proxmoxRequest(`nodes/${n}/lxc/${params.vmid}`, "DELETE", body);
  return textContent(`コンテナ ${params.vmid} 削除タスク発行: ${data}`);
}

export async function updateContainerConfig(params: {
  node?: string;
  vmid: number;
  memory?: number;
  swap?: number;
  cores?: number;
  hostname?: string;
  description?: string;
  net0?: string;
  onboot?: boolean;
  startup?: string;
}): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const body: Record<string, unknown> = {};
  if (params.memory !== undefined) body.memory = params.memory;
  if (params.swap !== undefined) body.swap = params.swap;
  if (params.cores !== undefined) body.cores = params.cores;
  if (params.hostname) body.hostname = params.hostname;
  if (params.description !== undefined) body.description = params.description;
  if (params.net0) body.net0 = params.net0;
  if (params.onboot !== undefined) body.onboot = params.onboot ? 1 : 0;
  if (params.startup) body.startup = params.startup;

  await proxmoxRequest(`nodes/${n}/lxc/${params.vmid}/config`, "PUT", body);
  return textContent(`コンテナ ${params.vmid} 設定更新完了`);
}

// ---------------------------------------------------------------------------
// STORAGE
// ---------------------------------------------------------------------------

export async function listStorages(params: { node?: string; content?: string }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const path = params.content
    ? `nodes/${n}/storage?content=${params.content}`
    : `nodes/${n}/storage`;
  const data = await proxmoxRequest(path);
  return jsonContent(data);
}

export async function storageContent(params: { node?: string; storage: string; content?: string }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const path = params.content
    ? `nodes/${n}/storage/${params.storage}/content?content=${params.content}`
    : `nodes/${n}/storage/${params.storage}/content`;
  const data = await proxmoxRequest(path);
  return jsonContent(data);
}

// ---------------------------------------------------------------------------
// SNAPSHOTS
// ---------------------------------------------------------------------------

export async function listSnapshots(params: { node?: string; vmid: number; type: "qemu" | "lxc" }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/${params.type}/${params.vmid}/snapshot`);
  return jsonContent(data);
}

export async function createSnapshot(params: {
  node?: string;
  vmid: number;
  type: "qemu" | "lxc";
  snapname: string;
  description?: string;
}): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const body: Record<string, unknown> = { snapname: params.snapname };
  if (params.description) body.description = params.description;
  const data = await proxmoxRequest(`nodes/${n}/${params.type}/${params.vmid}/snapshot`, "POST", body);
  return textContent(`スナップショット "${params.snapname}" 作成タスク発行: ${data}`);
}

export async function rollbackSnapshot(params: {
  node?: string;
  vmid: number;
  type: "qemu" | "lxc";
  snapname: string;
}): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/${params.type}/${params.vmid}/snapshot/${params.snapname}/rollback`, "POST");
  return textContent(`スナップショット "${params.snapname}" ロールバックタスク発行: ${data}`);
}

export async function deleteSnapshot(params: {
  node?: string;
  vmid: number;
  type: "qemu" | "lxc";
  snapname: string;
}): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/${params.type}/${params.vmid}/snapshot/${params.snapname}`, "DELETE");
  return textContent(`スナップショット "${params.snapname}" 削除タスク発行: ${data}`);
}

// ---------------------------------------------------------------------------
// TASKS
// ---------------------------------------------------------------------------

export async function listTasks(params: { node?: string; limit?: number; vmid?: number }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const searchParams = new URLSearchParams();
  if (params.limit) searchParams.append("limit", String(params.limit));
  if (params.vmid) searchParams.append("vmid", String(params.vmid));
  const qs = searchParams.toString();
  const path = qs ? `nodes/${n}/tasks?${qs}` : `nodes/${n}/tasks`;
  const data = await proxmoxRequest(path);
  return jsonContent(data);
}

export async function taskStatus(params: { node?: string; upid: string }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const data = await proxmoxRequest(`nodes/${n}/tasks/${encodeURIComponent(params.upid)}/status`);
  return jsonContent(data);
}

export async function taskLog(params: { node?: string; upid: string; limit?: number }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const searchParams = new URLSearchParams();
  if (params.limit) searchParams.append("limit", String(params.limit));
  const qs = searchParams.toString();
  const path = qs
    ? `nodes/${n}/tasks/${encodeURIComponent(params.upid)}/log?${qs}`
    : `nodes/${n}/tasks/${encodeURIComponent(params.upid)}/log`;
  const data = await proxmoxRequest<Array<{ n: number; t: string }>>(path);
  const logText = data.map((line) => line.t).join("\n");
  return textContent(logText);
}

// ---------------------------------------------------------------------------
// NETWORK
// ---------------------------------------------------------------------------

export async function listNetworks(params: { node?: string; type?: string }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const path = params.type
    ? `nodes/${n}/network?type=${params.type}`
    : `nodes/${n}/network`;
  const data = await proxmoxRequest(path);
  return jsonContent(data);
}

// ---------------------------------------------------------------------------
// TEMPLATES
// ---------------------------------------------------------------------------

export async function listTemplates(params: { node?: string; storage?: string }): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const s = params.storage || "local";
  const data = await proxmoxRequest(`nodes/${n}/storage/${s}/content?content=vztmpl`);
  return jsonContent(data);
}

export async function downloadTemplate(params: {
  node?: string;
  storage?: string;
  template: string;
}): Promise<McpContent> {
  const n = params.node || getDefaultNode();
  const s = params.storage || "local";
  const data = await proxmoxRequest(`nodes/${n}/aplinfo`, "POST", { storage: s, template: params.template });
  return textContent(`テンプレート "${params.template}" ダウンロードタスク発行: ${data}`);
}

// ---------------------------------------------------------------------------
// GENERIC API
// ---------------------------------------------------------------------------

export async function apiRequest(params: {
  path: string;
  method?: string;
  body?: Record<string, unknown>;
}): Promise<McpContent> {
  const data = await proxmoxRequest(
    params.path,
    (params.method as "GET" | "POST" | "PUT" | "DELETE") || "GET",
    params.body
  );
  return jsonContent(data);
}
