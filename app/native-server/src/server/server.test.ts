import { describe, expect, test, afterAll, beforeAll } from '@jest/globals';
import supertest from 'supertest';
import Server from './index';

describe('服务器测试', () => {
  // 启动服务器测试实例
  beforeAll(async () => {
    await Server.getInstance().ready();
  });

  // 关闭服务器
  afterAll(async () => {
    await Server.stop();
  });

  test('GET /ping 应返回正确响应', async () => {
    const response = await supertest(Server.getInstance().server)
      .get('/ping')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toEqual({
      status: 'ok',
      message: 'pong',
    });
  });

  test('sequential MCP sessions can each initialize (per-session server)', async () => {
    const initBody = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      },
    };

    for (let i = 0; i < 2; i++) {
      const res = await supertest(Server.getInstance().server)
        .post('/mcp')
        .set('Accept', 'application/json, text/event-stream')
        .send(initBody)
        .expect(200);
      expect(res.headers['mcp-session-id']).toBeTruthy();

      // The SDK transport answers the DELETE itself (200); either way the
      // session must be closed so the next initialize gets a fresh server.
      await supertest(Server.getInstance().server)
        .delete('/mcp')
        .set('mcp-session-id', res.headers['mcp-session-id'])
        .expect((r) => {
          expect(r.status).toBeGreaterThanOrEqual(200);
          expect(r.status).toBeLessThan(300);
        });
    }
  });
});
