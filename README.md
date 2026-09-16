# Stepwise

Stepwise 是一个让 Human DRI 与 Agent 围绕 Goal 逐层拆解、按授权边界执行 Action，并用 Evidence 验收结果的组织运行系统。WorkGraph 是它的底层工作模型，不再作为产品名称。

Stepwise 不以“所有工作都需要强推理”为前提。有人类 DRI 时，目标澄清、条件判断和关键取舍可以由 DRI 直接完成，Agent 负责生成、执行、检查或补证；只有在更高自治场景中，Agent 的规划与推理能力才成为主要约束。

每个 Goal 只有一个 Human DRI，对目标、授权边界与最终结果负责；Planning Agent 帮助拆解 Goal 和发现依赖，Execution Agent 在授权范围内执行 Action 并回填结果与证据。

产品核心概念见 [docs/CORE_CONCEPTS.md](docs/CORE_CONCEPTS.md)。

```text
Goal -> 下级 Goal -> Action -> Evidence -> DRI Decision
```

工作节点只有 `Goal` 和 `Action`。上下级、执行归属和依赖使用带推演记录的 `Relation` 连接。有下级 Goal 的组合 Goal 不直接创建 Action；没有下级 Goal 的叶子 Goal 才能执行。

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

Action 执行可以使用任意 OpenAI-compatible 模型：

```bash
WORKGRAPH_AI_API_KEY=your-key
WORKGRAPH_AI_BASE_URL=https://api.openai.com/v1
WORKGRAPH_AI_MODEL=gpt-4.1-mini
```

MCP 读取工具默认开放。要启用 Action、Outcome 和 DRI Decision 写入工具，还需配置：

```bash
STEPWISE_MCP_WRITE_TOKEN=replace-with-a-long-random-value
```

密钥只能使用服务端环境变量，不能使用 `VITE_` 前缀，否则会被打包到浏览器。

打开 `http://localhost:5173/`：

1. 在 Map 同时查看 Goal 上下级、Goal 依赖和 Action 依赖。
2. 点击 Goal 或 Action 进入各自详情页。
3. 点击任意连接标签查看关系理由、假设和历史推演。
4. 在叶子 Goal 下执行 Action，并由 Human DRI 验收 Evidence。

Goal、Action、Relation、Decomposition Review、Evidence 和 Decision 统一读写同源 `/api/workspace`，并与 MCP 共享同一个服务端 store。浏览器 `localStorage` v2 只用于首次迁移旧数据和服务不可用时的只读兜底缓存，不再是权威事实源。

## Vercel

项目包含 `api/workspace.ts`、`api/agent.ts`、`api/run.ts` 和符合 MCP `2025-11-25` 的 `api/mcp.ts`。在 Vercel Project Settings 中配置：

- `WORKGRAPH_AI_API_KEY`
- `WORKGRAPH_AI_BASE_URL`
- `WORKGRAPH_AI_MODEL`
- `STEPWISE_MCP_WRITE_TOKEN`
- `STEPWISE_MCP_ALLOWED_ORIGINS`，可选，多个可信浏览器 Origin 用逗号分隔
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`，使用服务端 Secret Key，不要使用 publishable/anon key
- `STEPWISE_WORKSPACE_ID`，可选，默认 `default`

部署后前端通过同源 `/api/workspace` 读写工作事实，并调用 `/api/agent` 和 `/api/run`；模型密钥不会发送到浏览器。Alexa+ 或其他 MCP 客户端通过 `https://<your-domain>/api/mcp` 访问同一份工作事实。

Supabase 表结构位于
`supabase/migrations/202609160001_create_stepwise_workspaces.sql`。服务端将完整
Workspace 保存为单行 JSONB 快照，并用 `revision` 条件更新避免并发写覆盖。

## Stepwise MCP

MCP 使用无会话 Streamable HTTP，只接受 `POST`。当前提供：

- `stepwise_get_goal`：读取 Goal、成功标准、DRI 和授权边界。
- `stepwise_list_actions`：按状态查看 Action 和授权信息。
- `stepwise_create_action`：在叶子 Goal 上创建 Action；组合 Goal 会被拒绝。
- `stepwise_record_action_result`：为已授权 Action 回填 Outcome 与 Evidence，状态只进入待验收。
- `stepwise_decide_action`：在 Human DRI 已明确决策后记录接受或重做。
- `stepwise_get_decomposition_proposal`：读取官方 Reasoning Agent 的拆解 Proposal。
- `stepwise_confirm_decomposition`：由对应 Goal 的 Human DRI 确认 Proposal 并创建正式下级 Goal。

写工具要求 `write_token` 与服务端的 `STEPWISE_MCP_WRITE_TOKEN` 一致。该机制用于赛事原型，生产环境应替换为带用户身份、Goal 权限和细粒度 scope 的 OAuth 2.1。

## 当前边界

- 配置 Supabase 后，Web 与 MCP 统一使用持久化 Workspace 快照；未配置时，本地开发仍回退到进程内 store。
- 当前以单行 JSONB 保存一个逻辑 Workspace，适合赛事原型；正式多人协作需要按租户拆分、身份鉴权和更细粒度的审计表。
- 当前执行 Agent 可以完成有边界的知识工作并回填模型产物，但尚不能调用浏览器、代码仓库或第三方业务工具。
- 浏览器 v2 快照兼容迁移旧版 Action 数据；仅当服务端 revision 为 `0` 时可导入，已有服务端变更不会被旧快照覆盖。
- 下一步应增加身份、Goal 级权限和审计日志，再接入真实外部执行工具。

## 验证

```bash
npm run test:mcp
npm run test:workspace
npm run lint
npm run check
npm run build
```
