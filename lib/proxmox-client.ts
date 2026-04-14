/**
 * Proxmox VE API Client
 *
 * Proxmox REST API を直接呼び出すシンプルなクライアント。
 * Cloudflare Tunnel 経由でアクセスすることを前提としている。
 *
 * 認証: PVE API Token (Authorization: PVEAPIToken=USER@REALM!TOKENID=SECRET)
 */

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface ProxmoxConfig {
  /** Proxmox API base URL (e.g. https://proxmox.appserver.tokyo) */
  baseUrl: string;
  /** API Token ID (e.g. ccp@pve!ccp-api) */
  tokenId: string;
  /** API Token Secret (UUID) */
  tokenSecret: string;
  /** Default node name (e.g. pve) */
  defaultNode: string;
}

function getConfig(): ProxmoxConfig {
  const baseUrl = process.env.PROXMOX_BASE_URL;
  const tokenId = process.env.PROXMOX_TOKEN_ID;
  const tokenSecret = process.env.PROXMOX_TOKEN_SECRET;
  const defaultNode = process.env.PROXMOX_DEFAULT_NODE || "pve";

  if (!baseUrl || !tokenId || !tokenSecret) {
    throw new Error(
      "Missing Proxmox configuration. Set PROXMOX_BASE_URL, PROXMOX_TOKEN_ID, and PROXMOX_TOKEN_SECRET environment variables."
    );
  }

  return { baseUrl: baseUrl.replace(/\/+$/, ""), tokenId, tokenSecret, defaultNode };
}

// ---------------------------------------------------------------------------
// API Request
// ---------------------------------------------------------------------------

export interface ProxmoxApiError {
  status: number;
  statusText: string;
  message: string;
}

export async function proxmoxRequest<T = unknown>(
  path: string,
  method: "GET" | "POST" | "PUT" | "DELETE" = "GET",
  body?: Record<string, unknown>
): Promise<T> {
  const config = getConfig();
  const url = `${config.baseUrl}/api2/json/${path.replace(/^\/+/, "")}`;

  const headers: Record<string, string> = {
    Authorization: `PVEAPIToken=${config.tokenId}=${config.tokenSecret}`,
  };

  const fetchOptions: RequestInit = {
    method,
    headers,
  };

  if (body && (method === "POST" || method === "PUT")) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    // Proxmox API expects form-encoded data for POST/PUT
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }
    fetchOptions.body = params.toString();
  } else if (body && method === "DELETE") {
    // Some DELETE endpoints accept query params
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    }
    const separator = url.includes("?") ? "&" : "?";
    const fullUrl = `${url}${separator}${params.toString()}`;
    const res = await fetch(fullUrl, { ...fetchOptions, headers });
    return handleResponse<T>(res);
  }

  const res = await fetch(url, fetchOptions);
  return handleResponse<T>(res);
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const errorBody = await res.text();
      message = errorBody || message;
    } catch {
      // ignore
    }
    throw {
      status: res.status,
      statusText: res.statusText,
      message: `Proxmox API error (${res.status}): ${message}`,
    } as ProxmoxApiError;
  }

  const json = await res.json();
  // Proxmox API wraps response in { data: ... }
  return (json as { data: T }).data;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function getDefaultNode(): string {
  return process.env.PROXMOX_DEFAULT_NODE || "pve";
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

/**
 * Format uptime seconds to human-readable string
 */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  return parts.join(" ") || "0m";
}

/**
 * Helper to return MCP text content
 */
export function textContent(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

/**
 * Helper to return MCP JSON content
 */
export function jsonContent(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
