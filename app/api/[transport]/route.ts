import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  proxmoxRequest,
  getDefaultNode,
  formatBytes,
  formatUptime,
  jsonContent,
  textContent,
} from "@/lib/proxmox-client";

// ---------------------------------------------------------------------------
// MCP Handler
// ---------------------------------------------------------------------------

const mcpHandler = createMcpHandler(
  (server) => {
    // =================================================================
    // CLUSTER
    // =================================================================
    server.registerTool("proxmox_cluster_status", {
      title: "クラスタステータス取得",
      description: "Proxmox クラスタの全体ステータスを取得する。ノード一覧・クォーラム・バージョン情報を含む。",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async () => jsonContent(await proxmoxRequest("cluster/status")));

    server.registerTool("proxmox_cluster_resources", {
      title: "クラスタリソース一覧",
      description: "クラスタ内の全リソース（VM, LXC, Storage, Node）を一覧取得する。type で絞り込み可能。",
      inputSchema: { type: z.enum(["vm", "storage", "node", "sdn"]).optional().describe("リソースタイプで絞り込み") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ type }) => jsonContent(await proxmoxRequest(type ? `cluster/resources?type=${type}` : "cluster/resources")));

    // =================================================================
    // NODES
    // =================================================================
    server.registerTool("proxmox_list_nodes", {
      title: "ノード一覧",
      description: "Proxmox クラスタ内の全ノードを一覧取得する。ステータス・CPU・メモリ・稼働時間を含む。",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async () => {
      const nodes = await proxmoxRequest<Array<{ node: string; status: string; cpu: number; maxcpu: number; mem: number; maxmem: number; uptime: number }>>("nodes");
      return jsonContent(nodes.map((n) => ({
        node: n.node, status: n.status,
        cpu: `${(n.cpu * 100).toFixed(1)}% (${n.maxcpu} cores)`,
        memory: `${formatBytes(n.mem)} / ${formatBytes(n.maxmem)} (${((n.mem / n.maxmem) * 100).toFixed(1)}%)`,
        uptime: formatUptime(n.uptime),
      })));
    });

    server.registerTool("proxmox_node_status", {
      title: "ノード詳細ステータス",
      description: "指定ノードの詳細ステータスを取得する。CPU・メモリ・ディスク・カーネルバージョン等。",
      inputSchema: { node: z.string().optional().describe("ノード名 (省略時はデフォルトノード)") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node }) => jsonContent(await proxmoxRequest(`nodes/${node || getDefaultNode()}/status`)));

    // =================================================================
    // QEMU VMs
    // =================================================================
    server.registerTool("proxmox_list_vms", {
      title: "VM一覧 (QEMU)",
      description: "指定ノード上の全 QEMU VM を一覧取得する。",
      inputSchema: { node: z.string().optional().describe("ノード名") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node }) => jsonContent(await proxmoxRequest(`nodes/${node || getDefaultNode()}/qemu`)));

    server.registerTool("proxmox_vm_status", {
      title: "VMステータス",
      description: "指定 QEMU VM の現在のステータスを取得する。",
      inputSchema: { node: z.string().optional(), vmid: z.number().int().describe("VM ID") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, vmid }) => jsonContent(await proxmoxRequest(`nodes/${node || getDefaultNode()}/qemu/${vmid}/status/current`)));

    server.registerTool("proxmox_vm_config", {
      title: "VM設定取得",
      description: "指定 QEMU VM の設定（CPU, メモリ, ディスク, ネットワーク等）を取得する。",
      inputSchema: { node: z.string().optional(), vmid: z.number().int().describe("VM ID") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, vmid }) => jsonContent(await proxmoxRequest(`nodes/${node || getDefaultNode()}/qemu/${vmid}/config`)));

    server.registerTool("proxmox_vm_start", {
      title: "VM起動",
      description: "指定 QEMU VM を起動する。",
      inputSchema: { node: z.string().optional(), vmid: z.number().int() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, vmid }) => textContent(`VM ${vmid} 起動タスク発行: ${await proxmoxRequest(`nodes/${node || getDefaultNode()}/qemu/${vmid}/status/start`, "POST")}`));

    server.registerTool("proxmox_vm_stop", {
      title: "VM停止",
      description: "指定 QEMU VM を強制停止する。",
      inputSchema: { node: z.string().optional(), vmid: z.number().int() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    }, async ({ node, vmid }) => textContent(`VM ${vmid} 停止タスク発行: ${await proxmoxRequest(`nodes/${node || getDefaultNode()}/qemu/${vmid}/status/stop`, "POST")}`));

    server.registerTool("proxmox_vm_shutdown", {
      title: "VMシャットダウン",
      description: "指定 QEMU VM を graceful shutdown する。",
      inputSchema: { node: z.string().optional(), vmid: z.number().int(), timeout: z.number().int().optional().describe("タイムアウト秒") },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, vmid, timeout }) => {
      const body: Record<string, unknown> = {}; if (timeout !== undefined) body.timeout = timeout;
      return textContent(`VM ${vmid} シャットダウンタスク発行: ${await proxmoxRequest(`nodes/${node || getDefaultNode()}/qemu/${vmid}/status/shutdown`, "POST", body)}`);
    });

    server.registerTool("proxmox_vm_reboot", {
      title: "VM再起動",
      description: "指定 QEMU VM を再起動する。",
      inputSchema: { node: z.string().optional(), vmid: z.number().int() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, vmid }) => textContent(`VM ${vmid} 再起動タスク発行: ${await proxmoxRequest(`nodes/${node || getDefaultNode()}/qemu/${vmid}/status/reboot`, "POST")}`));

    // =================================================================
    // LXC CONTAINERS
    // =================================================================
    server.registerTool("proxmox_list_containers", {
      title: "コンテナ一覧 (LXC)",
      description: "指定ノード上の全 LXC コンテナを一覧取得する。",
      inputSchema: { node: z.string().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node }) => jsonContent(await proxmoxRequest(`nodes/${node || getDefaultNode()}/lxc`)));

    server.registerTool("proxmox_container_status", {
      title: "コンテナステータス",
      description: "指定 LXC コンテナの現在のステータスを取得する。",
      inputSchema: { node: z.string().optional(), vmid: z.number().int().describe("コンテナ ID") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, vmid }) => jsonContent(await proxmoxRequest(`nodes/${node || getDefaultNode()}/lxc/${vmid}/status/current`)));

    server.registerTool("proxmox_container_config", {
      title: "コンテナ設定取得",
      description: "指定 LXC コンテナの設定を取得する。",
      inputSchema: { node: z.string().optional(), vmid: z.number().int() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, vmid }) => jsonContent(await proxmoxRequest(`nodes/${node || getDefaultNode()}/lxc/${vmid}/config`)));

    server.registerTool("proxmox_container_start", {
      title: "コンテナ起動",
      description: "指定 LXC コンテナを起動する。",
      inputSchema: { node: z.string().optional(), vmid: z.number().int() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, vmid }) => textContent(`コンテナ ${vmid} 起動タスク発行: ${await proxmoxRequest(`nodes/${node || getDefaultNode()}/lxc/${vmid}/status/start`, "POST")}`));

    server.registerTool("proxmox_container_stop", {
      title: "コンテナ停止",
      description: "指定 LXC コンテナを強制停止する。",
      inputSchema: { node: z.string().optional(), vmid: z.number().int() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    }, async ({ node, vmid }) => textContent(`コンテナ ${vmid} 停止タスク発行: ${await proxmoxRequest(`nodes/${node || getDefaultNode()}/lxc/${vmid}/status/stop`, "POST")}`));

    server.registerTool("proxmox_container_shutdown", {
      title: "コンテナシャットダウン",
      description: "指定 LXC コンテナを graceful shutdown する。",
      inputSchema: { node: z.string().optional(), vmid: z.number().int(), timeout: z.number().int().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, vmid, timeout }) => {
      const body: Record<string, unknown> = {}; if (timeout !== undefined) body.timeout = timeout;
      return textContent(`コンテナ ${vmid} シャットダウンタスク発行: ${await proxmoxRequest(`nodes/${node || getDefaultNode()}/lxc/${vmid}/status/shutdown`, "POST", body)}`);
    });

    server.registerTool("proxmox_container_reboot", {
      title: "コンテナ再起動",
      description: "指定 LXC コンテナを再起動する。",
      inputSchema: { node: z.string().optional(), vmid: z.number().int() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, vmid }) => textContent(`コンテナ ${vmid} 再起動タスク発行: ${await proxmoxRequest(`nodes/${node || getDefaultNode()}/lxc/${vmid}/status/reboot`, "POST")}`));

    server.registerTool("proxmox_create_container", {
      title: "コンテナ作成",
      description: "新しい LXC コンテナを作成する。",
      inputSchema: {
        node: z.string().optional(), vmid: z.number().int(), ostemplate: z.string().describe("OS テンプレート"),
        hostname: z.string().optional(), memory: z.number().int().optional(), swap: z.number().int().optional(),
        cores: z.number().int().optional(), rootfs: z.string().optional(), net0: z.string().optional(),
        password: z.string().optional(), ssh_public_keys: z.string().optional(), storage: z.string().optional(),
        unprivileged: z.boolean().optional(), start: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, async ({ node, vmid, ostemplate, hostname, memory, swap, cores, rootfs, net0, password, ssh_public_keys, storage, unprivileged, start: startFlag }) => {
      const n = node || getDefaultNode();
      const body: Record<string, unknown> = { vmid, ostemplate };
      if (hostname) body.hostname = hostname; if (memory !== undefined) body.memory = memory;
      if (swap !== undefined) body.swap = swap; if (cores !== undefined) body.cores = cores;
      if (rootfs) body.rootfs = rootfs; if (net0) body.net0 = net0;
      if (password) body.password = password; if (ssh_public_keys) body["ssh-public-keys"] = ssh_public_keys;
      if (storage) body.storage = storage;
      if (unprivileged !== undefined) body.unprivileged = unprivileged ? 1 : 0;
      if (startFlag !== undefined) body.start = startFlag ? 1 : 0;
      return textContent(`コンテナ ${vmid} 作成タスク発行: ${await proxmoxRequest(`nodes/${n}/lxc`, "POST", body)}`);
    });

    server.registerTool("proxmox_clone_container", {
      title: "コンテナクローン",
      description: "既存の LXC コンテナをクローンする。",
      inputSchema: {
        node: z.string().optional(), vmid: z.number().int(), newid: z.number().int(),
        hostname: z.string().optional(), full: z.boolean().optional(), storage: z.string().optional(), description: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, async ({ node, vmid, newid, hostname, full, storage, description }) => {
      const body: Record<string, unknown> = { newid };
      if (hostname) body.hostname = hostname; if (full !== undefined) body.full = full ? 1 : 0;
      if (storage) body.storage = storage; if (description) body.description = description;
      return textContent(`コンテナ ${vmid} → ${newid} クローンタスク発行: ${await proxmoxRequest(`nodes/${node || getDefaultNode()}/lxc/${vmid}/clone`, "POST", body)}`);
    });

    server.registerTool("proxmox_delete_container", {
      title: "コンテナ削除",
      description: "指定 LXC コンテナを削除する。confirm=true が必須。",
      inputSchema: {
        node: z.string().optional(), vmid: z.number().int(), confirm: z.boolean().describe("削除確認 (true必須)"),
        purge: z.boolean().optional(), force: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    }, async ({ node, vmid, confirm, purge, force }) => {
      if (!confirm) return textContent("エラー: confirm=true を指定してください。この操作はコンテナを完全に削除します。");
      const body: Record<string, unknown> = {}; if (purge) body.purge = 1; if (force) body.force = 1;
      return textContent(`コンテナ ${vmid} 削除タスク発行: ${await proxmoxRequest(`nodes/${node || getDefaultNode()}/lxc/${vmid}`, "DELETE", body)}`);
    });

    server.registerTool("proxmox_update_container_config", {
      title: "コンテナ設定更新",
      description: "LXC コンテナの設定を更新する。",
      inputSchema: {
        node: z.string().optional(), vmid: z.number().int(), memory: z.number().int().optional(),
        swap: z.number().int().optional(), cores: z.number().int().optional(), hostname: z.string().optional(),
        description: z.string().optional(), net0: z.string().optional(), onboot: z.boolean().optional(), startup: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, vmid, memory, swap, cores, hostname, description, net0, onboot, startup }) => {
      const body: Record<string, unknown> = {};
      if (memory !== undefined) body.memory = memory; if (swap !== undefined) body.swap = swap;
      if (cores !== undefined) body.cores = cores; if (hostname) body.hostname = hostname;
      if (description !== undefined) body.description = description; if (net0) body.net0 = net0;
      if (onboot !== undefined) body.onboot = onboot ? 1 : 0; if (startup) body.startup = startup;
      await proxmoxRequest(`nodes/${node || getDefaultNode()}/lxc/${vmid}/config`, "PUT", body);
      return textContent(`コンテナ ${vmid} 設定更新完了`);
    });

    // =================================================================
    // STORAGE
    // =================================================================
    server.registerTool("proxmox_list_storages", {
      title: "ストレージ一覧",
      description: "指定ノードで利用可能なストレージを一覧取得する。",
      inputSchema: { node: z.string().optional(), content: z.string().optional().describe("コンテンツタイプで絞り込み") },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, content }) => {
      const n = node || getDefaultNode();
      return jsonContent(await proxmoxRequest(content ? `nodes/${n}/storage?content=${content}` : `nodes/${n}/storage`));
    });

    server.registerTool("proxmox_storage_content", {
      title: "ストレージ内容一覧",
      description: "指定ストレージの中身（ISO, テンプレート, バックアップ等）を一覧取得する。",
      inputSchema: { node: z.string().optional(), storage: z.string(), content: z.string().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, storage, content }) => {
      const n = node || getDefaultNode();
      return jsonContent(await proxmoxRequest(content ? `nodes/${n}/storage/${storage}/content?content=${content}` : `nodes/${n}/storage/${storage}/content`));
    });

    // =================================================================
    // SNAPSHOTS
    // =================================================================
    server.registerTool("proxmox_list_snapshots", {
      title: "スナップショット一覧",
      description: "指定 VM/コンテナのスナップショットを一覧取得する。",
      inputSchema: { node: z.string().optional(), vmid: z.number().int(), type: z.enum(["qemu", "lxc"]) },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, vmid, type }) => jsonContent(await proxmoxRequest(`nodes/${node || getDefaultNode()}/${type}/${vmid}/snapshot`)));

    server.registerTool("proxmox_create_snapshot", {
      title: "スナップショット作成",
      description: "指定 VM/コンテナのスナップショットを作成する。",
      inputSchema: { node: z.string().optional(), vmid: z.number().int(), type: z.enum(["qemu", "lxc"]), snapname: z.string(), description: z.string().optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    }, async ({ node, vmid, type, snapname, description }) => {
      const body: Record<string, unknown> = { snapname }; if (description) body.description = description;
      return textContent(`スナップショット "${snapname}" 作成タスク発行: ${await proxmoxRequest(`nodes/${node || getDefaultNode()}/${type}/${vmid}/snapshot`, "POST", body)}`);
    });

    server.registerTool("proxmox_rollback_snapshot", {
      title: "スナップショットロールバック",
      description: "指定スナップショットにロールバックする。",
      inputSchema: { node: z.string().optional(), vmid: z.number().int(), type: z.enum(["qemu", "lxc"]), snapname: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
    }, async ({ node, vmid, type, snapname }) => textContent(`スナップショット "${snapname}" ロールバックタスク発行: ${await proxmoxRequest(`nodes/${node || getDefaultNode()}/${type}/${vmid}/snapshot/${snapname}/rollback`, "POST")}`));

    server.registerTool("proxmox_delete_snapshot", {
      title: "スナップショット削除",
      description: "指定スナップショットを削除する。",
      inputSchema: { node: z.string().optional(), vmid: z.number().int(), type: z.enum(["qemu", "lxc"]), snapname: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    }, async ({ node, vmid, type, snapname }) => textContent(`スナップショット "${snapname}" 削除タスク発行: ${await proxmoxRequest(`nodes/${node || getDefaultNode()}/${type}/${vmid}/snapshot/${snapname}`, "DELETE")}`));

    // =================================================================
    // TASKS
    // =================================================================
    server.registerTool("proxmox_list_tasks", {
      title: "タスク一覧",
      description: "指定ノードの最近のタスク一覧を取得する。",
      inputSchema: { node: z.string().optional(), limit: z.number().int().optional(), vmid: z.number().int().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, limit, vmid }) => {
      const p = new URLSearchParams(); if (limit) p.append("limit", String(limit)); if (vmid) p.append("vmid", String(vmid));
      const qs = p.toString(); const n = node || getDefaultNode();
      return jsonContent(await proxmoxRequest(qs ? `nodes/${n}/tasks?${qs}` : `nodes/${n}/tasks`));
    });

    server.registerTool("proxmox_task_status", {
      title: "タスクステータス",
      description: "指定タスク (UPID) の詳細ステータスを取得する。",
      inputSchema: { node: z.string().optional(), upid: z.string() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, upid }) => jsonContent(await proxmoxRequest(`nodes/${node || getDefaultNode()}/tasks/${encodeURIComponent(upid)}/status`)));

    server.registerTool("proxmox_task_log", {
      title: "タスクログ",
      description: "指定タスク (UPID) のログ出力を取得する。",
      inputSchema: { node: z.string().optional(), upid: z.string(), limit: z.number().int().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, upid, limit }) => {
      const p = new URLSearchParams(); if (limit) p.append("limit", String(limit)); const qs = p.toString();
      const path = qs ? `nodes/${node || getDefaultNode()}/tasks/${encodeURIComponent(upid)}/log?${qs}` : `nodes/${node || getDefaultNode()}/tasks/${encodeURIComponent(upid)}/log`;
      const data = await proxmoxRequest<Array<{ n: number; t: string }>>(path);
      return textContent(data.map((l) => l.t).join("\n"));
    });

    // =================================================================
    // NETWORK / TEMPLATES / GENERIC
    // =================================================================
    server.registerTool("proxmox_list_networks", {
      title: "ネットワーク一覧",
      description: "指定ノードのネットワークインターフェースを一覧取得する。",
      inputSchema: { node: z.string().optional(), type: z.enum(["bridge","bond","eth","alias","vlan","OVSBridge","OVSBond","OVSPort","OVSIntPort","any_bridge","any_local_bridge"]).optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, type }) => {
      const n = node || getDefaultNode();
      return jsonContent(await proxmoxRequest(type ? `nodes/${n}/network?type=${type}` : `nodes/${n}/network`));
    });

    server.registerTool("proxmox_list_templates", {
      title: "テンプレート一覧",
      description: "利用可能な OS テンプレート一覧を取得する。",
      inputSchema: { node: z.string().optional(), storage: z.string().optional() },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    }, async ({ node, storage }) => jsonContent(await proxmoxRequest(`nodes/${node || getDefaultNode()}/storage/${storage || "local"}/content?content=vztmpl`)));

    server.registerTool("proxmox_download_template", {
      title: "テンプレートダウンロード",
      description: "Proxmox の公式リポジトリからテンプレートをダウンロードする。",
      inputSchema: { node: z.string().optional(), storage: z.string().optional(), template: z.string() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    }, async ({ node, storage, template }) => textContent(`テンプレート "${template}" ダウンロードタスク発行: ${await proxmoxRequest(`nodes/${node || getDefaultNode()}/aplinfo`, "POST", { storage: storage || "local", template })}`));

    server.registerTool("proxmox_api_request", {
      title: "汎用APIリクエスト",
      description: "Proxmox REST API に直接リクエストを送信する。パスは /api2/json/ 以降を指定。",
      inputSchema: { path: z.string(), method: z.enum(["GET","POST","PUT","DELETE"]).optional(), body: z.record(z.unknown()).optional() },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    }, async ({ path, method, body }) => jsonContent(await proxmoxRequest(path, (method as "GET"|"POST"|"PUT"|"DELETE") || "GET", body as Record<string, unknown> | undefined)));
  },
  {},
  { basePath: "/api", maxDuration: 60, verboseLogs: true }
);

// ---------------------------------------------------------------------------
// Auth helpers (hubspot-ma-mcp と同じパターン)
// ---------------------------------------------------------------------------

function extractBearerToken(request: Request): string | undefined {
  const h = request.headers.get("authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1] || undefined;
}

function extractQueryKey(request: Request): string | undefined {
  try {
    const u = new URL(request.url);
    return u.searchParams.get("key") || u.searchParams.get("api_key") || undefined;
  } catch { return undefined; }
}

function verifyApiKey(apiKey: string | undefined): Response | null {
  const expected = process.env.MCP_API_KEY;
  if (!expected) return null; // No key configured = skip auth
  if (!apiKey || apiKey !== expected) {
    return new Response(
      JSON.stringify({ jsonrpc: "2.0", error: { code: -32001, message: "認証エラー: Authorization: Bearer <KEY> or ?key=<KEY> を指定してください。" } }),
      { status: 401, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

async function handler(request: Request): Promise<Response> {
  const apiKey = extractBearerToken(request) || extractQueryKey(request);
  const err = verifyApiKey(apiKey);
  if (err) return err;
  return mcpHandler(request);
}

export { handler as GET, handler as POST, handler as DELETE };
