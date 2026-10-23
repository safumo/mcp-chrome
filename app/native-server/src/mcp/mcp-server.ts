import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { setupTools } from './register-tools';

/**
 * Create a fresh MCP Server for one transport session.
 *
 * The SDK's Server (Protocol) can be connected to only one transport at a
 * time, so a process-wide singleton accepts exactly one session per bridge
 * lifetime: after that session ends, `connect()` on the next initialize
 * throws "Already connected to a transport" and every subsequent client gets
 * a 500 — including a client reconnecting after a clean disconnect. Each
 * session gets its own instance instead; the route closes it when the
 * transport closes.
 */
export const createMcpServer = () => {
  const server = new Server(
    {
      name: 'ChromeMcpServer',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  setupTools(server);
  return server;
};
