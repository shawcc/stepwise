# WorkGraph

WorkGraph 是一个以共同目标为入口、供人和 Agent 一起工作的递归目标执行系统。

产品核心概念见 [docs/CORE_CONCEPTS.md](docs/CORE_CONCEPTS.md)。

```text
工作图谱 -> 目标工作台 -> 过程推演 -> 确认回写
```

## 本地运行

```bash
npm install
cp .env.example .env.local
npm run dev
```

在 `.env.local` 中配置一个 OpenAI-compatible 模型：

```bash
WORKGRAPH_AI_API_KEY=your-key
WORKGRAPH_AI_BASE_URL=https://api.openai.com/v1
WORKGRAPH_AI_MODEL=gpt-4.1-mini
```

密钥只能使用 `WORKGRAPH_` 前缀，不能使用 `VITE_` 前缀，否则会被打包到浏览器。

打开 `http://localhost:5173/`：

1. 在工作图谱中逐层找到一个 Objective。
2. 进入目标工作台，查看当前已确认的目标文档。
3. 从章节或具体结论打开“过程推演”。
4. 让 Agent 读取当前 Objective、上下游、专业方法和草稿，返回结构化修改提案。
5. 采用或编辑提案，人工确认后写入目标文档并生成版本。

草稿、过程事件、方法选择、确认状态和版本记录暂存在当前浏览器的 `localStorage`。这是最小闭环，不支持跨浏览器、跨用户或服务端恢复。

## Vercel

项目包含 `api/agent.ts`。在 Vercel Project Settings 中配置：

- `WORKGRAPH_AI_API_KEY`
- `WORKGRAPH_AI_BASE_URL`
- `WORKGRAPH_AI_MODEL`

部署后前端仍调用同源 `/api/agent`，模型密钥不会发送到浏览器。

## 当前边界

- Agent 只能提交草稿提案，不能绕过人工确认直接修改图谱。
- 当前持久化是浏览器本地存储，不是正式数据库。
- 当前 Objective 基础数据仍定义在前端代码中。
- 下一步应把 Objective、过程事件和版本记录迁移到带身份与权限控制的服务端存储。

## 验证

```bash
npm run lint
npm run check
npm run build
```
