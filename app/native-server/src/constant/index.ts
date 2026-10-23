import { EXTENSION_ID } from '../scripts/constant';
import type { OriginPattern } from '../server/cors-origin';

export enum NATIVE_MESSAGE_TYPE {
  START = 'start',
  STARTED = 'started',
  STOP = 'stop',
  STOPPED = 'stopped',
  PING = 'ping',
  PONG = 'pong',
  ERROR = 'error',
}

export const NATIVE_SERVER_PORT = 12306;

// Timeout constants (in milliseconds)
export const TIMEOUTS = {
  DEFAULT_REQUEST_TIMEOUT: 15000,
  EXTENSION_REQUEST_TIMEOUT: 20000,
  PROCESS_DATA_TIMEOUT: 20000,
} as const;

/**
 * Extension ids allowed to call this server.
 *
 * Defaults to the published extension id, the same one `register` writes into the
 * native-messaging manifest's `allowed_origins`.
 *
 * Why pin it instead of allowing every `chrome-extension://` origin: this server
 * exposes browser automation and filesystem routes on loopback, so a blanket
 * scheme match lets any extension the user happens to have installed drive it.
 *
 * Override with a comma-separated `CHROME_MCP_ALLOWED_EXTENSION_IDS` when running
 * an unpacked build of the extension — Chrome assigns those a different id, and
 * without the override the bridge will reject it.
 */
function allowedExtensionIds(): string[] {
  const override = process.env.CHROME_MCP_ALLOWED_EXTENSION_IDS;
  if (override && override.trim()) {
    return override
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }
  return [EXTENSION_ID];
}

// Server configuration
export const SERVER_CONFIG = {
  HOST: '127.0.0.1',
  /**
   * CORS origin allow-list for the local HTTP API.
   *
   * Entries are matched as origins — scheme plus host — by
   * `server/cors-origin.ts`, never as string prefixes. The prefix form this
   * replaced let `http://127.0.0.1.<attacker-domain>` through.
   *
   * `moz-extension://` is not listed: nothing in this project targets Firefox,
   * `register` only writes Chrome and Chromium native-messaging manifests, so a
   * blanket Firefox-extension entry granted access without enabling any
   * supported configuration.
   */
  CORS_ORIGIN: [
    ...allowedExtensionIds().map((id) => `chrome-extension://${id}`),
    'http://127.0.0.1',
  ] as readonly OriginPattern[],
  LOGGER_ENABLED: false,
} as const;

// HTTP Status codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
  GATEWAY_TIMEOUT: 504,
} as const;

// Error messages
export const ERROR_MESSAGES = {
  NATIVE_HOST_NOT_AVAILABLE: 'Native host connection not established.',
  SERVER_NOT_RUNNING: 'Server is not actively running.',
  REQUEST_TIMEOUT: 'Request to extension timed out.',
  INVALID_MCP_REQUEST: 'Invalid MCP request or session.',
  INVALID_SESSION_ID: 'Invalid or missing MCP session ID.',
  INTERNAL_SERVER_ERROR: 'Internal Server Error',
  MCP_SESSION_DELETION_ERROR: 'Internal server error during MCP session deletion.',
  MCP_REQUEST_PROCESSING_ERROR: 'Internal server error during MCP request processing.',
  INVALID_SSE_SESSION: 'Invalid or missing MCP session ID for SSE.',
} as const;

// ============================================================
// Chrome MCP Server Configuration
// ============================================================

/**
 * Environment variables for dynamically resolving the local MCP HTTP endpoint.
 * CHROME_MCP_PORT is the preferred source; MCP_HTTP_PORT is kept for backward compatibility.
 */
export const CHROME_MCP_PORT_ENV = 'CHROME_MCP_PORT';
export const MCP_HTTP_PORT_ENV = 'MCP_HTTP_PORT';

/**
 * Get the actual port the Chrome MCP server is listening on.
 * Priority: CHROME_MCP_PORT env > MCP_HTTP_PORT env > NATIVE_SERVER_PORT default
 */
export function getChromeMcpPort(): number {
  const raw = process.env[CHROME_MCP_PORT_ENV] || process.env[MCP_HTTP_PORT_ENV];
  const port = raw ? Number.parseInt(String(raw), 10) : NaN;
  return Number.isFinite(port) && port > 0 && port <= 65535 ? port : NATIVE_SERVER_PORT;
}

/**
 * Get the full URL to the local Chrome MCP HTTP endpoint.
 * This URL is used by Claude/Codex agents to connect to the MCP server.
 */
export function getChromeMcpUrl(): string {
  return `http://${SERVER_CONFIG.HOST}:${getChromeMcpPort()}/mcp`;
}
