# Stepwise 核心概念

## 一句话定义

Stepwise 是让 Human DRI 与 Agent 围绕 Goal 逐层拆解、按授权执行 Action，并依据执行证据决定下一步的组织运行系统。

产品只有两类工作节点：

- `Goal`：希望发生的变化，可以递归拆成下级 Goal。
- `Action`：对叶子 Goal 的一次实际执行。

`Relation` 负责连接工作节点并保存“为什么这样连接”的推演过程，但它不是第三类工作节点。

## Goal｜目标

Goal 是唯一可以递归的工作单元。

每个 Goal 包含：

- 标题与目标描述。
- 唯一 Human DRI。
- 成功标准。
- 约束与授权边界。
- 状态。
- 上下级 Goal。
- 前置依赖与后续影响。
- 相关 Action。
- Evidence 与验收 Decision。

Goal 有两种互斥形态：

### 组合 Goal

包含下级 Goal，不直接创建 Action。

组合 Goal 的进展来自下级 Goal，最终由 Human DRI 使用汇总 Evidence 对本层成功标准做验收。

### 叶子 Goal

不再包含下级 Goal，可以创建 Action。

如果一个 Goal 既有下级 Goal 又需要直接执行，说明拆解不完整。应将直接工作补充为新的下级 Goal。

## Decomposition Review｜拆解方案推演

拆解方案推演属于父 Goal 的推演记录，不是第三类工作节点。

它审查的不是某一条父子连接，而是整组下级 Goal：

- 为什么拆成当前数量，而不是更多或更少。
- 这组 Goal 是否共同覆盖上级成功标准。
- 各 Goal 的边界是否清楚，是否存在重复。
- 哪些候选 Goal 被合并、拒绝或暂缓，以及原因。
- 什么新事实会触发重新拆解。

拆解方案推演确认“这一组拆解是否成立”；每条 `decomposes` Relation 继续确认“某一个下级 Goal 为什么存在”。两者必须同时可追溯。

## Action｜行动

Action 是对叶子 Goal 的一次真实执行，也是原模型中的 Run。

每个 Action 包含：

- 所属叶子 Goal。
- 执行者。
- Human DRI 授权与授权边界。
- 风险等级。
- 输入与预期输出。
- 执行状态。
- 实际结果。
- Evidence。
- Human DRI Decision。
- 开始与结束时间。

失败、重试或采用不同方案时创建新的 Action，不覆盖历史 Action。

API 调用、浏览器点击和文件写入属于 Action 内部事件，不进入 Goal 树。

## Relation｜连接

Relation 不是工作节点，而是 Goal 与 Action 之间的可审查连接。

每条 Relation 必须保存：

- 来源节点与目标节点。
- 关系类型。
- 方向。
- 关系成立的理由。
- 依赖假设。
- 提出者、确认人和状态。
- 历史推演与版本。

只保存四种关系：

| 关系 | 方向 | 含义 |
|---|---|---|
| `decomposes` | Goal → Goal | 上级 Goal 拆解出下级 Goal |
| `executes` | Goal → Action | 叶子 Goal 通过一次 Action 执行 |
| `goal-dependency` | Goal → Goal | 前置 Goal 完成后，后续 Goal 才能推进 |
| `action-dependency` | Action → Action | 前置 Action 的结果是后续 Action 的输入或条件 |

依赖统一采用“前置 → 后续”的方向。系统不同时保存 `depends_on` 和 `blocks` 两种反向表达，避免双重事实。

## Goal 与 Action 的关系

```text
组合 Goal
└── 下级 Goal
    ├── 下级 Goal
    └── 叶子 Goal
        ├── Action 1
        ├── Action 2（重试）
        └── Action 3（替代方案）
```

硬规则：

1. 有下级 Goal，就不能直接创建 Action。
2. 没有下级 Goal，才是可执行的叶子 Goal。
3. Action 必须属于一个叶子 Goal。
4. Action 完成不等于 Goal 达成。
5. Goal 是否达成由 Human DRI 根据成功标准和 Evidence 决定。

## Evidence 与 Decision

Evidence 和 Decision 不作为 Map 上的工作节点。

- Evidence 是 Action 的执行事实，也可以汇总到 Goal。
- Decision 是 Human DRI 对 Action 或 Goal 的正式判断。
- 接受、重做、停止和调整都会形成 Decision 事件。
- Action 不能自行把自己的结果标记为已接受。

## Actor 与授权

Actor 不是工作层级，而是 Goal、Action 和 Relation 的治理属性。

- Human DRI：对 Goal 成功标准、授权和最终验收负责。
- Official Reasoning Agent：由 Stepwise 提供的逻辑统一、可版本化身份，负责 Goal 澄清、整组拆解、Relation / 依赖建议和逻辑检查。
- Execution Agent：由用户自带，在授权范围内执行 Action 并回填 Evidence。
- External Advisor：提供专业判断的外部 Actor，不因参与讨论而成为工作节点。

Official Reasoning Agent 只生成 Proposal，不执行 Action，也不替 Human DRI 验收。Proposal 只有经过对应 Goal 的 Human DRI 明确确认，才会写入正式 Goal、Action 或 Relation。Stepwise 保证推演方法、结构、版本和审计一致，不保证每个结论必然正确。

## 时间

时间不是工作节点，而是 Goal、Action 和 Relation 的治理属性。

- Goal 保存开始时间、Deadline 和时区。
- Action 保存计划或实际开始、结束时间。
- Relation 可以保存生效窗口、等待时间或时序约束。
- Deadline 不能替代成功标准；到期不等于 Goal 达成。

## 四个产品界面

### Map｜工作图谱

同时展示：

- Goal 的上下级结构。
- Goal 之间的平级依赖。
- Goal 到 Action 的执行关系。
- Action 之间的执行依赖。

不同关系使用不同线型和图例。点击节点进入详情，点击连接进入连接推演。

### Detail｜节点详情

每个 Goal 和 Action 都有自己的详情页。

- Goal 详情展示目标属性、成功标准、上下级、依赖、Action 和验收信息。
- Action 详情展示授权、执行者、输入、结果、Evidence、依赖和 Decision。

### Decomposition Deliberation｜拆解方案推演

组合 Goal 的拆解入口解释整组下级 Goal：

- 使用了什么拆解原则。
- 为什么当前数量足够。
- 如何验证覆盖性与边界。
- 哪些候选方案没有单列。
- 历史上经过哪些提案和 DRI Decision。

### Relation Deliberation｜连接推演

每条连接都有独立推演记录，解释：

- 为什么需要这个下级 Goal。
- 为什么一个 Goal 必须先于另一个 Goal。
- 为什么需要这次 Action。
- 为什么一个 Action 的结果是另一个 Action 的前置条件。

## 最小工作闭环

```text
Goal
→ 拆成下级 Goal
→ 叶子 Goal 创建 Action
→ Action 产生结果与 Evidence
→ Human DRI 验收
→ 接受、重做或调整 Goal / Relation
```
