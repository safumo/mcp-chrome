# mcp-chrome（自用 fork）

> **声明：这是 [hangwin/mcp-chrome](https://github.com/hangwin/mcp-chrome) 的自用 fork，不追求向上游合并。**
> Fork 目标：为 AI agent 提供读取特定网站 **cookies / localStorage / sessionStorage** 的能力（cookie-searcher 项目基座），并修复上游的若干连接稳定性问题。
> 上游文档见 [README_upstream.md](README_upstream.md)（原版英文 README 备份）。

## 与上游的差异

| 类别           | 改动                                                                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **新增工具**   | `chrome_get_cookies` / `chrome_get_local_storage` / `chrome_get_session_storage`（schema 在 `packages/shared`，实现在扩展 `tools/browser/storage.ts`） |
| **连接稳定性** | MCP Server 改为每会话一个实例，修复多客户端并发连接时的 `Already connected to a transport` 错误                                                        |
| **CORS**       | 新增 origin 白名单校验（`app/native-server/src/server/cors-origin.ts`），拒绝 `null`/非法 origin                                                       |
| **注册修复**   | `register` 命令现在正确读取 `CHROME_MCP_ALLOWED_EXTENSION_IDS` 环境变量（上游硬编码单个扩展 ID，导致 unpacked 扩展无法连接）                           |
| **依赖**       | better-sqlite3 升级到 ^12.1.0                                                                                                                          |
| **测试**       | native-server 15 个 jest 测试全部通过                                                                                                                  |

## 架构

```
MCP 客户端 (Claude Code / 脚本)
    │  StreamableHTTP  127.0.0.1:12306/mcp
    ▼
Bridge (app/native-server，Node 进程，随 Chrome native messaging 生命周期)
    │  native messaging (stdio, 4字节长度前缀 JSON)
    ▼
Chrome 扩展 Service Worker (app/chrome-extension)
    │  chrome.cookies / chrome.scripting
    ▼
用户浏览器数据
```

注意：bridge 进程由 Chrome 在扩展连接时拉起，扩展 Service Worker 死亡时 bridge 随之退出（扩展有自动重连）。

## 构建产物（CI/CD）

推送至 `master` 分支或手动触发（Actions → Build Self-use Artifacts → Run workflow）后，GitHub Actions 构建并**自动更新 [Release `latest`](https://github.com/safumo/mcp-chrome/releases/tag/latest)**（打 `v*` tag 则发布正式版本），同时保留 Actions artifact 30 天：

| 产物                        | 内容                               | 用途                                    |
| --------------------------- | ---------------------------------- | --------------------------------------- |
| `chrome-extension.zip`      | `wxt zip` 打包的扩展               | 解压后加载 unpacked                     |
| `native-server-dist.tar.gz` | `app/native-server/dist` 的 tar 包 | 解压后 `node dist/cli.js register` 即用 |

本地构建：

```bash
pnpm install
pnpm build:shared        # 必须先构建 shared
pnpm build:extension     # 扩展 → app/chrome-extension/.output/chrome-mv3
pnpm build:native        # bridge → app/native-server/dist
pnpm --filter mcp-chrome-bridge test   # 跑测试
```

## 安装

### 0. 新机器快速安装（无需编译）

每次 push 到 `master`，CI 会自动更新 Release [`latest`](https://github.com/safumo/mcp-chrome/releases/tag/latest)，内含改过的扩展和 bridge。

**① 安装 Chrome 扩展**：

1. 下载 Release 里的 `chrome-extension.zip` 并解压
2. `chrome://extensions/` → 开启"开发者模式" → "加载已解压的扩展程序" → 选择解压出的目录
3. 记下扩展 ID（`chrome://extensions/` 卡片上的 32 位 ID）

**② 安装 bridge**：

```bash
curl -LO https://github.com/safumo/mcp-chrome/releases/download/latest/native-server-dist.tar.gz
tar xzf native-server-dist.tar.gz        # 得到 dist/
CHROME_MCP_ALLOWED_EXTENSION_IDS=<你的扩展ID> node dist/cli.js register
```

`register` 会自动写 `node_path.txt` 和 native messaging manifest。之后打开 Chrome，扩展 autoConnect 即连上 bridge。

> 以下"从源码安装"一节供本地开发参考。

### 1. 安装 Chrome 扩展（unpacked，源码构建）

1. `pnpm build:extension`
2. 打开 `chrome://extensions/`，开启右上角"开发者模式"
3. "加载已解压的扩展程序" → 选择 `app/chrome-extension/.output/chrome-mv3`
4. 记下扩展 ID（`chrome://extensions/` 卡片上的 32 位 ID，如 `jgbbhojakcafgpmhahkhkadapjcbiknl`）

> unpacked 扩展的 ID 由路径推导且**随路径变化**；移动目录后 ID 会变，需要重新注册 bridge。

### 2. 安装并注册 bridge（源码构建）

```bash
cd app/native-server
pnpm install
CHROME_MCP_ALLOWED_EXTENSION_IDS=<你的扩展ID> pnpm register:dev
```

注册逻辑（`pnpm postinstall` 也会自动执行）：

- 写 `dist/node_path.txt`（固定 Node 路径，避免 NODE_MODULE_VERSION 不匹配）
- 写 native messaging manifest 到 `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.chromemcp.nativehost.json`
- `allowed_origins` 使用 `CHROME_MCP_ALLOWED_EXTENSION_IDS`（多个用逗号分隔）；不设置则默认只允许上游发布版扩展 ID

### 3. 验证

```bash
# bridge 进程应随扩展连接出现
ps aux | grep mcp-chrome-bridge/dist/index.js

# 端到端测试：应返回 JSON cookies
curl -s -X POST http://127.0.0.1:12306/mcp \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}'
```

日志：`~/Library/Logs/mcp-chrome-bridge/`（每次 bridge 进程启动一个文件，可用于排查断连）。

## 使用

### Claude Code 配置

```json
{
  "mcpServers": {
    "chrome": {
      "type": "http",
      "url": "http://127.0.0.1:12306/mcp"
    }
  }
}
```

### 常用工具示例

| 工具                         | 参数  | 说明                                 |
| ---------------------------- | ----- | ------------------------------------ |
| `chrome_get_cookies`         | `url` | 读指定网站全部 cookie（含 HttpOnly） |
| `chrome_get_local_storage`   | `url` | 读 localStorage 全部键值             |
| `chrome_get_session_storage` | `url` | 读 sessionStorage 全部键值           |

`url` 支持完整 URL 或裸域名（自动补 `https://`）。

### 常驻说明

- 扩展默认开启 autoConnect，后台通过 offscreen document + 20 秒心跳保活 Service Worker，实测纯后台可常驻 16 小时+
- 打开 popup 等界面时反而可能频繁断连（界面消息干扰 keepalive），断开后会自动重连，属预期行为
- Chrome 重启后扩展会自动重连 bridge

## 安全提示

- 这套工具等于**让任何能访问 127.0.0.1:12306 的本地进程操作用户整个浏览器**（cookie 等于登录态，泄露即账号失窃）
- bridge 目前除 CORS origin 校验外**无鉴权**，不要在多用户机器上使用，不要暴露到非 localhost
- 计划中的护栏（域名白名单、审批、审计日志）尚未实现，见 [cookie-searcher](../cookie-searcher)
