# MRD：Stepwise

## 1. 产品定义

Stepwise 是让 Human DRI 与 Agent 围绕共同 Goal，在明确授权下执行 Action，并用 Evidence 完成验收的组织运行系统。

WorkGraph 是内部关系模型，负责连接 Goal、Action 以及它们之间可追溯的 Relation；用户通过 Map 看整体结构，通过详情页工作，通过连接推演审查每一次拆解和依赖为何成立。

```text
整体结构：Map
目标定义：Goal Detail
真实执行：Action Detail
关系依据：Relation Deliberation
```

核心概念以 [CORE_CONCEPTS.md](CORE_CONCEPTS.md) 为准。

## 2. 立项判断

当前主流产品仍以“每个人配一个 Agent 助理”为中心。Stepwise 验证一个更长期的判断：未来组织可能由少量人治理大量 Agent，人类主要负责目标、授权、价值判断和高风险决策，Agent 负责读取上下游、提出方案、执行和检查。

这不意味着有人类 DRI 的协作必须依赖强推理 Agent。DRI 可以直接承担目标澄清和关键取舍；Agent 的规划能力主要决定系统能够获得多高的自治程度。

当 Agent 数量和工作密度上升，聊天、文档和任务列表会暴露三个问题：

- Goal、Action、判断和 Evidence 分散，参与者无法稳定共享上下文。
- 上下级与平级依赖缺少明确方向，难以理解工作为何存在、应该按什么顺序推进。
- 讨论过程与确认事实混杂，下游失败难以回流到有问题的 Goal、Action 或 Relation。

Stepwise 的机会不是制造一个更会聊天的 AI，而是建立人和 Agent 共同工作的事实层和控制回路。这仍是产品假设，需要通过真实工作验证，不作为已被市场证明的事实。

## 3. 目标用户

### 核心用户

- Human DRI：对 Goal 的成功标准、授权边界和最终验收负责。
- Official Reasoning Agent：由 Stepwise 提供的统一、可版本化推理身份，读取上下游并提出 Goal 拆解、依赖关系和 Action 建议。
- Execution Agent：由用户自带，在授权范围内执行 Action，回填 Outcome、Evidence 和异常。
- External Advisor：在 DRI 邀请下处理专业判断、例外和高风险决策。

### 首个验证场景

首个外部验证场景是 Amazon Developer Hackathon 的 Alexa+ 赛道：让外部 Agent 通过标准 MCP 接口参与 Stepwise 中的 Goal 读取、Action 创建、结果回填和 DRI 验收。

这类工作同时需要：

- 在一张 Map 中看见整体 Goal 层级和平级依赖。
- 解释每个下级 Goal、Action 和依赖连接为什么存在。
- 让 Goal 与 Action 各自拥有可工作的详情页。
- 保留人和 Agent 共同形成 Relation 的推演过程。
- 用 Evidence 检验 Action 结果，并在失败时保留历史、创建新 Action。

## 4. 用户问题

- 我们共同负责的 Goal 是什么，怎样才算成功？
- 当前 Goal 是需要继续拆解的组合 Goal，还是可以执行的叶子 Goal？
- 某个下级 Goal 为什么存在，服务哪个上级 Goal？
- 哪些 Goal 或 Action 必须先完成，依赖方向是什么？
- Agent 被授权执行什么，哪些事项必须升级给 DRI？
- Action 实际产生了什么 Outcome，Evidence 是否足以支持接受？
- 如果拆解或依赖判断有误，应从哪条 Relation 重新推演，哪些后续节点受影响？

## 5. 产品主张

### 5.1 只有 Goal 和 Action 两类工作节点

- Goal 表达希望发生的变化，可以递归拆成下级 Goal。
- Action 表达针对叶子 Goal 的一次真实执行，不再继续递归。
- 成功标准、Outcome、Evidence、Decision、角色、权限、时间和版本都是属性或事件，不成为 Map 上的新工作节点。
- Goal 保存开始时间、Deadline 和时区；时间用于协调与升级，不替代成功标准。

### 5.2 组合 Goal 与叶子 Goal 互斥

- 有下级 Goal 的组合 Goal 不直接创建 Action。
- 没有下级 Goal 的叶子 Goal 才可以创建 Action。
- 失败、重试和替代方案创建新的 Action，不覆盖历史。

这条规则消除“上级执行与下级目标代表同一件事”的歧义。

### 5.3 Relation 让结构本身可审查

系统只需要四类 Relation：

| 关系 | 方向 | 含义 |
|---|---|---|
| `decomposes` | Goal → Goal | 上级 Goal 拆出下级 Goal |
| `executes` | Goal → Action | 叶子 Goal 通过一次 Action 执行 |
| `goal-dependency` | Goal → Goal | 前置 Goal 指向后续 Goal |
| `action-dependency` | Action → Action | 前置 Action 指向后续 Action |

每条 Relation 保存理由、假设、提出者、确认状态和推演历史。依赖只保存“前置 → 后续”这一份事实，不额外保存反向 `blocks`。

组合 Goal 还必须保存整组拆解的 Decomposition Review。它回答为什么是当前数量、是否完整、边界是否重复，以及哪些候选 Goal 被合并或拒绝；单条 Relation 则回答某一个子 Goal 为什么存在。

### 5.4 Map、Detail 和推演界面各司其职

- Map 回答整体结构、层级和依赖。
- Goal Detail 回答目标定义、拆解、约束和验收。
- Action Detail 回答授权、执行、Outcome、Evidence 和 Decision。
- Decomposition Deliberation 回答整组下级 Goal 为什么完整且不过度。
- Relation Deliberation 回答一条连接为什么成立、经历过哪些异议和修改。

### 5.5 Human DRI 负责结果，Agent 在授权内运行

```text
Human DRI 定义 Goal 与授权边界
→ Official Reasoning Agent 提出拆解、依赖或 Action Proposal
→ DRI 确认后写入正式事实
→ Execution Agent 执行 Action
→ 回填 Outcome 与 Evidence
→ DRI 接受、要求重做或调整 Goal / Relation
```

低风险、可逆工作可由 Agent 自主推进；高风险、不可逆、价值取舍和最终验收由 Human DRI 处理。Action 不能自行接受自己的结果。

Official Reasoning Agent 不执行 Action，也不修改正式事实。Stepwise 保证其推演方法、结构、版本和审计一致，不保证每个结论必然正确。

## 6. 产品边界

### 本期验证

- 在同一张 Map 中展示 Goal 层级、Goal 依赖、Goal 到 Action 和 Action 依赖。
- 点击任意 Goal 或 Action 进入对应详情。
- 点击任意连接进入 Relation Deliberation。
- 组合 Goal 不允许直接创建 Action。
- 叶子 Goal 可以创建和保留多次 Action。
- Execution Agent 回填 Outcome 与 Evidence 后，由 DRI 独立验收。
- 通过 MCP `2025-11-25` 向外部 Agent 暴露受治理的 Goal 与 Action 工具。

### 当前不承诺

- 生产级数据库、身份、权限和多人并发。
- Map 自动布局和大规模图谱性能。
- Relation 推演的服务端持久化和自动影响传播。
- 自动执行真实业务系统。
- 生产级多 Agent 调度。
- 无人工确认的最终验收。

## 7. 成功判断

原型阶段不编造增长或效率百分比，先观察以下事实：

- 用户能否说清 Goal 与 Action 的区别。
- 用户能否从 Map 理解上下级和平级依赖。
- 用户能否识别组合 Goal 不能直接执行、叶子 Goal 才能创建 Action。
- 用户能否进入任意 Goal、Action 和连接的详情。
- 用户能否从 Relation Deliberation 解释一条连接为何存在。
- Action 的 Outcome、Evidence 和 DRI Decision 是否可追溯。
- MCP 是否拒绝未授权写入和对组合 Goal 创建 Action。

## 8. 核心风险

- Map 同时承载层级和依赖后，连线与标签可能造成视觉噪声。
- 静态布局难以支撑节点规模增长。
- Relation 推演退化为聊天流水，不能解释连接变化。
- 前端、本地存储和 MCP 原型存储成为多个事实源。
- Agent 生成内容缺少来源、Evidence 或确认门。
- Goal 与 Action 的互斥规则只存在于界面而未被服务端强制执行。

## 9. 产品原则

1. Goal 和 Action 是仅有的工作节点。
2. 组合 Goal 负责拆解，叶子 Goal 负责通过 Action 执行。
3. 依赖方向统一为前置节点指向后续节点。
4. 每条 Relation 都必须能够解释和重新推演。
5. Map 看整体，Detail 做工作，Relation Deliberation 审查连接依据。
6. 每个 Goal 只有一个 Human DRI；Agent 在授权范围内行动。
7. Action 完成不等于 Goal 达成，最终接受必须经过 Evidence 和 DRI Decision。
