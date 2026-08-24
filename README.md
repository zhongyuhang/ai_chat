# 本地 AI 小说工作台

这是一个只在本机运行、当前只接入 DeepSeek 文本模型的 AI 长篇写作项目。新版默认界面提供“小说工坊 + 角色剧场”双工作区，并以百万字小说的连续性为验收目标。

## 本地启动

需要 Node.js 24 或兼容版本。

```powershell
npm install
Copy-Item .env.example .env
```

编辑 `.env`，至少设置：

```dotenv
DEEPSEEK_API_KEY=你的密钥
```

首次运行先构建，再启动：

```powershell
npm run build
npm start
```

浏览器打开 `http://127.0.0.1:3000`。服务默认只监听回环地址，不会向局域网公开；如无明确需要，请不要修改 `HOST=127.0.0.1`。

可配置项：

- `DEEPSEEK_API_URL`：DeepSeek 兼容接口地址。
- `PORT`：本机端口，默认 `3000`。
- `DEFAULT_SYSTEM_PROMPT_FILE`：默认创作提示词文件，必须位于项目目录内。
- `UPSTREAM_TIMEOUT_MS`：等待 DeepSeek 建立响应的超时，默认 `120000` 毫秒。

## 数据与备份

新版项目、Markdown 正文、不可变修订、设定库、剧场分支和生成检查点保存在仓库下的 `studio-data` 目录；浏览器 IndexedDB 只承担未保存草稿的崩溃恢复。正式稿不会因摘要或上下文预算而被删除或截断。

## 质量门禁

```powershell
npm run check
npm run test:security
npm test
npm audit --omit=dev
```

安全门禁覆盖本地文件泄漏、跨站调用、Markdown XSS、DeepSeek 超时与取消，以及超长正文/大量消息的逐字持久化。浏览器回归通过真实 HTTP 服务执行，不使用会掩盖 CSP 和路由问题的 `file://` 页面。

设计与实施计划位于 `docs/superpowers/specs` 和 `docs/superpowers/plans`。

## 开发新版 Studio

开发时运行：

```powershell
npm run studio:dev
```

打开 `http://127.0.0.1:5173`。Vite 只代理本机 Fastify 服务；本机环境中 `3100` 属于 Windows 排除端口段，因此 Studio API 默认使用 `127.0.0.1:3411`。可通过 `STUDIO_HOST`、`STUDIO_PORT` 和 `STUDIO_DATA_ROOT` 调整本地监听与作品目录。

Studio 门禁：

```powershell
npm run studio:check
npm run studio:test
npm run studio:build
npm --prefix studio run test:e2e
```

完整发布前验证：

```powershell
npm run verify
npm audit --omit=dev
npm --prefix studio audit --omit=dev
```

本地数据、快照、手动恢复与迁移说明见 [`docs/operations/local-data-and-recovery.md`](docs/operations/local-data-and-recovery.md)。

当前 Studio 已提供磁盘项目中心、原子 Markdown 章节修订、旧版迁移、完整设定与全书规划、严格上下文预算、可解释世界书命中、版本化提示词、DeepSeek 候选生成、角色剧场分支、固定记忆和场景卡转换。旧页面仍可用 `npm run legacy:start` 启动。
