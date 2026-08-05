# WorkGraph

WorkGraph 是一个以递归 Goal、结构化推理和人机治理为核心的 Agent 原生工作平台原型。

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

打开 `http://localhost:5173/`，进入任意 Goal 的画布：

1. 选择“目标、成立条件、路线、执行、验收”中的一个阶段。
2. 在右侧输入希望 Agent 如何调整。
3. Agent 读取当前 Goal、父子关系、方法和草稿，返回结构化修改提案。
4. 点击“采用提案并预览草稿”。
5. 人工检查后点击“确认并写入图谱”。

草稿、方法选择、确认状态和版本记录暂存在当前浏览器的 `localStorage`。这是最小闭环，不支持跨浏览器、跨用户或服务端恢复。

## Vercel

项目包含 `api/agent.ts`。在 Vercel Project Settings 中配置：

- `WORKGRAPH_AI_API_KEY`
- `WORKGRAPH_AI_BASE_URL`
- `WORKGRAPH_AI_MODEL`

部署后前端仍调用同源 `/api/agent`，模型密钥不会发送到浏览器。

## 当前边界

- Agent 只能提交草稿提案，不能绕过人工确认直接修改图谱。
- 当前持久化是浏览器本地存储，不是正式数据库。
- 当前 Goal 基础数据仍定义在前端代码中。
- 下一步应把 Goal、阶段草稿和版本记录迁移到带身份与权限控制的服务端存储。

## 验证

```bash
npm run lint
npm run check
npm run build
```
