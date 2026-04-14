# Proxmox MCP Server

**AIでProxmoxクラスタを完全リモート操作する。**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDaisukeHori%2Fproxmox-mcp-server&env=PROXMOX_BASE_URL%2CPROXMOX_TOKEN_ID%2CPROXMOX_TOKEN_SECRET%2CPROXMOX_DEFAULT_NODE%2CMCP_API_KEY&envDescription=Proxmox+API+接続情報とMCP認証キー&project-name=proxmox-mcp-server&repository-name=proxmox-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Tests](https://img.shields.io/badge/tests-583_passed-brightgreen.svg)](__tests__)
[![Tools](https://img.shields.io/badge/MCP_Tools-35-8B5CF6.svg)](https://proxmox-mcp-server.vercel.app)

> **エンドポイント:** `https://proxmox-mcp-server.vercel.app/api/mcp`
> **LP:** [daisukehori.github.io/proxmox-mcp-server](https://daisukehori.github.io/proxmox-mcp-server/)

「LXCコンテナを5台作って」「メモリが逼迫してるノードを教えて」「スナップショット撮ってからカーネルアップデートして」— Proxmox VEの全操作をAIとの会話で完結。

Vercelにデプロイし、Cloudflare Tunnel経由でローカルProxmoxクラスタに接続。35のMCPツールで、VM/コンテナのライフサイクル管理からストレージ・スナップショット・タスク監視まで、自然言語で操作できます。


## アーキテクチャ

```
┌────────────────────────────────────────────────────┐
│  Claude.ai / Claude Desktop / Cursor               │
│  「コンテナ300をクローンしてVMID 400で起動して」    │
└──────────────┬─────────────────────────────────────┘
               │ MCP (Streamable HTTP / SSE)
               │ ?key=<MCP_API_KEY>
               ▼
┌────────────────────────────────────────────────────┐
│  Vercel (proxmox-mcp-server)                       │
│  Next.js + mcp-handler                             │
│  35 MCP Tools / API Key認証                        │
└──────────────┬─────────────────────────────────────┘
               │ HTTPS (PVEAPIToken認証)
               ▼
┌────────────────────────────────────────────────────┐
│  Cloudflare Tunnel                                 │
│  vm.appserver.tokyo → 192.168.70.226:8006          │
│  noTLSVerify (自己署名証明書対応)                   │
└──────────────┬─────────────────────────────────────┘
               │ LAN
               ▼
┌────────────────────────────────────────────────────┐
│  Proxmox VE Cluster                                │
│  4 Nodes / 60 Cores / 501 GiB RAM                  │
│  VM + LXC + Storage + Network                      │
└────────────────────────────────────────────────────┘
```

**2層認証:**
- **外部 (Claude → Vercel):** MCP_API_KEY によるAPIキー認証（`?key=` または `Bearer`）
- **内部 (Vercel → Proxmox):** PVE APIトークン（環境変数で管理、リクエストに露出しない）


## 使用例

```
ユーザー: 「クラスタの状態を教えて」

AI: Proxmoxクラスタ（4ノード）のステータスです:

    ┌──────────────┬─────────┬─────────────────┬────────┐
    │ ノード       │ CPU     │ メモリ           │ 稼働   │
    ├──────────────┼─────────┼─────────────────┼────────┤
    │ pve          │ 1.8%    │ 11.2/62.2 GiB   │ 2d 3h  │
    │ proxmox02    │ 0.2%    │ 2.2/62.2 GiB    │ 2d 3h  │
    │ proxmox256   │ 0.9%    │ 16.3/251.4 GiB  │ 2d 3h  │
    │ proxmoxgpu   │ 0.3%    │ 8.6/125.6 GiB   │ 2d 3h  │
    └──────────────┴─────────┴─────────────────┴────────┘

    全ノードオンラインです。proxmox02のメモリ使用率が最も低い(3.6%)です。

ユーザー: 「proxmox02にDebian 12コンテナを3台作って。VMID 400-402。メモリ2GB、2コア」

AI: 承知しました。テンプレートを確認して作成します。

    ✅ CT 400 (debian-400) 作成完了
    ✅ CT 401 (debian-401) 作成完了
    ✅ CT 402 (debian-402) 作成完了

    3台とも起動しますか？

ユーザー: 「全部起動して。あとスナップショットも撮っておいて」

AI: 起動とスナップショットを実行します。

    ✅ CT 400 起動完了 → スナップショット "initial" 作成
    ✅ CT 401 起動完了 → スナップショット "initial" 作成
    ✅ CT 402 起動完了 → スナップショット "initial" 作成

    全コンテナが稼働中です。
```


## クイックスタート（3ステップ）

### ステップ1: Proxmox APIトークンを作成

Proxmox Web UI → Datacenter → Permissions → API Tokens → Add

```
ユーザー: ccp@pve (または任意のユーザー)
トークンID: mcp-api
Privilege Separation: チェックを外す (フルアクセス)
```

> **⚠️ Privilege Separation** をオフにしないと、VMやコンテナの操作権限がありません。

### ステップ2: Cloudflare Tunnelでプロキシ

Proxmox APIポート(8006)をインターネットに公開します。

**Cloudflare Zero Trust Dashboard → Tunnels → Public Hostname追加:**

| 項目 | 値 |
|:--|:--|
| Subdomain | `vm`（例: vm.appserver.tokyo） |
| Service Type | HTTPS |
| URL | `192.168.70.226:8006` |
| TLS → No TLS Verify | ✅ ON（Proxmox自己署名証明書） |

### ステップ3: MCPサーバーを接続

#### Claude.ai (Web)

Settings → Connect Apps → Add Integration:

```
https://proxmox-mcp-server.vercel.app/api/mcp?key=YOUR_MCP_API_KEY
```

#### Claude Desktop / Cursor / VS Code

```json
{
  "mcpServers": {
    "proxmox": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://proxmox-mcp-server.vercel.app/api/mcp"],
      "env": {
        "HEADER_Authorization": "Bearer YOUR_MCP_API_KEY"
      }
    }
  }
}
```

#### Claude Code

```bash
claude mcp add --transport http proxmox https://proxmox-mcp-server.vercel.app/api/mcp \
  --header "Authorization: Bearer YOUR_MCP_API_KEY"
```


## 🔒 セキュリティ

**Q: Proxmox APIをインターネットに公開して大丈夫？**

- Cloudflare Tunnel経由なので**ポート開放は不要**。Proxmoxサーバーへの直接アクセスは不可
- MCPサーバーへのアクセスは**APIキー認証**で保護（`?key=` or `Authorization: Bearer`）
- Proxmox API自体も**PVE APIトークン認証**で二重保護
- サーバーは**ステートレス**。トークンは環境変数に保存され、リクエストには露出しない
- 通信は全て**HTTPS（TLS暗号化）**
- ソースコードは**全て公開**。`app/api/[transport]/route.ts` で処理を確認可能

**さらに安全にしたい場合:** Cloudflare Access（Zero Trust）でIP制限やメール認証を追加できます。


## ツール一覧（35ツール）

### クラスタ管理（2）

| ツール | 説明 | R/W |
|:--|:--|:--|
| `proxmox_cluster_status` | クラスタ全体のステータス・ノード一覧・クォーラム情報 | R |
| `proxmox_cluster_resources` | 全リソース一覧。typeフィルタ（vm/storage/node/sdn）対応 | R |

### ノード管理（2）

| ツール | 説明 | R/W |
|:--|:--|:--|
| `proxmox_list_nodes` | 全ノード一覧（CPU%・メモリ・稼働時間をフォーマット表示） | R |
| `proxmox_node_status` | 指定ノードの詳細（カーネル・CPU・メモリ・ディスク） | R |

### QEMU VM（7）

| ツール | 説明 | R/W |
|:--|:--|:--|
| `proxmox_list_vms` | 指定ノードの全VM一覧 | R |
| `proxmox_vm_status` | VMのリアルタイムステータス | R |
| `proxmox_vm_config` | VM設定（CPU/メモリ/ディスク/NIC/ブート順序） | R |
| `proxmox_vm_start` | VM起動 | W |
| `proxmox_vm_stop` | VM強制停止（電源断相当） | ⚠️ |
| `proxmox_vm_shutdown` | VMグレースフルシャットダウン（ACPI） | W |
| `proxmox_vm_reboot` | VM再起動 | W |

### LXCコンテナ（11）

| ツール | 説明 | R/W |
|:--|:--|:--|
| `proxmox_list_containers` | 指定ノードの全コンテナ一覧 | R |
| `proxmox_container_status` | コンテナのリアルタイムステータス | R |
| `proxmox_container_config` | コンテナ設定（CPU/メモリ/rootfs/NIC） | R |
| `proxmox_container_start` | コンテナ起動 | W |
| `proxmox_container_stop` | コンテナ強制停止 | ⚠️ |
| `proxmox_container_shutdown` | コンテナグレースフルシャットダウン | W |
| `proxmox_container_reboot` | コンテナ再起動 | W |
| `proxmox_create_container` | 新規コンテナ作成（テンプレート指定） | W |
| `proxmox_clone_container` | コンテナクローン（テンプレートからの複製に最適） | W |
| `proxmox_delete_container` | コンテナ削除（`confirm: true` 必須） | ⚠️ |
| `proxmox_update_container_config` | コンテナ設定変更（メモリ/CPU/NIC/ホスト名等） | W |

### ストレージ（2）

| ツール | 説明 | R/W |
|:--|:--|:--|
| `proxmox_list_storages` | 利用可能ストレージ一覧（使用量/容量） | R |
| `proxmox_storage_content` | ストレージ内のISO/テンプレート/バックアップ一覧 | R |

### スナップショット（4）

| ツール | 説明 | R/W |
|:--|:--|:--|
| `proxmox_list_snapshots` | VM/CTのスナップショット一覧 | R |
| `proxmox_create_snapshot` | スナップショット作成 | W |
| `proxmox_rollback_snapshot` | スナップショットにロールバック | ⚠️ |
| `proxmox_delete_snapshot` | スナップショット削除 | ⚠️ |

### タスク監視（3）

| ツール | 説明 | R/W |
|:--|:--|:--|
| `proxmox_list_tasks` | 最近のタスク一覧（VMIDフィルタ/件数制限対応） | R |
| `proxmox_task_status` | UPIDによるタスクステータス確認 | R |
| `proxmox_task_log` | UPIDによるタスクログ取得 | R |

### ネットワーク / テンプレート / 汎用（4）

| ツール | 説明 | R/W |
|:--|:--|:--|
| `proxmox_list_networks` | ネットワークインターフェース一覧 | R |
| `proxmox_list_templates` | 利用可能なOSテンプレート一覧 | R |
| `proxmox_download_template` | 公式リポジトリからテンプレートDL | W |
| `proxmox_api_request` | 任意のProxmox REST APIエンドポイント呼び出し | R/W |


## ⚠️ 重要な注意事項

### Destructiveツール

| ツール | 注意 |
|:--|:--|
| `vm_stop` / `container_stop` | **即座に電源断。** 未保存データ消失。shutdown推奨 |
| `delete_container` | `confirm: true` 必須。データ**完全削除** |
| `rollback_snapshot` | 現在の状態**完全消失**。事前スナップショット推奨 |

### デフォルトノード

`node` 省略時 → 環境変数 `PROXMOX_DEFAULT_NODE`（デフォルト: `pve`）。マルチノードクラスタでは明示指定推奨。


## 自分でデプロイする

### Vercel（推奨）

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FDaisukeHori%2Fproxmox-mcp-server&env=PROXMOX_BASE_URL%2CPROXMOX_TOKEN_ID%2CPROXMOX_TOKEN_SECRET%2CPROXMOX_DEFAULT_NODE%2CMCP_API_KEY&envDescription=Proxmox+API+接続情報とMCP認証キー&project-name=proxmox-mcp-server&repository-name=proxmox-mcp-server)

### 環境変数

| 変数名 | 必須 | 説明 | 例 |
|:--|:--|:--|:--|
| `PROXMOX_BASE_URL` | ✅ | Cloudflare Tunnel URL | `https://vm.appserver.tokyo` |
| `PROXMOX_TOKEN_ID` | ✅ | PVE APIトークンID | `ccp@pve!mcp-api` |
| `PROXMOX_TOKEN_SECRET` | ✅ | PVE APIトークンシークレット | `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` |
| `PROXMOX_DEFAULT_NODE` | | デフォルトノード名 | `pve`（デフォルト） |
| `MCP_API_KEY` | | MCP認証キー（未設定で認証スキップ） | `pmcp-xxxxxxxx` |


## テスト

583テスト（単体208 + 結合375）。Vitest。全パス。

```bash
npm test            # 全テスト実行
npm run test:watch  # ウォッチモード
```


## 技術スタック

Next.js 15 / TypeScript / mcp-handler / MCP SDK / Zod / Vitest / Vercel / Cloudflare Tunnel / Proxmox VE API


## ライセンス

MIT License
