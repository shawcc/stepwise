# PRD：Stepwise 最小工作闭环

## 1. 文档状态

- 版本：v0.8
- 日期：2026-09-16
- 状态：原型验证
- 核心概念：[CORE_CONCEPTS.md](CORE_CONCEPTS.md)
- 旧版需求：[archive/PRD.v0.2-legacy.md](archive/PRD.v0.2-legacy.md)

## 2. 产品目标

验证团队能否以 Human DRI 对 Goal 负责、Stepwise Official Reasoning Agent 提出结构、用户自带 Execution Agent 在授权范围内执行 Action 的方式，直接围绕共同目标运行。

唯一主流程：

```text
Map 查看 Goal 层级与依赖
→ 进入 Goal Detail
→ 组合 Goal 继续拆解，叶子 Goal 创建 Action
→ 进入 Action Detail 执行并回填 Outcome / Evidence
→ Human DRI 接受、重做或调整 Goal / Relation
```

任何 Goal、Action 和 Relation 都必须可追溯；Agent 不得在回填执行结果的同时自行完成最终验收。

## 3. 非目标

- 不在本期实现完整项目管理系统。
- 不把 IM、通知或普通聊天做成正式工作事实源。
- 不把 Evidence、Decision、Actor 或版本做成新的工作节点。
- 不让组合 Goal 同时拥有下级 Goal 和直接 Action。
- 不让 Agent 绕过授权创建或接受高风险 Action。
- 不承诺生产级权限、多人协同、持久化和 Agent 调度。

## 4. 核心模型

产品只有两类工作节点：

| 节点 | 定义 | 是否递归 |
|---|---|---|
| Goal | 希望发生的变化；保存成功标准、DRI、约束和授权边界 | 是 |
| Action | 对叶子 Goal 的一次真实执行；保存输入、执行者、Outcome、Evidence 和 Decision | 否 |

Goal 分为两种互斥状态：

- 组合 Goal：拥有下级 Goal，不直接创建 Action。
- 叶子 Goal：没有下级 Goal，可以创建一次或多次 Action。

失败、重试和替代方案都创建新的 Action，不覆盖历史执行。

### 4.1 Relation

Relation 是节点之间带推演记录的连接，不是第三类工作节点：

| 关系 | 方向 | 含义 |
|---|---|---|
| `decomposes` | Goal → Goal | 上级 Goal 拆解出下级 Goal |
| `executes` | Goal → Action | 叶子 Goal 通过一次 Action 执行 |
| `goal-dependency` | Goal → Goal | 前置 Goal 完成后，后续 Goal 才能推进 |
| `action-dependency` | Action → Action | 前置 Action 的结果是后续 Action 的条件 |

每条 Relation 保存理由、假设、提出者、确认状态、创建时间和历史推演。依赖统一使用“前置 → 后续”方向，不重复存储反向 `blocks`。

### 4.2 Decomposition Review

组合 Goal 必须有一份整组拆解的推演记录。它不是工作节点，而是父 Goal 的治理记录，至少保存：

- 当前下级 Goal 集合。
- 为什么是当前数量。
- 覆盖上级成功标准的论证。
- 子 Goal 之间的边界规则。
- 被合并、拒绝或暂缓的候选 Goal。
- 会触发重新拆解的开放问题。
- 提案、分析和 Human DRI Decision 历史。

单条 `decomposes` Relation 解释某一个子 Goal 为什么存在；Decomposition Review 解释整组拆解为什么完整且不过度。

### 4.3 属性与角色

成功标准、Outcome、Evidence、Decision、Actor、权限、时间和版本是 Goal、Action 或 Relation 的属性和事件，不在 Map 中作为独立工作节点。

| 角色 | 责任 |
|---|---|
| Human DRI | 对 Goal 的成功标准、授权边界和最终验收负责 |
| Official Reasoning Agent | Stepwise 提供的统一、可版本化推理身份；只生成 Proposal，不执行或验收 |
| Execution Agent | 用户自带并接入 MCP / API / Skill，在授权范围内执行 Action 和回填 Evidence |
| External Advisor | 提供专业判断的外部 Actor，不成为工作节点 |

## 5. 信息架构

原型只有四个核心工作表面：

```text
整体结构：Map
节点事实：Goal Detail / Action Detail
拆解依据：Decomposition Deliberation
连接依据：Relation Deliberation
```

- 三者必须互相可达，但不能混在同一信息层级。
- 依赖、Evidence、监控和时间线是同一事实模型的派生视图，不形成新数据源。
- 关注、决策待办和知识库属于未来的注意力与检索入口，不进入当前核心导航。

## 6. 页面需求

### 6.1 Map｜工作图谱

目的：让用户在一张图中理解权限范围内所有 Goal、Action、上下级和依赖关系。

必须：

- Goal 和 Action 使用不同节点样式。
- 同时展示 `decomposes`、`executes`、`goal-dependency` 和 `action-dependency`。
- 每种连接使用明确图例；箭头方向统一表示“来源或前置 → 目标或后续”。
- 点击 Goal 或 Action 进入对应详情。
- 每个组合 Goal 的分叉点提供“为什么是这些 Goal”的拆解方案入口。
- 点击连接标签打开对应 Relation Deliberation。
- 支持隐藏 Action，仅查看 Goal 层级与 Goal 依赖。
- 无权限节点不展示敏感内容。
- 桌面与移动端均不得出现页面级横向溢出。

当前边界：

- 原型允许固定坐标布局。
- 节点规模扩大前需要引入自动布局和视口导航。

### 6.2 Goal Detail｜目标详情

目的：查看一个 Goal 的完整定义、拆解、依赖、执行和验收状态。

必须：

- 展示标题、意图、Human DRI、状态、成功标准、约束和授权边界。
- 明确标识组合 Goal 或叶子 Goal。
- 组合 Goal 展示下级 Goal、拆解方案推演入口，并明确本层不能直接创建 Action。
- 叶子 Goal 展示历史 Action，并允许创建新的 Action。
- 展示所有进入和离开当前 Goal 的 Relation。
- 点击关联节点或 Relation 可继续导航。

### 6.3 Action Detail｜行动详情

目的：让一次实际执行可观察、可追溯、可验收。

必须：

- 展示所属叶子 Goal。
- 展示 Execution Agent、授权 DRI、授权边界和风险等级。
- 展示输入、预期输出、状态和时间。
- 展示实际 Outcome、结构化 Evidence 和错误。
- 展示进入和离开当前 Action 的依赖 Relation。
- 提供 Human DRI 的接受和要求重做操作。

执行规则：

- Action 只有在获得所需授权后才能执行。
- 回填 Outcome 后进入待验收状态。
- Human DRI 的独立 Decision 才能将 Action 标记为 accepted 或 redo。
- 不得把未调用的网页、文件、API 或现实操作写成已完成事实。

### 6.4 Decomposition Deliberation｜拆解方案推演

目的：严谨审查一个父 Goal 为什么拆成当前这一组下级 Goal。

必须展示：

- 父 Goal 与当前全部下级 Goal。
- 拆解逻辑和完整性论证。
- 子 Goal 的边界规则。
- 被合并、拒绝或暂缓的候选方案及理由。
- 尚需复查的问题。
- AI 分析、修改提案和 Human DRI Decision 的历史事件。

必须操作：

- 用户可以补充遗漏候选、边界冲突和反例。
- 用户可以进入任一下级 Goal 继续检查。
- 方案变化时必须保留旧版本，并重新检查相关 `decomposes` Relation。

### 6.5 Relation Deliberation｜连接推演

目的：解释每个上下级、执行归属或依赖关系为什么存在。

必须展示：

- 来源节点、目标节点、关系类型和方向。
- 关系成立的理由与假设。
- 提出者、确认状态和创建时间。
- AI 分析、修改提案和 Human DRI Decision 的历史事件。

必须操作：

- 用户可以追加依据、反例或修改建议。
- 待确认 Relation 可以由 Human DRI 确认或拒绝。
- Relation 改变时保留旧版本，并标记可能受影响的后续 Goal 和 Action。

当前 Web 与 MCP 通过 `/api/workspace` 和共享 store 读写同一份 Goal、Action、Relation 与 Decomposition Review。浏览器 v2 快照只在服务端 revision 为 `0` 时参与一次迁移，之后仅作为故障兜底缓存；生产实现仍必须迁移到带身份、权限和并发控制的持久数据库。

## 7. Agent 协作协议

### 7.1 Planning 请求

```yaml
goal:
  id: string
  title: string
  intent: string
  dri: string
  successCriteria: string[]
  constraints: string[]
  autonomy: string
  childGoalIds: string[]
incomingRelations: Relation[]
outgoingRelations: Relation[]
userRequest: string
```

返回结果：

```yaml
proposal:
  kind: child-goal | relation | action
  payload: object
rationale: string
assumptions: string[]
questions: string[]
provider: string
```

组合 Goal 只能提出下级 Goal 或 Goal Relation；叶子 Goal 才能提出 Action。前端不得把提案直接写入确认事实。

Official Reasoning Agent 的能力承诺是方法、结构、版本、审计和复查一致，而不是保证结论必然正确。每个 Proposal 必须记录 Agent 版本、目标上下文、假设和生成时间；只有对应 Goal 的 Human DRI 可以确认写入。

### 7.2 Execution 回填

```yaml
action:
  id: string
  goalId: string
  authorization: string
  input: string
  expectedOutput: string
outcome: string
evidence:
  - label: string
    detail: string
    kind: source | claim | artifact
    source: string | null
```

回填只把 Action 推进到待验收；接受或重做必须由独立 DRI Decision 完成。

## 8. 状态模型

### Goal

- `draft`
- `active`
- `blocked`
- `review`
- `accepted`

### Action

- `ready`
- `running`
- `review`
- `accepted`
- `redo`
- `failed`

### Relation

- `proposed`
- `confirmed`
- `rejected`（后续持久化模型）

### Decomposition Review

- `proposed`
- `confirmed`

### Relation 事件

- `comment`：人类输入、依据或反例。
- `agent-analysis`：Agent 提供的可审查分析摘要。
- `proposal`：结构化修改建议。
- `decision`：确认、拒绝或要求调整。
- `system`：版本生成和影响标记。

## 9. 数据与治理

所有正式工作事实最终需要包含：

- 责任主体。
- 来源。
- 权限。
- 时间。
- 版本。
- 状态。

生产实现需要：

- 服务端数据库。
- 用户身份和组织权限。
- 多人并发与冲突处理。
- Goal、Action、Relation 和 Version API。
- Agent 工具权限和审计。
- Relation 修改后的影响传播。

### MCP 协作接口

当前原型提供符合 MCP `2025-11-25` 的无会话 Streamable HTTP 端点 `/api/mcp`，让 Alexa+ 或其他兼容 Agent：

- 读取 Goal、成功标准、Human DRI 和授权边界。
- 查询 Action 及其授权、执行和验收状态。
- 在叶子 Goal 下创建 proposed 或 authorized Action。
- 为已授权 Action 回填 Outcome 与结构化 Evidence。
- 在 Human DRI 已明确决策后记录 accepted 或 redo。
- 读取 Official Reasoning Agent 的 Goal 拆解 Proposal。
- 在身份与写凭证校验通过后，由 Human DRI 确认 Proposal 并创建正式下级 Goal。

写工具必须提供服务端写入凭证，并记录 `approvedBy` 或 `decidedBy`。服务端必须拒绝在组合 Goal 下创建 Action。回填 Outcome 只会进入 `review-required`，Agent 不得在同一步中自行接受结果。

当前 MCP 与 Web 共用同一个进程内赛事 store，并已验证两侧写入可互相读取。Serverless 冷启动、实例切换和扩缩容仍可能恢复各自的演示数据，不能作为正式多用户事实源。Relation MCP 工具尚未实现。

## 10. 验收标准

### Map 与导航

1. Map 同时显示 Goal 层级、Goal 依赖、Goal 到 Action 和 Action 依赖。
2. 四种 Relation 有可区分的图例、线型和方向。
3. 点击任意 Goal 或 Action 进入正确详情。
4. 点击任意连接标签打开正确 Relation Deliberation。
5. 隐藏 Action 后，Goal 层级和 Goal 依赖仍然完整可见。

### Goal 与 Action

1. 组合 Goal 显示下级 Goal，且没有创建或执行 Action 的入口。
2. 叶子 Goal 显示历史 Action 和创建 Action 的入口。
3. Action Detail 显示授权、风险、输入、预期输出、Outcome 和 Evidence。
4. Action 执行完成后进入待验收，而非自动 accepted。
5. Human DRI 可以接受或要求重做，Decision 保留在 Action 历史中。
6. 失败、重试或替代方案创建新 Action，不覆盖旧 Action。

### Relation

1. 每条 Relation 都显示来源、目标、类型、理由、假设和确认状态。
2. 用户可以追加依据、反例或修改建议。
3. Goal 与 Action 详情均能列出进入和离开的 Relation。
4. 依赖只保存“前置 → 后续”，不存在重复反向事实。

### 拆解方案

1. 每个组合 Goal 都能打开整组拆解推演。
2. 推演能回答为什么是当前数量，而不是更多或更少。
3. 推演同时展示完整性、边界规则和未单列候选。
4. 用户可以追加遗漏候选、冲突或反例。
5. 单条 Relation 推演与整组拆解推演互相独立且都可追溯。

### MCP

1. 客户端可以初始化、发现工具并读取 Goal。
2. 未提供有效凭证时，写工具拒绝请求且不改变状态。
3. 服务端拒绝对组合 Goal 创建 Action。
4. 叶子 Goal 可以创建 Action。
5. 回填结果后 Action 进入待验收。
6. 只有独立 DRI Decision 才能接受或要求重做。

### Actor、时间与 Proposal

1. 每个 Goal 都显示唯一 Human DRI、开始时间、Deadline 和时区。
2. Official Reasoning Agent 具有稳定身份与版本，和用户自带 Execution Agent 明确区分。
3. 待确认的拆解只显示为 Proposal，不进入正式 Goal Map。
4. 非对应 Goal 的 Human DRI 无法确认拆解 Proposal。
5. Human DRI 确认后，候选 Goal 及其 Relation 一次性写入正式事实。
6. 已有 Action 的叶子 Goal 不得同时确认下级 Goal，以保持组合 Goal / 叶子 Goal 互斥。

### 服务端事实源与浏览器兼容

1. Web 与 MCP 必须读写同一个服务端 Goal、Action、Relation 和 Decomposition Review store。
2. Human DRI 通过 Web 确认拆解后，MCP 必须立即能读取正式子 Goal；MCP 创建 Action 后，Web API 快照必须立即可见。
3. v1 字符串型 `executor` 与 `approvedBy` 自动迁移为 Actor；已知 Actor 恢复稳定 ID。
4. 无法识别的用户自带 Agent 保留原名称，并生成可追溯的迁移 Actor。
5. v2 快照写入成功后删除旧版 Action-only key。
6. 浏览器 v2 快照只能在服务端 revision 为 `0` 时导入；服务端已有变更时不得被旧快照覆盖。
7. 当前进程内 store 不宣称跨冷启动、跨实例、跨用户或生产级持久化。

### 技术检查

```bash
npm run lint
npm run check
npm run test:mcp
npm run build
```

## 11. 后续优先级

1. 将进程内统一 store 替换为持久数据库，并增加身份、权限、多人并发与版本冲突处理。
2. 为 MCP 增加通用 Relation 查询、提案和确认工具。
3. 为 `/api/workspace` 增加基于用户身份和 Goal scope 的授权。
4. 为 Map 引入自动布局、缩放和大规模图谱导航。
5. 接入 Alexa+ 模拟体验和一个真实外部执行工具。
6. 增加身份、权限、多人协作和影响传播。
