export type GoalStatus =
  | "draft"
  | "active"
  | "blocked"
  | "review"
  | "accepted";

export type ActionStatus =
  | "ready"
  | "running"
  | "review"
  | "accepted"
  | "redo"
  | "failed";

export type ActorKind =
  | "human-dri"
  | "reasoning-agent"
  | "execution-agent"
  | "external-advisor";

export type Actor = {
  id: string;
  name: string;
  kind: ActorKind;
  role: string;
  version?: string;
};

export type GoalTimebox = {
  startsAt: string;
  dueAt: string;
  timezone: string;
};

export type EvidenceItem = {
  id: string;
  label: string;
  detail: string;
  kind: "artifact" | "observation" | "claim";
  source?: string;
};

export type Goal = {
  id: string;
  title: string;
  intent: string;
  dri: Actor;
  timebox: GoalTimebox;
  status: GoalStatus;
  level: number;
  parentId?: string;
  successCriteria: string[];
  constraints: string[];
  autonomy: string;
};

export type CreateGoalInput = {
  title: string;
  intent: string;
  driName: string;
  driRole: string;
  startsAt: string;
  dueAt: string;
  timezone: string;
  successCriteria: string[];
  constraints: string[];
  autonomy: string;
};

export type Action = {
  id: string;
  goalId: string;
  title: string;
  executor: Actor;
  approvedBy: Actor;
  authorization: string;
  risk: "low" | "medium" | "high";
  status: ActionStatus;
  input: string;
  expectedOutput: string;
  outcome?: string;
  evidence: EvidenceItem[];
  decision?: string;
  startedAt?: string;
  completedAt?: string;
};

export type RelationKind =
  | "decomposes"
  | "executes"
  | "goal-dependency"
  | "action-dependency";

export type RelationEvent = {
  id: string;
  actor: string;
  type: "analysis" | "proposal" | "decision";
  content: string;
  createdAt: string;
};

export type DecompositionAlternative = {
  title: string;
  decision: "included" | "merged" | "rejected";
  rationale: string;
};

export type ProposedGoal = Omit<
  Goal,
  "id" | "level" | "parentId" | "status"
> & {
  proposedId: string;
};

export type DecompositionReview = {
  id: string;
  goalId: string;
  childGoalIds: string[];
  proposedGoals: ProposedGoal[];
  question: string;
  logic: string;
  completeness: string;
  boundaryRules: string[];
  alternatives: DecompositionAlternative[];
  openQuestions: string[];
  status: "proposed" | "confirmed";
  createdBy: string;
  createdAt: string;
  events: RelationEvent[];
};

export type Relation = {
  id: string;
  kind: RelationKind;
  sourceId: string;
  targetId: string;
  label: string;
  rationale: string;
  assumptions: string[];
  status: "proposed" | "confirmed";
  createdBy: string;
  createdAt: string;
  events: RelationEvent[];
};

export const actors = {
  linRan: {
    id: "H-LIN-RAN",
    name: "林然",
    kind: "human-dri",
    role: "队长",
  },
  chenMo: {
    id: "H-CHEN-MO",
    name: "陈默",
    kind: "human-dri",
    role: "工程",
  },
  zhouNing: {
    id: "H-ZHOU-NING",
    name: "周宁",
    kind: "human-dri",
    role: "产品",
  },
  xuYan: {
    id: "H-XU-YAN",
    name: "许妍",
    kind: "human-dri",
    role: "演示",
  },
  reasoning: {
    id: "A-STEPWISE-REASONING",
    name: "Stepwise Reasoning Agent",
    kind: "reasoning-agent",
    role: "官方逻辑推演",
    version: "2026.09",
  },
  rules: {
    id: "A-RULES",
    name: "规则 Agent",
    kind: "execution-agent",
    role: "规则核验",
  },
  engineering: {
    id: "A-ENGINEERING",
    name: "工程 Agent",
    kind: "execution-agent",
    role: "工程执行",
  },
  quality: {
    id: "A-QUALITY",
    name: "质量 Agent",
    kind: "execution-agent",
    role: "验证",
  },
  productEngineering: {
    id: "A-PRODUCT-ENGINEERING",
    name: "产品工程 Agent",
    kind: "execution-agent",
    role: "产品工程",
  },
  demo: {
    id: "A-DEMO",
    name: "演示 Agent",
    kind: "execution-agent",
    role: "内容执行",
  },
} satisfies Record<string, Actor>;

export const goals: Record<string, Goal> = {
  G0: {
    id: "G0",
    title: "提交 Stepwise 参加 Amazon Developer Hackathon",
    intent:
      "在 2026 年 10 月 23 日 12:00 PT 前，提交可运行、可复核的 Alexa+ 赛道作品。",
    dri: actors.linRan,
    timebox: {
      startsAt: "2026-09-15T09:00:00+08:00",
      dueAt: "2026-10-23T12:00:00-07:00",
      timezone: "America/Los_Angeles",
    },
    status: "active",
    level: 0,
    successCriteria: [
      "公开 Demo 可完成 Goal → Action → Evidence → Decision 闭环",
      "兼容客户端可通过 MCP 读取 Goal 并执行受权 Action",
      "公开仓库、三分钟英文视频和产品反馈满足赛事规则",
    ],
    constraints: ["不伪造外部执行结果", "正式提交与高风险操作必须由 DRI 确认"],
    autonomy: "Agent 可推进可逆工作；范围、预算、公开发布和最终验收由 DRI 决策。",
  },
  G1: {
    id: "G1",
    title: "确认参赛资格与规则",
    intent: "形成唯一可信的资格、赛程和提交约束基线。",
    dri: actors.linRan,
    timebox: {
      startsAt: "2026-09-15T09:00:00+08:00",
      dueAt: "2026-09-16T18:00:00+08:00",
      timezone: "Asia/Shanghai",
    },
    status: "accepted",
    level: 1,
    parentId: "G0",
    successCriteria: [
      "资格、截止时间和提交物均有官方来源",
      "Alexa+ 技术路径已由 DRI 确认",
    ],
    constraints: ["规则冲突时以官方 Rules 页面为准"],
    autonomy: "Agent 可采集和比对公开规则，资格结论由 DRI 确认。",
  },
  G2: {
    id: "G2",
    title: "交付可运行产品",
    intent: "让评审能够实际体验 Stepwise 的目标协作闭环。",
    dri: actors.chenMo,
    timebox: {
      startsAt: "2026-09-15T12:00:00+08:00",
      dueAt: "2026-10-10T18:00:00+08:00",
      timezone: "Asia/Shanghai",
    },
    status: "active",
    level: 1,
    parentId: "G0",
    successCriteria: [
      "Web 产品和 MCP 接口均可公开访问",
      "授权、失败、Evidence 与验收状态可追溯",
    ],
    constraints: ["先完成最小闭环，再增加平台能力"],
    autonomy: "工程 Agent 可执行可逆开发；数据删除和生产配置变更需升级。",
  },
  G21: {
    id: "G21",
    title: "完成 Stepwise MCP",
    intent: "让外部 Agent 通过标准协议参与 Goal 的读取、执行和验收。",
    dri: actors.chenMo,
    timebox: {
      startsAt: "2026-09-15T12:00:00+08:00",
      dueAt: "2026-09-30T18:00:00+08:00",
      timezone: "Asia/Shanghai",
    },
    status: "review",
    level: 2,
    parentId: "G2",
    successCriteria: [
      "支持初始化、工具发现、Goal 读取和 Action 状态迁移",
      "无凭证写入和非法状态迁移被拒绝",
    ],
    constraints: ["符合 MCP 2025-11-25", "Action 不能自行接受结果"],
    autonomy: "工程 Agent 可实现和测试接口；权限策略由 DRI 确认。",
  },
  G22: {
    id: "G22",
    title: "完成 Web 演示体验",
    intent: "让用户在一个界面看清 Goal、Action、依赖和推演过程。",
    dri: actors.zhouNing,
    timebox: {
      startsAt: "2026-09-15T13:00:00+08:00",
      dueAt: "2026-10-05T18:00:00+08:00",
      timezone: "Asia/Shanghai",
    },
    status: "active",
    level: 2,
    parentId: "G2",
    successCriteria: [
      "Map 同时表达上下级与同级依赖",
      "每个 Goal、Action 和连接均可进入详情",
    ],
    constraints: ["不以说明书替代真实操作", "移动端无横向页面溢出"],
    autonomy: "产品和工程 Agent 可优化可逆界面，核心模型变更需 DRI 确认。",
  },
  G3: {
    id: "G3",
    title: "完成评审演示",
    intent: "用三分钟英文视频证明 Stepwise 的问题、工作流与技术价值。",
    dri: actors.xuYan,
    timebox: {
      startsAt: "2026-10-06T09:00:00+08:00",
      dueAt: "2026-10-16T18:00:00+08:00",
      timezone: "Asia/Shanghai",
    },
    status: "blocked",
    level: 1,
    parentId: "G0",
    successCriteria: [
      "视频少于三分钟并展示真实产品",
      "叙事清楚区分 Human DRI 与 Agent 责任",
    ],
    constraints: ["产品核心流程稳定后录制"],
    autonomy: "演示 Agent 可生成脚本和镜头草案，成片发布由 DRI 确认。",
  },
  G4: {
    id: "G4",
    title: "完成 Devpost 提交",
    intent: "按规则提交全部材料并保存提交回执。",
    dri: actors.linRan,
    timebox: {
      startsAt: "2026-10-17T09:00:00+08:00",
      dueAt: "2026-10-23T12:00:00-07:00",
      timezone: "America/Los_Angeles",
    },
    status: "blocked",
    level: 1,
    parentId: "G0",
    successCriteria: [
      "所有必填字段和链接通过最终检查",
      "提交成功并保存可追溯回执",
    ],
    constraints: ["正式提交不可由 Agent 自动完成"],
    autonomy: "Agent 可准备草稿和检查清单，最终提交由 DRI 操作。",
  },
};

export const initialActions: Action[] = [
  {
    id: "A1",
    goalId: "G1",
    title: "核验 Amazon 官方规则",
    executor: actors.rules,
    approvedBy: actors.linRan,
    authorization: "允许访问公开网页并整理规则，不代表用户接受条款。",
    risk: "low",
    status: "accepted",
    input: "赛事 Overview、Rules 与 Resources 页面。",
    expectedOutput: "带来源的资格与提交约束清单。",
    outcome: "确认中国大陆个人可参加，Alexa+ 接受 MCP 或 Web 模拟体验。",
    evidence: [
      {
        id: "E1",
        label: "官方 Rules",
        detail: "规则未将中国大陆列入排除地区，并允许已有项目重大更新。",
        kind: "observation",
        source: "https://amazonappdev2026.devpost.com/rules",
      },
    ],
    decision: "DRI 接受结论并选择 Alexa+ 赛道。",
    startedAt: "2026-09-15T11:20:00.000Z",
    completedAt: "2026-09-15T11:42:00.000Z",
  },
  {
    id: "A2",
    goalId: "G21",
    title: "实现 MCP Streamable HTTP 接口",
    executor: actors.engineering,
    approvedBy: actors.linRan,
    authorization: "允许修改工作区代码并运行本地测试，不允许部署或写入外部账户。",
    risk: "medium",
    status: "accepted",
    input: "Stepwise Goal/Action 模型与 MCP 2025-11-25 规范。",
    expectedOutput: "可初始化并发现工具的 /api/mcp 端点。",
    outcome: "已实现无会话 MCP 接口和五个受治理工具。",
    evidence: [
      {
        id: "E2",
        label: "MCP 冒烟测试",
        detail: "初始化、工具发现、凭证拒绝和验收状态迁移全部通过。",
        kind: "artifact",
        source: "scripts/mcp-smoke.ts",
      },
    ],
    decision: "DRI 接受实现，下一步迁移为 Goal/Action 模型。",
    startedAt: "2026-09-15T12:05:00.000Z",
    completedAt: "2026-09-15T13:02:00.000Z",
  },
  {
    id: "A3",
    goalId: "G21",
    title: "验证 MCP 权限与失败路径",
    executor: actors.quality,
    approvedBy: actors.chenMo,
    authorization: "允许运行本地协议测试，不允许使用生产凭证。",
    risk: "low",
    status: "ready",
    input: "MCP 端点、错误凭证、非法状态迁移样例。",
    expectedOutput: "可重复的成功与失败路径报告。",
    evidence: [],
  },
  {
    id: "A4",
    goalId: "G22",
    title: "重构 Goal / Action 工作区",
    executor: actors.productEngineering,
    approvedBy: actors.linRan,
    authorization: "允许替换原型入口，旧实现保留在代码中。",
    risk: "medium",
    status: "running",
    input: "两类工作节点、详情页、关系推演与统一 Map 需求。",
    expectedOutput: "桌面和移动端均可操作的新工作区。",
    evidence: [],
    startedAt: "2026-09-15T13:20:00.000Z",
  },
  {
    id: "A5",
    goalId: "G3",
    title: "录制三分钟产品演示",
    executor: actors.demo,
    approvedBy: actors.xuYan,
    authorization: "产品流程稳定后执行；公开发布仍需 DRI 确认。",
    risk: "medium",
    status: "ready",
    input: "稳定 Demo、英文脚本和镜头清单。",
    expectedOutput: "不超过三分钟的公开英文演示视频。",
    evidence: [],
  },
];

export const decompositionReviews: DecompositionReview[] = [
  {
    id: "D1",
    goalId: "G0",
    childGoalIds: ["G1", "G2", "G3", "G4"],
    proposedGoals: [],
    question: "为什么拆成 4 个 Goal，而不是 3 个或 5 个？",
    logic:
      "按参赛闭环中的四类独立结果拆解：先确认有效边界，再交付可运行产品，再形成评审可理解的演示，最后完成不可逆提交。每一类结果都有独立 DRI、成功标准和验收时点。",
    completeness:
      "四个 Goal 共同覆盖资格有效、作品可运行、价值可评审和材料已提交。缺少任一项都无法达到 G0；新增第五项必须证明它产生独立结果，而不只是现有 Goal 的方法或协作机制。",
    boundaryRules: [
      "按独立结果拆分，不按部门、角色或活动清单拆分。",
      "能被上级成功标准单独验收，才成为下级 Goal。",
      "跨 Goal 的顺序通过 dependency 表达，不重复拆成新 Goal。",
    ],
    alternatives: [
      {
        title: "增加“团队协作与项目管理”Goal",
        decision: "rejected",
        rationale: "它是推进四个结果的运行机制，不是 G0 需要独立验收的结果。",
      },
      {
        title: "把 MCP 独立为根级 Goal",
        decision: "merged",
        rationale: "MCP 是可运行产品的组成部分，应在 G2 内继续拆解，避免层级粒度不一致。",
      },
      {
        title: "合并演示与提交",
        decision: "rejected",
        rationale: "演示是可反复修改的评审材料，提交是不可逆操作，责任与验收时点不同。",
      },
    ],
    openQuestions: ["若赛事新增独立必交物，需要重新检查是否形成第五个结果 Goal。"],
    status: "confirmed",
    createdBy: "参赛策略 Agent",
    createdAt: "2026-09-15T10:50:00.000Z",
    events: [
      {
        id: "DE1",
        actor: "参赛策略 Agent",
        type: "analysis",
        content: "先按最终提交成立所需的独立结果分类，而不是直接罗列任务。",
        createdAt: "2026-09-15T10:42:00.000Z",
      },
      {
        id: "DE2",
        actor: "林然｜队长",
        type: "decision",
        content: "确认四类结果覆盖当前赛事闭环，MCP 归入产品交付继续拆解。",
        createdAt: "2026-09-15T10:50:00.000Z",
      },
    ],
  },
  {
    id: "D2",
    goalId: "G2",
    childGoalIds: ["G21", "G22"],
    proposedGoals: [],
    question: "为什么产品交付拆成 MCP 与 Web 两个 Goal？",
    logic:
      "按两种独立使用表面拆解：MCP 让外部 Agent 真正接入，Web 让评审和 Human DRI 看见并操作完整闭环。协议可用不等于产品可理解，两者需要分别验收。",
    completeness:
      "G21 覆盖机器接入和治理约束，G22 覆盖人的理解与操作。部署、数据和身份能力仍属于这两个表面的实现条件，当前不构成独立赛事结果。",
    boundaryRules: [
      "技术协议和用户体验分别拥有独立成功标准。",
      "内部基础设施不因技术复杂就自动成为 Goal。",
      "只有需要独立 DRI 和独立验收的结果才继续拆分。",
    ],
    alternatives: [
      {
        title: "增加“服务端数据层”Goal",
        decision: "merged",
        rationale: "当前赛事原型只需支撑两个产品表面，数据层是实现条件，不是独立用户结果。",
      },
      {
        title: "只保留 Web Demo",
        decision: "rejected",
        rationale: "无法证明外部 Agent 可以通过标准协议参与受治理的工作闭环。",
      },
    ],
    openQuestions: ["正式多人使用时，身份与权限是否需要提升为独立 Goal。"],
    status: "confirmed",
    createdBy: "产品工程 Agent",
    createdAt: "2026-09-15T11:55:00.000Z",
    events: [
      {
        id: "DE3",
        actor: "产品工程 Agent",
        type: "proposal",
        content: "以机器接入和人的操作体验作为两个独立验收面。",
        createdAt: "2026-09-15T11:48:00.000Z",
      },
      {
        id: "DE4",
        actor: "陈默｜工程",
        type: "decision",
        content: "确认数据层暂不单列，先服务 MCP 与 Web 两个结果。",
        createdAt: "2026-09-15T11:55:00.000Z",
      },
    ],
  },
  {
    id: "D3",
    goalId: "G4",
    childGoalIds: [],
    proposedGoals: [
      {
        proposedId: "G41",
        title: "完成提交材料终检",
        intent: "逐项验证 Devpost 字段、公开链接和赛事约束，形成可签字的提交清单。",
        dri: actors.linRan,
        timebox: {
          startsAt: "2026-10-17T09:00:00+08:00",
          dueAt: "2026-10-21T18:00:00+08:00",
          timezone: "Asia/Shanghai",
        },
        successCriteria: [
          "所有必填字段、仓库、Demo 与视频链接均通过访问检查",
          "赛事规则约束逐项对应到提交内容",
        ],
        constraints: ["终检只形成结论，不执行正式提交"],
        autonomy: "官方 Reasoning Agent 可检查结构与遗漏；DRI 确认终检结论。",
      },
      {
        proposedId: "G42",
        title: "完成正式提交与回执归档",
        intent: "由 Human DRI 完成不可逆提交，并保存平台回执作为最终 Evidence。",
        dri: actors.linRan,
        timebox: {
          startsAt: "2026-10-22T09:00:00+08:00",
          dueAt: "2026-10-23T12:00:00-07:00",
          timezone: "America/Los_Angeles",
        },
        successCriteria: [
          "Human DRI 在截止时间前完成正式提交",
          "提交成功页、时间和版本回执已归档",
        ],
        constraints: ["正式提交必须由 Human DRI 操作", "终检未通过时不得提交"],
        autonomy: "Execution Agent 只能准备字段和证据，不能触发最终提交。",
      },
    ],
    question: "正式提交应如何拆解，才能隔离可逆终检与不可逆操作？",
    logic:
      "官方 Reasoning Agent 按可逆性和决策责任拆成两段：先完成可重复的材料终检，再由 Human DRI 执行正式提交。这样可以让 Agent 充分准备，同时不越过不可逆操作边界。",
    completeness:
      "两个候选 Goal 覆盖提交前完整性与提交后可追溯性。准备文案、上传素材等活动属于终检的 Action，不需要继续增加 Goal。",
    boundaryRules: [
      "可逆准备与不可逆提交必须分开验收。",
      "每个候选 Goal 都必须有唯一 Human DRI 和明确 Deadline。",
      "提案确认前不得进入正式 Goal Map，也不得创建 Action。",
    ],
    alternatives: [
      {
        title: "保留一个 Goal，直接创建提交 Action",
        decision: "rejected",
        rationale: "会把可自动检查的准备工作与必须由人执行的不可逆操作混在同一授权边界。",
      },
      {
        title: "按每项提交材料分别建 Goal",
        decision: "merged",
        rationale: "这些材料共同服务一次终检，可作为同一 Goal 下的 Action 处理。",
      },
    ],
    openQuestions: ["若平台支持提交后修改，需要在实际规则确认后调整回执验收标准。"],
    status: "proposed",
    createdBy: "Stepwise Reasoning Agent · 2026.09",
    createdAt: "2026-09-16T09:30:00.000Z",
    events: [
      {
        id: "DE5",
        actor: "Stepwise Reasoning Agent · 2026.09",
        type: "analysis",
        content: "识别到正式提交是不可逆操作，应与可重复的材料终检分离。",
        createdAt: "2026-09-16T09:28:00.000Z",
      },
      {
        id: "DE6",
        actor: "Stepwise Reasoning Agent · 2026.09",
        type: "proposal",
        content: "提出 G41 与 G42；当前仅为 Proposal，等待 G4 的 Human DRI 确认。",
        createdAt: "2026-09-16T09:30:00.000Z",
      },
    ],
  },
];

export const relations: Relation[] = [
  {
    id: "R1",
    kind: "decomposes",
    sourceId: "G0",
    targetId: "G1",
    label: "拆解为",
    rationale: "参赛资格和规则是后续产品、演示与提交都必须遵守的边界。",
    assumptions: ["官方规则在提交前不会发生根本变化"],
    status: "confirmed",
    createdBy: "参赛策略 Agent",
    createdAt: "2026-09-15T11:00:00.000Z",
    events: [
      {
        id: "RE1",
        actor: "参赛策略 Agent",
        type: "analysis",
        content: "如果资格和提交物不明确，后续工作可能全部失效。",
        createdAt: "2026-09-15T10:56:00.000Z",
      },
      {
        id: "RE2",
        actor: "林然｜队长",
        type: "decision",
        content: "确认将规则基线作为独立 Goal。",
        createdAt: "2026-09-15T11:00:00.000Z",
      },
    ],
  },
  {
    id: "R2",
    kind: "decomposes",
    sourceId: "G0",
    targetId: "G2",
    label: "拆解为",
    rationale: "赛事要求可运行作品，产品交付需要独立责任人与成功标准。",
    assumptions: ["现有代码可在赛期内完成重大更新"],
    status: "confirmed",
    createdBy: "林然｜队长",
    createdAt: "2026-09-15T11:02:00.000Z",
    events: [],
  },
  {
    id: "R3",
    kind: "decomposes",
    sourceId: "G0",
    targetId: "G3",
    label: "拆解为",
    rationale: "评审主要通过视频理解作品，演示质量需要独立负责。",
    assumptions: ["视频必须展示真实运行而非概念稿"],
    status: "confirmed",
    createdBy: "演示 Agent",
    createdAt: "2026-09-15T11:04:00.000Z",
    events: [],
  },
  {
    id: "R4",
    kind: "decomposes",
    sourceId: "G0",
    targetId: "G4",
    label: "拆解为",
    rationale: "正式提交包含不可逆操作和完整性检查，需要 DRI 单独负责。",
    assumptions: ["Devpost 提交入口保持开放到截止时间"],
    status: "confirmed",
    createdBy: "林然｜队长",
    createdAt: "2026-09-15T11:06:00.000Z",
    events: [],
  },
  {
    id: "R5",
    kind: "decomposes",
    sourceId: "G2",
    targetId: "G21",
    label: "拆解为",
    rationale: "MCP 是 Alexa+ 赛道的核心技术接入，需要独立验收。",
    assumptions: ["无会话 Streamable HTTP 足以支撑赛事演示"],
    status: "confirmed",
    createdBy: "工程 Agent",
    createdAt: "2026-09-15T12:00:00.000Z",
    events: [],
  },
  {
    id: "R6",
    kind: "decomposes",
    sourceId: "G2",
    targetId: "G22",
    label: "拆解为",
    rationale: "协议成立不等于用户能理解价值，需要独立的 Web 产品体验。",
    assumptions: ["浏览器 Demo 是评审最容易访问的载体"],
    status: "confirmed",
    createdBy: "周宁｜产品",
    createdAt: "2026-09-15T12:02:00.000Z",
    events: [],
  },
  {
    id: "R7",
    kind: "goal-dependency",
    sourceId: "G2",
    targetId: "G3",
    label: "先于",
    rationale: "必须先有稳定产品，才能录制不失真的最终演示。",
    assumptions: ["最终视频不使用纯概念动画替代产品"],
    status: "confirmed",
    createdBy: "许妍｜演示",
    createdAt: "2026-09-15T12:10:00.000Z",
    events: [
      {
        id: "RE7",
        actor: "许妍｜演示",
        type: "proposal",
        content: "将产品稳定设为录制视频的前置依赖。",
        createdAt: "2026-09-15T12:08:00.000Z",
      },
    ],
  },
  {
    id: "R8",
    kind: "goal-dependency",
    sourceId: "G3",
    targetId: "G4",
    label: "先于",
    rationale: "Devpost 最终提交需要公开演示视频链接。",
    assumptions: ["视频平台上传与公开链接可正常使用"],
    status: "confirmed",
    createdBy: "规则 Agent",
    createdAt: "2026-09-15T12:12:00.000Z",
    events: [],
  },
  {
    id: "R9",
    kind: "action-dependency",
    sourceId: "A2",
    targetId: "A3",
    label: "先于",
    rationale: "必须先有可运行 MCP 接口，才能验证权限与失败路径。",
    assumptions: ["测试使用与实现相同的协议版本"],
    status: "confirmed",
    createdBy: "质量 Agent",
    createdAt: "2026-09-15T13:04:00.000Z",
    events: [],
  },
  {
    id: "R10",
    kind: "action-dependency",
    sourceId: "A4",
    targetId: "A5",
    label: "先于",
    rationale: "工作区重构稳定后才能录制与最终模型一致的演示。",
    assumptions: ["重构不改变赛事技术接入路径"],
    status: "proposed",
    createdBy: "演示 Agent",
    createdAt: "2026-09-15T13:24:00.000Z",
    events: [],
  },
  {
    id: "R11",
    kind: "executes",
    sourceId: "G1",
    targetId: "A1",
    label: "执行为",
    rationale: "G1 已经是叶子 Goal，需要通过一次规则核验 Action 产生可审查证据。",
    assumptions: ["公开页面足以判断当前参赛资格"],
    status: "confirmed",
    createdBy: "林然｜队长",
    createdAt: "2026-09-15T11:16:00.000Z",
    events: [],
  },
  {
    id: "R12",
    kind: "executes",
    sourceId: "G21",
    targetId: "A2",
    label: "执行为",
    rationale: "MCP 接口实现是达到 G21 成功标准的第一次工程执行。",
    assumptions: ["现有 Vercel Functions 可承载无会话 MCP"],
    status: "confirmed",
    createdBy: "陈默｜工程",
    createdAt: "2026-09-15T12:04:00.000Z",
    events: [],
  },
  {
    id: "R13",
    kind: "executes",
    sourceId: "G21",
    targetId: "A3",
    label: "执行为",
    rationale: "接口实现后仍需独立 Action 验证权限、失败和重试路径。",
    assumptions: ["测试覆盖赛事演示所需的主要错误状态"],
    status: "confirmed",
    createdBy: "质量 Agent",
    createdAt: "2026-09-15T13:03:00.000Z",
    events: [],
  },
  {
    id: "R14",
    kind: "executes",
    sourceId: "G22",
    targetId: "A4",
    label: "执行为",
    rationale: "G22 是叶子 Goal，当前 Action 负责完成两类节点和关系推演的界面重构。",
    assumptions: ["旧工作区可保留但不再作为主入口"],
    status: "confirmed",
    createdBy: "林然｜队长",
    createdAt: "2026-09-15T13:18:00.000Z",
    events: [],
  },
  {
    id: "R15",
    kind: "executes",
    sourceId: "G3",
    targetId: "A5",
    label: "执行为",
    rationale: "G3 已经可执行，录制 Action 将产生视频文件与公开链接。",
    assumptions: ["产品稳定后不再发生破坏演示脚本的结构变化"],
    status: "proposed",
    createdBy: "演示 Agent",
    createdAt: "2026-09-15T13:22:00.000Z",
    events: [],
  },
];
