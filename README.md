# Proxmox MCP Server

Proxmox VE を Claude.ai から操作するための MCP (Model Context Protocol) サーバー。
Vercel にデプロイし、Cloudflare Tunnel 経由でローカル Proxmox API に接続する。

## アーキテクチャ

```
Claude.ai ──→ Vercel (MCP Server) ──→ Cloudflare Tunnel ──→ Proxmox VE (192.168.70.226:8006)
                 ↑ API Key Auth           ↑ HTTPS               ↑ PVE API Token
```

## ツール一覧 (35 tools)

### クラスタ
- `proxmox_cluster_status` — クラスタステータス取得
- `proxmox_cluster_resources` — クラスタリソース一覧

### ノード
- `proxmox_list_nodes` — ノード一覧
- `proxmox_node_status` — ノード詳細ステータス

### QEMU VM
- `proxmox_list_vms` — VM一覧
- `proxmox_vm_status` / `proxmox_vm_config` — ステータス/設定取得
- `proxmox_vm_start` / `proxmox_vm_stop` / `proxmox_vm_shutdown` / `proxmox_vm_reboot` — ライフサイクル

### LXC コンテナ
- `proxmox_list_containers` — コンテナ一覧
- `proxmox_container_status` / `proxmox_container_config` — ステータス/設定取得
- `proxmox_container_start` / `proxmox_container_stop` / `proxmox_container_shutdown` / `proxmox_container_reboot` — ライフサイクル
- `proxmox_create_container` — コンテナ新規作成
- `proxmox_clone_container` — コンテナクローン
- `proxmox_delete_container` — コンテナ削除
- `proxmox_update_container_config` — 設定更新

### ストレージ
- `proxmox_list_storages` — ストレージ一覧
- `proxmox_storage_content` — ストレージ内容一覧

### スナップショット
- `proxmox_list_snapshots` / `proxmox_create_snapshot` / `proxmox_rollback_snapshot` / `proxmox_delete_snapshot`

### タスク
- `proxmox_list_tasks` / `proxmox_task_status` / `proxmox_task_log`

### ネットワーク
- `proxmox_list_networks` — ネットワークインターフェース一覧

### テンプレート
- `proxmox_list_templates` — テンプレート一覧
- `proxmox_download_template` — テンプレートダウンロード

### 汎用
- `proxmox_api_request` — 任意の Proxmox API エンドポイント呼び出し

## セットアップ

### 1. Cloudflare Tunnel 設定

Proxmox API (port 8006) を Cloudflare Tunnel で公開:

```bash
# cloudflared config に追加
# hostname: proxmox.appserver.tokyo
# service: https://192.168.70.226:8006
# originRequest:
#   noTLSVerify: true   ← Proxmox の自己署名証明書対応
```

### 2. Proxmox API Token 作成

```bash
# Proxmox Web UI → Datacenter → Permissions → API Tokens
# または CLI:
pveum user token add ccp@pve ccp-api --privsep 0
```

### 3. Vercel デプロイ

```bash
npm install
vercel --prod
```

### 4. 環境変数設定 (Vercel Dashboard)

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `PROXMOX_BASE_URL` | Cloudflare Tunnel URL | `https://proxmox.appserver.tokyo` |
| `PROXMOX_TOKEN_ID` | API Token ID | `ccp@pve!ccp-api` |
| `PROXMOX_TOKEN_SECRET` | API Token Secret | `c31051aa-...` |
| `PROXMOX_DEFAULT_NODE` | デフォルトノード名 | `pve` |
| `MCP_API_KEY` | MCP認証キー | `pmcp-xxxx` |

### 5. Claude.ai で接続

Claude.ai → Settings → Connect Apps → Add Integration

**URL**: `https://proxmox-mcp-server.vercel.app/api/sse`

ヘッダー設定が必要な場合は `?api_key=YOUR_KEY` をURLに付加。

## ローカル開発

```bash
cp .env.example .env
# .env を編集
npm install
npm run dev
```

## ライセンス

Private — Revol Corporation / MHD医健
