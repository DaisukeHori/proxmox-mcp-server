#!/bin/bash
# =================================================================
# Proxmox MCP Server - Cloudflare Tunnel セットアップスクリプト
#
# Proxmoxサーバー(192.168.70.226)でroot権限で実行してください:
#   curl -sL https://raw.githubusercontent.com/DaisukeHori/proxmox-mcp-server/main/setup-tunnel.sh | bash
#
# または SSH で:
#   ssh root@192.168.70.226
#   bash < <(curl -sL https://raw.githubusercontent.com/DaisukeHori/proxmox-mcp-server/main/setup-tunnel.sh)
# =================================================================

set -euo pipefail

echo "============================================"
echo " Proxmox MCP - Cloudflare Tunnel セットアップ"
echo "============================================"
echo ""

# Step 1: cloudflared がインストールされているか確認
if ! command -v cloudflared &> /dev/null; then
    echo "[!] cloudflared が見つかりません。インストールします..."
    curl -L --output /tmp/cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
    dpkg -i /tmp/cloudflared.deb
    rm /tmp/cloudflared.deb
    echo "[✓] cloudflared インストール完了"
else
    echo "[✓] cloudflared $(cloudflared --version 2>&1 | head -1)"
fi

echo ""

# Step 2: 既存のトンネル設定を確認
CONFIG_PATHS=(
    "/etc/cloudflared/config.yml"
    "/root/.cloudflared/config.yml"
    "/home/cloudflared/.cloudflared/config.yml"
)

CONFIG_FILE=""
for path in "${CONFIG_PATHS[@]}"; do
    if [ -f "$path" ]; then
        CONFIG_FILE="$path"
        break
    fi
done

if [ -z "$CONFIG_FILE" ]; then
    echo "[!] 既存の cloudflared 設定ファイルが見つかりません"
    echo "    cloudflared tunnel login を先に実行してください"
    echo ""
    echo "    手順:"
    echo "    1. cloudflared tunnel login"
    echo "    2. ブラウザでCloudflareにログイン & appserver.tokyoを選択"
    echo "    3. cloudflared tunnel create proxmox-tunnel"
    echo "    4. このスクリプトを再度実行"
    exit 1
fi

echo "[✓] 設定ファイル発見: $CONFIG_FILE"
echo ""
echo "--- 現在の設定 ---"
cat "$CONFIG_FILE"
echo ""
echo "------------------"
echo ""

# Step 3: proxmox.appserver.tokyo が既に設定されているか確認
if grep -q "proxmox.appserver.tokyo" "$CONFIG_FILE"; then
    echo "[✓] proxmox.appserver.tokyo は既に設定されています！"
    echo ""
    echo "cloudflared を再起動して反映します..."
    systemctl restart cloudflared 2>/dev/null || cloudflared tunnel run &
    echo "[✓] 完了！"
    exit 0
fi

# Step 4: 設定を追加
echo "[*] proxmox.appserver.tokyo のルートを追加します..."

# バックアップ
cp "$CONFIG_FILE" "${CONFIG_FILE}.bak.$(date +%s)"

# ingress セクションの最後の catch-all ルール（- service: http_status:404）の前に追加
if grep -q "http_status:404" "$CONFIG_FILE"; then
    # catch-all の前に挿入
    sed -i '/http_status:404/i\  - hostname: proxmox.appserver.tokyo\n    service: https://localhost:8006\n    originRequest:\n      noTLSVerify: true' "$CONFIG_FILE"
    echo "[✓] ingress ルールを追加しました"
elif grep -q "ingress:" "$CONFIG_FILE"; then
    # ingress: の直後に追加
    sed -i '/ingress:/a\  - hostname: proxmox.appserver.tokyo\n    service: https://localhost:8006\n    originRequest:\n      noTLSVerify: true' "$CONFIG_FILE"
    echo "[✓] ingress ルールを追加しました"
else
    # ingress セクションがない場合は追記
    cat >> "$CONFIG_FILE" << 'EOF'

ingress:
  - hostname: proxmox.appserver.tokyo
    service: https://localhost:8006
    originRequest:
      noTLSVerify: true
  - service: http_status:404
EOF
    echo "[✓] ingress セクションを新規追加しました"
fi

echo ""
echo "--- 更新後の設定 ---"
cat "$CONFIG_FILE"
echo ""
echo "--------------------"
echo ""

# Step 5: Cloudflare DNS に CNAME を追加するよう案内
echo "[!] Cloudflare DNS 設定が必要です:"
echo "    ドメイン: appserver.tokyo"
echo "    タイプ: CNAME"
echo "    名前: proxmox"
echo "    ターゲット: <tunnel-id>.cfargotunnel.com"
echo ""

# トンネルIDを取得してみる
TUNNEL_ID=$(grep -oP 'tunnel:\s*\K[a-f0-9-]+' "$CONFIG_FILE" 2>/dev/null || echo "")
if [ -n "$TUNNEL_ID" ]; then
    echo "    → 検出されたトンネルID: $TUNNEL_ID"
    echo "    → CNAME ターゲット: ${TUNNEL_ID}.cfargotunnel.com"
    echo ""
    echo "    Cloudflare Dashboard → DNS → Add record:"
    echo "    Type: CNAME"
    echo "    Name: proxmox"  
    echo "    Target: ${TUNNEL_ID}.cfargotunnel.com"
    echo "    Proxy: ON (オレンジ雲)"
    echo ""
    
    # cloudflared tunnel route dns で自動追加を試みる
    echo "[*] DNS ルートの自動追加を試みます..."
    if cloudflared tunnel route dns "$TUNNEL_ID" proxmox.appserver.tokyo 2>/dev/null; then
        echo "[✓] DNS ルート自動追加成功！"
    else
        echo "[!] 自動追加失敗 — Cloudflare Dashboard から手動で追加してください"
    fi
fi

echo ""

# Step 6: cloudflared 再起動
echo "[*] cloudflared を再起動します..."
if systemctl is-active --quiet cloudflared 2>/dev/null; then
    systemctl restart cloudflared
    echo "[✓] systemctl restart cloudflared 完了"
elif pgrep -f "cloudflared tunnel" > /dev/null; then
    pkill -f "cloudflared tunnel"
    sleep 2
    nohup cloudflared tunnel run > /var/log/cloudflared-tunnel.log 2>&1 &
    echo "[✓] cloudflared tunnel run 再起動完了"
else
    echo "[!] cloudflared が起動していません。手動で起動してください:"
    echo "    cloudflared tunnel run"
fi

echo ""
echo "============================================"
echo " セットアップ完了！"
echo ""
echo " 確認方法:"
echo "   curl -sk https://proxmox.appserver.tokyo/api2/json/version"
echo ""
echo " Claude.ai MCP 接続URL:"
echo "   https://proxmox-mcp-server.vercel.app/api/sse?api_key=pmcp-7a28ced7c50b4762bdc720dc77a2e6c3d2e8a7b0"
echo "============================================"
