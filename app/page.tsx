export default function Home() {
  return (
    <div style={{ fontFamily: "'Lexend Deca', -apple-system, BlinkMacSystemFont, sans-serif", maxWidth: 720, margin: "0 auto", padding: "48px 24px", color: "#2D3E50" }}>
      <link href="https://fonts.googleapis.com/css2?family=Lexend+Deca:wght@400;600;700;800&display=swap" rel="stylesheet" />

      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: "#1A2332", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#00B4D8" }}>⬡</div>
        <div>
          <div style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-0.02em" }}>Proxmox MCP Server</div>
          <div style={{ fontSize: 13, color: "#516F90" }}>35 Tools / Vercel + Cloudflare Tunnel</div>
        </div>
        <div style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, background: "#DBFAE6", color: "#00875A", fontSize: 12, fontWeight: 600, padding: "4px 12px", borderRadius: 100 }}>
          <span style={{ width: 6, height: 6, background: "#00875A", borderRadius: "50%", display: "inline-block" }} /> Online
        </div>
      </div>

      <p style={{ fontSize: 16, color: "#516F90", lineHeight: 1.7, marginBottom: 32 }}>
        AIでProxmox VEクラスタを完全リモート操作する。VM・コンテナ・ストレージ・スナップショット — 35のMCPツールで自然言語から操作。
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, border: "1px solid #CBD6E2", borderRadius: 12, overflow: "hidden", marginBottom: 32 }}>
        {[
          { n: "35", l: "MCP Tools" },
          { n: "583", l: "テスト" },
          { n: "2層", l: "認証" },
          { n: "4", l: "クライアント対応" },
        ].map((s, i) => (
          <div key={i} style={{ textAlign: "center", padding: "20px 8px", borderRight: i < 3 ? "1px solid #CBD6E2" : "none" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#00B4D8", letterSpacing: "-0.02em" }}>{s.n}</div>
            <div style={{ fontSize: 11, color: "#516F90", fontWeight: 500, marginTop: 2 }}>{s.l}</div>
          </div>
        ))}
      </div>

      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#00B4D8", marginBottom: 8 }}>⬡ Endpoints</div>
        <div style={{ background: "#1A2332", borderRadius: 8, padding: 16, fontFamily: "'SF Mono', 'Fira Code', monospace", fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 1.8 }}>
          <div><span style={{ color: "#00B4D8" }}>Streamable HTTP:</span> /api/mcp</div>
          <div><span style={{ color: "#E6813A" }}>SSE:</span> /api/sse</div>
        </div>
      </div>

      <div style={{ marginBottom: 32 }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#00B4D8", marginBottom: 8 }}>⬡ Auth</div>
        <div style={{ background: "#F5F8FA", borderRadius: 8, padding: 16, fontSize: 13, lineHeight: 1.8 }}>
          <div><code style={{ background: "#E0F7FA", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>?key=MCP_API_KEY</code> URLクエリパラメータ</div>
          <div><code style={{ background: "#E0F7FA", padding: "2px 6px", borderRadius: 4, fontSize: 12 }}>Authorization: Bearer MCP_API_KEY</code> HTTPヘッダー</div>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#00B4D8", marginBottom: 12 }}>⬡ 35 Tools</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, fontSize: 13 }}>
          {[
            { cat: "クラスタ", tools: ["cluster_status", "cluster_resources"] },
            { cat: "ノード", tools: ["list_nodes", "node_status"] },
            { cat: "QEMU VM", tools: ["list_vms", "vm_status", "vm_config", "vm_start", "vm_stop", "vm_shutdown", "vm_reboot"] },
            { cat: "LXC", tools: ["list_containers", "container_status", "container_config", "container_start", "container_stop", "container_shutdown", "container_reboot", "create_container", "clone_container", "delete_container", "update_container_config"] },
            { cat: "ストレージ", tools: ["list_storages", "storage_content"] },
            { cat: "スナップショット", tools: ["list_snapshots", "create_snapshot", "rollback_snapshot", "delete_snapshot"] },
            { cat: "タスク", tools: ["list_tasks", "task_status", "task_log"] },
            { cat: "その他", tools: ["list_networks", "list_templates", "download_template", "api_request"] },
          ].map((g, i) => (
            <div key={i} style={{ background: "#F5F8FA", borderRadius: 8, padding: "12px 14px", marginBottom: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: "#00B4D8", marginBottom: 6 }}>{g.cat} ({g.tools.length})</div>
              {g.tools.map((t, j) => (
                <div key={j} style={{ fontSize: 12, fontFamily: "'SF Mono', monospace", color: "#516F90", lineHeight: 1.6 }}>proxmox_{t}</div>
              ))}
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 32, padding: "20px 0", borderTop: "1px solid #CBD6E2", fontSize: 12, color: "#516F90", display: "flex", justifyContent: "space-between" }}>
        <span>Built by Daisuke Hori / MIT License</span>
        <span>
          <a href="https://github.com/DaisukeHori/proxmox-mcp-server" style={{ color: "#00B4D8", textDecoration: "none" }}>GitHub</a>
          {" · "}
          <a href="https://daisukehori.github.io/proxmox-mcp-server/" style={{ color: "#00B4D8", textDecoration: "none" }}>Docs</a>
        </span>
      </div>
    </div>
  );
}
