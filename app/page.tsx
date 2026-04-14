export default function Home() {
  return (
    <div style={{ fontFamily: "system-ui", padding: "2rem", maxWidth: 600 }}>
      <h1>Proxmox MCP Server</h1>
      <p>Proxmox VE management via Model Context Protocol.</p>
      <h2>Endpoints</h2>
      <ul>
        <li><code>/api/mcp</code> — Streamable HTTP (recommended)</li>
        <li><code>/api/sse</code> — Server-Sent Events</li>
      </ul>
      <h2>Tools ({toolCount})</h2>
      <pre style={{ fontSize: "0.85rem", background: "#f5f5f5", padding: "1rem", borderRadius: 8 }}>
{toolList}
      </pre>
    </div>
  );
}

const tools = [
  "proxmox_cluster_status",
  "proxmox_cluster_resources",
  "proxmox_list_nodes",
  "proxmox_node_status",
  "proxmox_list_vms",
  "proxmox_vm_status",
  "proxmox_vm_config",
  "proxmox_vm_start",
  "proxmox_vm_stop",
  "proxmox_vm_shutdown",
  "proxmox_vm_reboot",
  "proxmox_list_containers",
  "proxmox_container_status",
  "proxmox_container_config",
  "proxmox_container_start",
  "proxmox_container_stop",
  "proxmox_container_shutdown",
  "proxmox_container_reboot",
  "proxmox_create_container",
  "proxmox_clone_container",
  "proxmox_delete_container",
  "proxmox_update_container_config",
  "proxmox_list_storages",
  "proxmox_storage_content",
  "proxmox_list_snapshots",
  "proxmox_create_snapshot",
  "proxmox_rollback_snapshot",
  "proxmox_delete_snapshot",
  "proxmox_list_tasks",
  "proxmox_task_status",
  "proxmox_task_log",
  "proxmox_list_networks",
  "proxmox_list_templates",
  "proxmox_download_template",
  "proxmox_api_request",
];

const toolCount = tools.length;
const toolList = tools.join("\n");
