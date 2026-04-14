import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { NextRequest } from "next/server";
import {
  proxmoxRequest,
  getDefaultNode,
  formatBytes,
  formatUptime,
  jsonContent,
  textContent,
} from "@/lib/proxmox-client";
import { verifyApiKey, unauthorizedResponse } from "@/lib/auth";

// ---------------------------------------------------------------------------
// MCP Handler
// ---------------------------------------------------------------------------

const handler = createMcpHandler(
  (server) => {
    // =====================================================================
    // CLUSTER
    // =====================================================================

    server.registerTool(
      "proxmox_cluster_status",
      {
        title: "クラスタステータス取得",
        description:
          "Proxmox クラスタの全体ステータスを取得する。ノード一覧・クォーラム・バージョン情報を含む。",
        inputSchema: {},
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => {
        const data = await proxmoxRequest("cluster/status");
        return jsonContent(data);
      }
    );

    server.registerTool(
      "proxmox_cluster_resources",
      {
        title: "クラスタリソース一覧",
        description:
          "クラスタ内の全リソース（VM, LXC, Storage, Node）を一覧取得する。type で絞り込み可能。",
        inputSchema: {
          type: z
            .enum(["vm", "storage", "node", "sdn"])
            .optional()
            .describe("リソースタイプで絞り込み (vm/storage/node/sdn)"),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ type }) => {
        const path = type
          ? `cluster/resources?type=${type}`
          : "cluster/resources";
        const data = await proxmoxRequest(path);
        return jsonContent(data);
      }
    );

    // =====================================================================
    // NODES
    // =====================================================================

    server.registerTool(
      "proxmox_list_nodes",
      {
        title: "ノード一覧",
        description:
          "Proxmox クラスタ内の全ノードを一覧取得する。ステータス・CPU・メモリ・稼働時間を含む。",
        inputSchema: {},
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async () => {
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
    );

    server.registerTool(
      "proxmox_node_status",
      {
        title: "ノード詳細ステータス",
        description:
          "指定ノードの詳細ステータスを取得する。CPU・メモリ・ディスク・カーネルバージョン等。",
        inputSchema: {
          node: z
            .string()
            .optional()
            .describe(
              "ノード名 (省略時はデフォルトノード)"
            ),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(`nodes/${n}/status`);
        return jsonContent(data);
      }
    );

    // =====================================================================
    // QEMU VMs
    // =====================================================================

    server.registerTool(
      "proxmox_list_vms",
      {
        title: "VM一覧 (QEMU)",
        description:
          "指定ノード上の全 QEMU VM を一覧取得する。ステータス・CPU・メモリ使用量を含む。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(`nodes/${n}/qemu`);
        return jsonContent(data);
      }
    );

    server.registerTool(
      "proxmox_vm_status",
      {
        title: "VMステータス (QEMU)",
        description: "指定 QEMU VM の現在のステータスを取得する。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("VM ID"),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, vmid }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(
          `nodes/${n}/qemu/${vmid}/status/current`
        );
        return jsonContent(data);
      }
    );

    server.registerTool(
      "proxmox_vm_config",
      {
        title: "VM設定取得 (QEMU)",
        description: "指定 QEMU VM の設定（CPU, メモリ, ディスク, ネットワーク等）を取得する。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("VM ID"),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, vmid }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(`nodes/${n}/qemu/${vmid}/config`);
        return jsonContent(data);
      }
    );

    server.registerTool(
      "proxmox_vm_start",
      {
        title: "VM起動 (QEMU)",
        description: "指定 QEMU VM を起動する。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("VM ID"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, vmid }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(
          `nodes/${n}/qemu/${vmid}/status/start`,
          "POST"
        );
        return textContent(`VM ${vmid} 起動タスク発行: ${data}`);
      }
    );

    server.registerTool(
      "proxmox_vm_stop",
      {
        title: "VM停止 (QEMU)",
        description:
          "指定 QEMU VM を強制停止する（電源断相当）。graceful shutdown は proxmox_vm_shutdown を使用。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("VM ID"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, vmid }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(
          `nodes/${n}/qemu/${vmid}/status/stop`,
          "POST"
        );
        return textContent(`VM ${vmid} 停止タスク発行: ${data}`);
      }
    );

    server.registerTool(
      "proxmox_vm_shutdown",
      {
        title: "VMシャットダウン (QEMU)",
        description: "指定 QEMU VM を graceful shutdown する。ACPI シャットダウン信号を送信。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("VM ID"),
          timeout: z
            .number()
            .int()
            .optional()
            .describe("シャットダウンタイムアウト秒数"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, vmid, timeout }) => {
        const n = node || getDefaultNode();
        const body: Record<string, unknown> = {};
        if (timeout !== undefined) body.timeout = timeout;
        const data = await proxmoxRequest(
          `nodes/${n}/qemu/${vmid}/status/shutdown`,
          "POST",
          body
        );
        return textContent(`VM ${vmid} シャットダウンタスク発行: ${data}`);
      }
    );

    server.registerTool(
      "proxmox_vm_reboot",
      {
        title: "VM再起動 (QEMU)",
        description: "指定 QEMU VM を再起動する。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("VM ID"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, vmid }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(
          `nodes/${n}/qemu/${vmid}/status/reboot`,
          "POST"
        );
        return textContent(`VM ${vmid} 再起動タスク発行: ${data}`);
      }
    );

    // =====================================================================
    // LXC CONTAINERS
    // =====================================================================

    server.registerTool(
      "proxmox_list_containers",
      {
        title: "コンテナ一覧 (LXC)",
        description:
          "指定ノード上の全 LXC コンテナを一覧取得する。ステータス・CPU・メモリ使用量を含む。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(`nodes/${n}/lxc`);
        return jsonContent(data);
      }
    );

    server.registerTool(
      "proxmox_container_status",
      {
        title: "コンテナステータス (LXC)",
        description: "指定 LXC コンテナの現在のステータスを取得する。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("コンテナ ID (VMID)"),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, vmid }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(
          `nodes/${n}/lxc/${vmid}/status/current`
        );
        return jsonContent(data);
      }
    );

    server.registerTool(
      "proxmox_container_config",
      {
        title: "コンテナ設定取得 (LXC)",
        description:
          "指定 LXC コンテナの設定（CPU, メモリ, rootfs, ネットワーク等）を取得する。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("コンテナ ID (VMID)"),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, vmid }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(`nodes/${n}/lxc/${vmid}/config`);
        return jsonContent(data);
      }
    );

    server.registerTool(
      "proxmox_container_start",
      {
        title: "コンテナ起動 (LXC)",
        description: "指定 LXC コンテナを起動する。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("コンテナ ID (VMID)"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, vmid }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(
          `nodes/${n}/lxc/${vmid}/status/start`,
          "POST"
        );
        return textContent(`コンテナ ${vmid} 起動タスク発行: ${data}`);
      }
    );

    server.registerTool(
      "proxmox_container_stop",
      {
        title: "コンテナ停止 (LXC)",
        description: "指定 LXC コンテナを強制停止する。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("コンテナ ID (VMID)"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, vmid }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(
          `nodes/${n}/lxc/${vmid}/status/stop`,
          "POST"
        );
        return textContent(`コンテナ ${vmid} 停止タスク発行: ${data}`);
      }
    );

    server.registerTool(
      "proxmox_container_shutdown",
      {
        title: "コンテナシャットダウン (LXC)",
        description: "指定 LXC コンテナを graceful shutdown する。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("コンテナ ID (VMID)"),
          timeout: z
            .number()
            .int()
            .optional()
            .describe("シャットダウンタイムアウト秒数"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, vmid, timeout }) => {
        const n = node || getDefaultNode();
        const body: Record<string, unknown> = {};
        if (timeout !== undefined) body.timeout = timeout;
        const data = await proxmoxRequest(
          `nodes/${n}/lxc/${vmid}/status/shutdown`,
          "POST",
          body
        );
        return textContent(`コンテナ ${vmid} シャットダウンタスク発行: ${data}`);
      }
    );

    server.registerTool(
      "proxmox_container_reboot",
      {
        title: "コンテナ再起動 (LXC)",
        description: "指定 LXC コンテナを再起動する。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("コンテナ ID (VMID)"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, vmid }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(
          `nodes/${n}/lxc/${vmid}/status/reboot`,
          "POST"
        );
        return textContent(`コンテナ ${vmid} 再起動タスク発行: ${data}`);
      }
    );

    server.registerTool(
      "proxmox_create_container",
      {
        title: "コンテナ作成 (LXC)",
        description:
          "新しい LXC コンテナを作成する。テンプレートからクローンするか、ostemplate を指定して作成。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("新しいコンテナの VMID"),
          ostemplate: z
            .string()
            .describe(
              "OS テンプレート (e.g. local:vztmpl/debian-12-standard_12.7-1_amd64.tar.zst)"
            ),
          hostname: z.string().optional().describe("ホスト名"),
          memory: z
            .number()
            .int()
            .optional()
            .describe("メモリ (MB, デフォルト: 512)"),
          swap: z
            .number()
            .int()
            .optional()
            .describe("スワップ (MB, デフォルト: 512)"),
          cores: z
            .number()
            .int()
            .optional()
            .describe("CPU コア数 (デフォルト: 1)"),
          rootfs: z
            .string()
            .optional()
            .describe("rootfs 設定 (e.g. local-lvm:8)"),
          net0: z
            .string()
            .optional()
            .describe(
              "ネットワーク設定 (e.g. name=eth0,bridge=vmbr0,ip=dhcp)"
            ),
          password: z.string().optional().describe("root パスワード"),
          ssh_public_keys: z
            .string()
            .optional()
            .describe("SSH公開鍵 (URL encoded)"),
          storage: z
            .string()
            .optional()
            .describe("ストレージ (デフォルト: local-lvm)"),
          unprivileged: z
            .boolean()
            .optional()
            .describe("非特権コンテナにするか (デフォルト: true)"),
          start: z
            .boolean()
            .optional()
            .describe("作成後すぐに起動するか (デフォルト: false)"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async ({
        node,
        vmid,
        ostemplate,
        hostname,
        memory,
        swap,
        cores,
        rootfs,
        net0,
        password,
        ssh_public_keys,
        storage,
        unprivileged,
        start,
      }) => {
        const n = node || getDefaultNode();
        const body: Record<string, unknown> = {
          vmid,
          ostemplate,
        };
        if (hostname) body.hostname = hostname;
        if (memory !== undefined) body.memory = memory;
        if (swap !== undefined) body.swap = swap;
        if (cores !== undefined) body.cores = cores;
        if (rootfs) body.rootfs = rootfs;
        if (net0) body.net0 = net0;
        if (password) body.password = password;
        if (ssh_public_keys) body["ssh-public-keys"] = ssh_public_keys;
        if (storage) body.storage = storage;
        if (unprivileged !== undefined)
          body.unprivileged = unprivileged ? 1 : 0;
        if (start !== undefined) body.start = start ? 1 : 0;

        const data = await proxmoxRequest(`nodes/${n}/lxc`, "POST", body);
        return textContent(
          `コンテナ ${vmid} 作成タスク発行: ${data}`
        );
      }
    );

    server.registerTool(
      "proxmox_clone_container",
      {
        title: "コンテナクローン (LXC)",
        description:
          "既存の LXC コンテナをクローンして新しいコンテナを作成する。テンプレートからのクローンに最適。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("クローン元のコンテナ VMID"),
          newid: z.number().int().describe("新しいコンテナの VMID"),
          hostname: z.string().optional().describe("新しいホスト名"),
          full: z
            .boolean()
            .optional()
            .describe("フルクローンにするか (デフォルト: false = linked clone)"),
          storage: z.string().optional().describe("ストレージ先"),
          description: z.string().optional().describe("説明"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async ({ node, vmid, newid, hostname, full, storage, description }) => {
        const n = node || getDefaultNode();
        const body: Record<string, unknown> = { newid };
        if (hostname) body.hostname = hostname;
        if (full !== undefined) body.full = full ? 1 : 0;
        if (storage) body.storage = storage;
        if (description) body.description = description;

        const data = await proxmoxRequest(
          `nodes/${n}/lxc/${vmid}/clone`,
          "POST",
          body
        );
        return textContent(
          `コンテナ ${vmid} → ${newid} クローンタスク発行: ${data}`
        );
      }
    );

    server.registerTool(
      "proxmox_delete_container",
      {
        title: "コンテナ削除 (LXC)",
        description:
          "指定 LXC コンテナを削除する。削除前にコンテナが停止している必要がある。confirm=true が必須。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("削除するコンテナの VMID"),
          confirm: z
            .boolean()
            .describe("削除確認 (true にする必要がある)"),
          purge: z
            .boolean()
            .optional()
            .describe(
              "関連ジョブやファイアウォールルールも削除するか"
            ),
          force: z
            .boolean()
            .optional()
            .describe("起動中でも強制削除するか"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async ({ node, vmid, confirm, purge, force }) => {
        if (!confirm) {
          return textContent(
            "エラー: confirm=true を指定してください。この操作はコンテナを完全に削除します。"
          );
        }
        const n = node || getDefaultNode();
        const body: Record<string, unknown> = {};
        if (purge) body.purge = 1;
        if (force) body.force = 1;

        const data = await proxmoxRequest(
          `nodes/${n}/lxc/${vmid}`,
          "DELETE",
          body
        );
        return textContent(`コンテナ ${vmid} 削除タスク発行: ${data}`);
      }
    );

    server.registerTool(
      "proxmox_update_container_config",
      {
        title: "コンテナ設定更新 (LXC)",
        description:
          "LXC コンテナの設定を更新する。メモリ・CPU・ネットワーク・ディスク等を変更可能。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("コンテナ ID (VMID)"),
          memory: z.number().int().optional().describe("メモリ (MB)"),
          swap: z.number().int().optional().describe("スワップ (MB)"),
          cores: z.number().int().optional().describe("CPU コア数"),
          hostname: z.string().optional().describe("ホスト名"),
          description: z.string().optional().describe("説明"),
          net0: z.string().optional().describe("ネットワーク設定"),
          onboot: z.boolean().optional().describe("起動時自動開始"),
          startup: z.string().optional().describe("起動順序設定"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, vmid, memory, swap, cores, hostname, description, net0, onboot, startup }) => {
        const n = node || getDefaultNode();
        const body: Record<string, unknown> = {};
        if (memory !== undefined) body.memory = memory;
        if (swap !== undefined) body.swap = swap;
        if (cores !== undefined) body.cores = cores;
        if (hostname) body.hostname = hostname;
        if (description !== undefined) body.description = description;
        if (net0) body.net0 = net0;
        if (onboot !== undefined) body.onboot = onboot ? 1 : 0;
        if (startup) body.startup = startup;

        const data = await proxmoxRequest(
          `nodes/${n}/lxc/${vmid}/config`,
          "PUT",
          body
        );
        return textContent(
          `コンテナ ${vmid} 設定更新完了`
        );
      }
    );

    // =====================================================================
    // STORAGE
    // =====================================================================

    server.registerTool(
      "proxmox_list_storages",
      {
        title: "ストレージ一覧",
        description:
          "指定ノードで利用可能なストレージを一覧取得する。使用量・容量を含む。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          content: z
            .string()
            .optional()
            .describe(
              "コンテンツタイプで絞り込み (images/rootdir/vztmpl/backup/iso/snippets)"
            ),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, content }) => {
        const n = node || getDefaultNode();
        const path = content
          ? `nodes/${n}/storage?content=${content}`
          : `nodes/${n}/storage`;
        const data = await proxmoxRequest(path);
        return jsonContent(data);
      }
    );

    server.registerTool(
      "proxmox_storage_content",
      {
        title: "ストレージ内容一覧",
        description:
          "指定ストレージの中身を一覧取得する。ISO、テンプレート、バックアップ等。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          storage: z.string().describe("ストレージ名 (e.g. local, local-lvm)"),
          content: z
            .string()
            .optional()
            .describe("コンテンツタイプで絞り込み"),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, storage, content }) => {
        const n = node || getDefaultNode();
        const path = content
          ? `nodes/${n}/storage/${storage}/content?content=${content}`
          : `nodes/${n}/storage/${storage}/content`;
        const data = await proxmoxRequest(path);
        return jsonContent(data);
      }
    );

    // =====================================================================
    // SNAPSHOTS
    // =====================================================================

    server.registerTool(
      "proxmox_list_snapshots",
      {
        title: "スナップショット一覧",
        description:
          "指定 VM/コンテナのスナップショットを一覧取得する。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("VM/コンテナ ID"),
          type: z
            .enum(["qemu", "lxc"])
            .describe("VM タイプ (qemu or lxc)"),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, vmid, type }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(
          `nodes/${n}/${type}/${vmid}/snapshot`
        );
        return jsonContent(data);
      }
    );

    server.registerTool(
      "proxmox_create_snapshot",
      {
        title: "スナップショット作成",
        description: "指定 VM/コンテナのスナップショットを作成する。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("VM/コンテナ ID"),
          type: z.enum(["qemu", "lxc"]).describe("VM タイプ"),
          snapname: z.string().describe("スナップショット名"),
          description: z.string().optional().describe("説明"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async ({ node, vmid, type, snapname, description }) => {
        const n = node || getDefaultNode();
        const body: Record<string, unknown> = { snapname };
        if (description) body.description = description;
        const data = await proxmoxRequest(
          `nodes/${n}/${type}/${vmid}/snapshot`,
          "POST",
          body
        );
        return textContent(
          `スナップショット "${snapname}" 作成タスク発行: ${data}`
        );
      }
    );

    server.registerTool(
      "proxmox_rollback_snapshot",
      {
        title: "スナップショットロールバック",
        description:
          "指定スナップショットにロールバックする。現在の状態は失われるので注意。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("VM/コンテナ ID"),
          type: z.enum(["qemu", "lxc"]).describe("VM タイプ"),
          snapname: z.string().describe("ロールバック先のスナップショット名"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, vmid, type, snapname }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(
          `nodes/${n}/${type}/${vmid}/snapshot/${snapname}/rollback`,
          "POST"
        );
        return textContent(
          `スナップショット "${snapname}" ロールバックタスク発行: ${data}`
        );
      }
    );

    server.registerTool(
      "proxmox_delete_snapshot",
      {
        title: "スナップショット削除",
        description: "指定スナップショットを削除する。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          vmid: z.number().int().describe("VM/コンテナ ID"),
          type: z.enum(["qemu", "lxc"]).describe("VM タイプ"),
          snapname: z.string().describe("削除するスナップショット名"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      async ({ node, vmid, type, snapname }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(
          `nodes/${n}/${type}/${vmid}/snapshot/${snapname}`,
          "DELETE"
        );
        return textContent(
          `スナップショット "${snapname}" 削除タスク発行: ${data}`
        );
      }
    );

    // =====================================================================
    // TASKS
    // =====================================================================

    server.registerTool(
      "proxmox_list_tasks",
      {
        title: "タスク一覧",
        description:
          "指定ノードの最近のタスク一覧を取得する。VMの起動・停止・作成等の非同期操作を追跡可能。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          limit: z
            .number()
            .int()
            .optional()
            .describe("取得件数 (デフォルト: 50)"),
          vmid: z
            .number()
            .int()
            .optional()
            .describe("特定のVMIDでフィルタ"),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, limit, vmid }) => {
        const n = node || getDefaultNode();
        const params = new URLSearchParams();
        if (limit) params.append("limit", String(limit));
        if (vmid) params.append("vmid", String(vmid));
        const qs = params.toString();
        const path = qs ? `nodes/${n}/tasks?${qs}` : `nodes/${n}/tasks`;
        const data = await proxmoxRequest(path);
        return jsonContent(data);
      }
    );

    server.registerTool(
      "proxmox_task_status",
      {
        title: "タスクステータス",
        description:
          "指定タスク (UPID) の詳細ステータスを取得する。完了/実行中/エラーを確認。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          upid: z.string().describe("タスクの UPID"),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, upid }) => {
        const n = node || getDefaultNode();
        const data = await proxmoxRequest(
          `nodes/${n}/tasks/${encodeURIComponent(upid)}/status`
        );
        return jsonContent(data);
      }
    );

    server.registerTool(
      "proxmox_task_log",
      {
        title: "タスクログ",
        description: "指定タスク (UPID) のログ出力を取得する。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          upid: z.string().describe("タスクの UPID"),
          limit: z
            .number()
            .int()
            .optional()
            .describe("ログ行数 (デフォルト: 50)"),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, upid, limit }) => {
        const n = node || getDefaultNode();
        const params = new URLSearchParams();
        if (limit) params.append("limit", String(limit));
        const qs = params.toString();
        const path = qs
          ? `nodes/${n}/tasks/${encodeURIComponent(upid)}/log?${qs}`
          : `nodes/${n}/tasks/${encodeURIComponent(upid)}/log`;
        const data = await proxmoxRequest<Array<{ n: number; t: string }>>(
          path
        );
        const logText = data.map((line) => line.t).join("\n");
        return textContent(logText);
      }
    );

    // =====================================================================
    // NETWORK
    // =====================================================================

    server.registerTool(
      "proxmox_list_networks",
      {
        title: "ネットワーク一覧",
        description:
          "指定ノードのネットワークインターフェースを一覧取得する。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          type: z
            .enum(["bridge", "bond", "eth", "alias", "vlan", "OVSBridge", "OVSBond", "OVSPort", "OVSIntPort", "any_bridge", "any_local_bridge"])
            .optional()
            .describe("インターフェースタイプで絞り込み"),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, type }) => {
        const n = node || getDefaultNode();
        const path = type
          ? `nodes/${n}/network?type=${type}`
          : `nodes/${n}/network`;
        const data = await proxmoxRequest(path);
        return jsonContent(data);
      }
    );

    // =====================================================================
    // TEMPLATES (VZ templates)
    // =====================================================================

    server.registerTool(
      "proxmox_list_templates",
      {
        title: "テンプレート一覧",
        description:
          "利用可能な OS テンプレート一覧を取得する。コンテナ作成時の ostemplate パラメータに使用。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          storage: z
            .string()
            .optional()
            .describe("ストレージ名 (省略時は local)"),
        },
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      async ({ node, storage }) => {
        const n = node || getDefaultNode();
        const s = storage || "local";
        const data = await proxmoxRequest(
          `nodes/${n}/storage/${s}/content?content=vztmpl`
        );
        return jsonContent(data);
      }
    );

    server.registerTool(
      "proxmox_download_template",
      {
        title: "テンプレートダウンロード",
        description:
          "Proxmox の公式テンプレートリポジトリからテンプレートをダウンロードする。",
        inputSchema: {
          node: z.string().optional().describe("ノード名 (省略時はデフォルト)"),
          storage: z
            .string()
            .optional()
            .describe("保存先ストレージ (デフォルト: local)"),
          template: z
            .string()
            .describe(
              "テンプレートファイル名 (e.g. debian-12-standard_12.7-1_amd64.tar.zst)"
            ),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true,
        },
      },
      async ({ node, storage, template }) => {
        const n = node || getDefaultNode();
        const s = storage || "local";
        const data = await proxmoxRequest(
          `nodes/${n}/aplinfo`,
          "POST",
          { storage: s, template }
        );
        return textContent(
          `テンプレート "${template}" ダウンロードタスク発行: ${data}`
        );
      }
    );

    // =====================================================================
    // GENERIC API (Escape hatch)
    // =====================================================================

    server.registerTool(
      "proxmox_api_request",
      {
        title: "汎用APIリクエスト",
        description:
          "Proxmox REST API に直接リクエストを送信する。他のツールでカバーされていないエンドポイントにアクセス可能。パスは /api2/json/ 以降を指定。",
        inputSchema: {
          path: z
            .string()
            .describe(
              "API パス (e.g. nodes/pve/qemu/100/agent/exec)"
            ),
          method: z
            .enum(["GET", "POST", "PUT", "DELETE"])
            .optional()
            .describe("HTTP メソッド (デフォルト: GET)"),
          body: z
            .record(z.unknown())
            .optional()
            .describe("リクエストボディ (POST/PUT 時)"),
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true,
        },
      },
      async ({ path, method, body }) => {
        const data = await proxmoxRequest(
          path,
          (method as "GET" | "POST" | "PUT" | "DELETE") || "GET",
          body as Record<string, unknown> | undefined
        );
        return jsonContent(data);
      }
    );
  },
  {},
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: true,
  }
);

// ---------------------------------------------------------------------------
// Route handler with API key auth
// ---------------------------------------------------------------------------

async function withAuth(
  request: NextRequest,
  handlerFn: (req: NextRequest) => Promise<Response>
): Promise<Response> {
  if (!verifyApiKey(request)) {
    return unauthorizedResponse();
  }
  return handlerFn(request);
}

export async function GET(request: NextRequest) {
  return withAuth(request, handler as unknown as (req: NextRequest) => Promise<Response>);
}

export async function POST(request: NextRequest) {
  return withAuth(request, handler as unknown as (req: NextRequest) => Promise<Response>);
}

export async function DELETE(request: NextRequest) {
  return withAuth(request, handler as unknown as (req: NextRequest) => Promise<Response>);
}
