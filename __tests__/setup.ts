import { vi, beforeEach } from "vitest";

// Reset all mocks before each test
beforeEach(() => {
  vi.restoreAllMocks();
  // Clear env vars set during tests
  delete process.env.PROXMOX_BASE_URL;
  delete process.env.PROXMOX_TOKEN_ID;
  delete process.env.PROXMOX_TOKEN_SECRET;
  delete process.env.PROXMOX_DEFAULT_NODE;
  delete process.env.MCP_API_KEY;
});
