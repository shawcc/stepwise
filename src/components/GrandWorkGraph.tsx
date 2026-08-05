import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Focus,
  FileCheck2,
  GitBranch,
  Layers3,
  Map,
  Maximize2,
  Network,
  PanelTop,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
} from "lucide-react";
import {
  requestAgentProposal,
  type AgentProposal,
} from "@/lib/workgraph-agent";

type CanvasStage = "goal" | "conditions" | "path" | "execute" | "verify";
type WorkspaceView = "map" | "canvas" | "dependencies" | "evidence" | "monitor" | "timeline";

type StageDrafts = Record<string, string>;

type WorkspaceVersion = {
  key: string;
  draft: string;
  savedAt: string;
};

type PersistedWorkspace = {
  drafts: StageDrafts;
  confirmedDrafts: string[];
  methodByStage: Record<string, string>;
  versions: WorkspaceVersion[];
};

const workspaceStorageKey = "workgraph:mvp-workspace:v1";

function loadWorkspace(): PersistedWorkspace {
  const empty: PersistedWorkspace = {
    drafts: {},
    confirmedDrafts: [],
    methodByStage: {},
    versions: [],
  };
  if (typeof window === "undefined") return empty;

  try {
    const stored = JSON.parse(window.localStorage.getItem(workspaceStorageKey) ?? "null");
    if (!stored || typeof stored !== "object") return empty;
    return {
      drafts: stored.drafts ?? {},
      confirmedDrafts: stored.confirmedDrafts ?? [],
      methodByStage: stored.methodByStage ?? {},
      versions: stored.versions ?? [],
    };
  } catch {
    return empty;
  }
}

type MethodDefinition = {
  id: string;
  name: string;
  summary: string;
  source: string;
  sourceUrl?: string;
  checks: string[];
};

type GoalNode = {
  id: string;
  title: string;
  level: number;
  parentId?: string;
  relation?: string;
  owner: string;
  status: string;
  problem: string;
  objective: string;
  conditionSummary: string;
  children: string[];
};

const goals: Record<string, GoalNode> = {
  G0: {
    id: "G0",
    title: "创建未来的工作平台",
    level: 0,
    owner: "产品负责人",
    status: "设计中",
    problem: "当前只有前端交互原型，尚未形成可保存、可执行、可验证的真实工作系统。",
    objective: "让团队直接在 WorkGraph 中建设 WorkGraph，并让图谱成为项目唯一、可追溯的工作事实源。",
    conditionSummary: "7 条产品成立条件全部具备真实证据，且至少一条需求从提出到验收完全在系统内完成",
    children: ["G0.1", "G0.2", "G0.3", "G0.4", "G0.5", "G0.6", "G0.7"],
  },
  "G0.1": {
    id: "G0.1",
    title: "建立自洽的工作图谱模型",
    level: 1,
    parentId: "G0",
    relation: "N1 · 必要条件",
    owner: "产品架构",
    status: "设计中",
    problem: "核心概念已基本形成，但对象、关系、状态和变更规则仍散落在文档与前端代码中。",
    objective: "形成一套人和 Agent 都能无歧义读取、修改、验证和演进的工作图谱协议。",
    conditionSummary: "对象、关系、目标契约、状态机和变更影响规则均有正式定义与校验样例",
    children: ["G0.1.1", "G0.1.2", "G0.1.3", "G0.1.4"],
  },
  "G0.2": {
    id: "G0.2",
    title: "让复杂图谱可理解、可操作",
    level: 1,
    parentId: "G0",
    relation: "N2 · 必要条件",
    owner: "产品设计",
    status: "原型已实现",
    problem: "递归 Goal 和多种视图已经能演示，但大图导航、视图一致性、状态反馈和可访问性仍未完成验证。",
    objective: "让用户在同一层级结构中看全局、逐层下钻，并在需要时进入当前 Goal 的工作画布。",
    conditionSummary: "用户无需说明即可完成定位、下钻、切换视图、编辑和返回，且不会丢失当前焦点",
    children: ["G0.2.1", "G0.2.2", "G0.2.3", "G0.2.4"],
  },
  "G0.3": {
    id: "G0.3",
    title: "把自然语言与工作材料转成图谱",
    level: 1,
    parentId: "G0",
    relation: "N3 · 必要条件",
    owner: "语义 Agent",
    status: "设计中",
    problem: "当前示例数据由代码手写，逻辑提取能力没有接入真实工作入口，也不能持续同步材料变化。",
    objective: "把聊天、文档、会议和用户输入转成保留来源、置信度与确认状态的候选图谱。",
    conditionSummary: "任一候选节点可回溯原文，明确表达与系统推断严格区分，并可由人逐项确认",
    children: ["G0.3.1", "G0.3.2", "G0.3.3", "G0.3.4"],
  },
  "G0.4": {
    id: "G0.4",
    title: "建设真实图谱基础设施",
    level: 1,
    parentId: "G0",
    relation: "N4 · 必要条件",
    owner: "平台工程",
    status: "待实现",
    problem: "当前所有修改只存在浏览器内存，刷新即丢失，没有后端、版本、权限和并发控制。",
    objective: "提供可持久化、可查询、可授权、可审计的工作图谱服务。",
    conditionSummary: "多人并发修改不丢失，任一版本可追溯，越权访问被阻断，图谱查询满足交互延迟要求",
    children: ["G0.4.1", "G0.4.2", "G0.4.3", "G0.4.4"],
  },
  "G0.5": {
    id: "G0.5",
    title: "建立 Agent 协作与治理运行时",
    level: 1,
    parentId: "G0",
    relation: "N5 · 必要条件",
    owner: "Agent 平台",
    status: "待实现",
    problem: "界面中的 Agent 建议是前端规则样例，没有真实模型、工具调用、委派、互审或失败恢复。",
    objective: "让多个 Agent 在权限和风险边界内领取、规划、执行、互审并回写同一张图谱。",
    conditionSummary: "Agent 行为有身份、依据、权限、成本和结果记录，失败可恢复，高风险动作必须升级",
    children: ["G0.5.1", "G0.5.2", "G0.5.3", "G0.5.4", "G0.5.5"],
  },
  "G0.6": {
    id: "G0.6",
    title: "跑通证据、验收与 Review 回流",
    level: 1,
    parentId: "G0",
    relation: "N6 · 必要条件",
    owner: "验证 Agent",
    status: "待实现",
    problem: "当前证据、验收、Review 和 Redo 都是静态展示，不能判断完成真假，也不能传播变更影响。",
    objective: "让每个结果用证据验收，失败能定位错误推理并使受影响的下游重新评估。",
    conditionSummary: "动作完成与目标达成被区分，证据可核验，Redo 前可计算并展示完整影响范围",
    children: ["G0.6.1", "G0.6.2", "G0.6.3", "G0.6.4"],
  },
  "G0.7": {
    id: "G0.7",
    title: "达到可持续产品化基线",
    level: 1,
    parentId: "G0",
    relation: "N7 · 验收条件",
    owner: "产品与工程",
    status: "开发中",
    problem: "项目可以本地构建和预览，但缺少系统测试、真实用户验证、运行监控、安全检查和发布闭环。",
    objective: "让 WorkGraph 能被持续开发、稳定发布，并用真实项目证明产品假设。",
    conditionSummary: "核心链路有自动化测试与监控，安全风险受控，真实用户能独立完成完整项目闭环",
    children: ["G0.7.1", "G0.7.2", "G0.7.3", "G0.7.4"],
  },
  "G0.1.1": {
    id: "G0.1.1",
    title: "定义节点模型",
    level: 2,
    parentId: "G0.1",
    relation: "N1.1 · 必要条件",
    owner: "模型 Agent",
    status: "设计中",
    problem: "Goal、Claim、Evidence 等对象已有概念说明，但字段必填性、生命周期和校验规则未固化。",
    objective: "明确 Goal、Claim、Evidence、Decision 等对象的语义与字段。",
    conditionSummary: "每类对象有 schema、合法样例、非法样例和生命周期测试",
    children: [],
  },
  "G0.1.2": {
    id: "G0.1.2",
    title: "定义关系协议",
    level: 2,
    parentId: "G0.1",
    relation: "N1.2 · 必要条件",
    owner: "语义 Agent",
    status: "设计中",
    problem: "关系标签已在原型中出现，但方向、传递性、互斥规则和计算语义尚未完整定义。",
    objective: "统一支撑、约束、依赖、反驳等关系的语义和计算规则。",
    conditionSummary: "每种关系有方向、基数、约束和传播规则，歧义关系无法写入正式图谱",
    children: [],
  },
  "G0.1.3": {
    id: "G0.1.3",
    title: "定义 Goal 契约与五阶段产物",
    level: 2,
    parentId: "G0.1",
    relation: "N1.3 · 必要条件",
    owner: "产品 Agent",
    status: "原型已实现",
    problem: "五阶段交互已实现，但各阶段的输入、输出、确认门和方法校验仍主要依赖展示文案。",
    objective: "定义目标、成立条件、路线、执行、验收各阶段的正式产物和状态转换。",
    conditionSummary: "任一阶段都能判断输入是否齐全、产物是否合格、谁有权确认以及何时可进入下一阶段",
    children: [],
  },
  "G0.1.4": {
    id: "G0.1.4",
    title: "定义版本与影响传播语义",
    level: 2,
    parentId: "G0.1",
    relation: "N1.4 · 必要条件",
    owner: "架构 Agent",
    status: "待确认",
    problem: "修改上游推理后，哪些下游失效、保留或需复核尚无正式规则。",
    objective: "定义图谱版本、确认状态、失效标记和上下游影响传播规则。",
    conditionSummary: "任意变更都能生成版本差异，并准确标记需要重新确认的下游对象",
    children: [],
  },
  "G0.2.1": {
    id: "G0.2.1",
    title: "稳定层级导航与地图下钻",
    level: 2,
    parentId: "G0.2",
    relation: "N2.1 · 必要条件",
    owner: "交互 Agent",
    status: "原型已实现",
    problem: "此前地图下钻会意外切换画布，视图入口也曾抢占真正的层级目录。",
    objective: "让 Goal 层级成为主导航，地图下钻保持地图，编辑动作才进入画布。",
    conditionSummary: "连续下钻和返回时视图不变、焦点不丢、完整路径与直接下级始终可见",
    children: [],
  },
  "G0.2.2": {
    id: "G0.2.2",
    title: "完善递归 Goal 画布",
    level: 2,
    parentId: "G0.2",
    relation: "N2.2 · 必要条件",
    owner: "产品设计",
    status: "原型已实现",
    problem: "画布已支持五阶段和共同编辑，但保存、冲突、阶段门和子画布上下文仍是模拟状态。",
    objective: "让任意 Goal 都能独立完成五阶段推理，并可递归进入子 Goal。",
    conditionSummary: "每个 Goal 的草稿、方法、确认状态和子 Goal 上下文独立保存且可恢复",
    children: [],
  },
  "G0.2.3": {
    id: "G0.2.3",
    title: "支持大图检索、过滤与聚合",
    level: 2,
    parentId: "G0.2",
    relation: "N2.3 · 必要条件",
    owner: "图谱体验",
    status: "待实现",
    problem: "当前样例只有几十个节点，缺少大规模图谱下的搜索、折叠、筛选和聚合状态。",
    objective: "让用户在上千节点中快速找到目标、理解局部与整体，并控制信息密度。",
    conditionSummary: "按名称、负责人、状态和关系可检索过滤，折叠节点能显示风险、进度与待决策聚合",
    children: [],
  },
  "G0.2.4": {
    id: "G0.2.4",
    title: "补齐响应式、无障碍与性能",
    level: 2,
    parentId: "G0.2",
    relation: "N2.4 · 必要条件",
    owner: "前端工程",
    status: "待验证",
    problem: "当前画布依赖较宽视口，键盘操作、窄屏布局和大图渲染性能未系统验证。",
    objective: "让核心操作在常用桌面尺寸、键盘和辅助技术下可靠可用。",
    conditionSummary: "核心流程满足键盘可达与清晰焦点，常用视口无关键操作遮挡，大图交互保持流畅",
    children: [],
  },
  "G0.3.1": {
    id: "G0.3.1",
    title: "接入聊天、文档与会议来源",
    level: 2,
    parentId: "G0.3",
    relation: "N3.1 · 必要条件",
    owner: "连接器 Agent",
    status: "待实现",
    problem: "系统没有真实材料入口，无法从组织正在发生的工作中持续获得上下文。",
    objective: "按权限读取聊天、文档、会议和用户直接输入，并保存来源锚点。",
    conditionSummary: "每条材料有来源、作者、时间、权限和稳定定位，源内容不可访问时不会泄露正文",
    children: [],
  },
  "G0.3.2": {
    id: "G0.3.2",
    title: "提取候选命题与语义关系",
    level: 2,
    parentId: "G0.3",
    relation: "N3.2 · 必要条件",
    owner: "语义 Agent",
    status: "开发中",
    problem: "现有逻辑提取偏规则演示，不能稳定处理跨句指代、隐含前提、冲突和长上下文。",
    objective: "从材料中提取候选 Goal、Claim、Evidence 和关系，同时保留不确定性。",
    conditionSummary: "基准样例可重复评测，错误提取可定位，低置信结果不会自动进入正式图谱",
    children: [],
  },
  "G0.3.3": {
    id: "G0.3.3",
    title: "提供候选图谱确认工作台",
    level: 2,
    parentId: "G0.3",
    relation: "N3.3 · 必要条件",
    owner: "产品设计",
    status: "待实现",
    problem: "缺少从原文到候选结构再到正式图谱的人工审查入口。",
    objective: "让用户逐项接受、修改、拒绝和合并候选节点与关系。",
    conditionSummary: "用户能对照原文审查每项推断，批量操作可撤销，确认者和修改理由被记录",
    children: [],
  },
  "G0.3.4": {
    id: "G0.3.4",
    title: "处理来源更新与图谱同步",
    level: 2,
    parentId: "G0.3",
    relation: "N3.4 · 必要条件",
    owner: "同步 Agent",
    status: "待实现",
    problem: "源文档或聊天上下文变化后，已确认图谱可能过期且用户无感知。",
    objective: "检测来源变化，判断受影响节点，并发起增量复核而非静默覆盖。",
    conditionSummary: "来源删除、修改和权限变化都会产生可追溯事件，并标记相关图谱对象待复核",
    children: [],
  },
  "G0.4.1": {
    id: "G0.4.1",
    title: "实现图谱存储与领域 API",
    level: 2,
    parentId: "G0.4",
    relation: "N4.1 · 必要条件",
    owner: "后端工程",
    status: "待实现",
    problem: "数据硬编码在 React 组件中，没有服务端事实源。",
    objective: "建立正式图谱存储、事务边界和领域 API。",
    conditionSummary: "创建、读取、修改、关联和删除均通过 API 完成，刷新页面后状态完整恢复",
    children: [],
  },
  "G0.4.2": {
    id: "G0.4.2",
    title: "实现图谱查询与索引",
    level: 2,
    parentId: "G0.4",
    relation: "N4.2 · 必要条件",
    owner: "数据工程",
    status: "待实现",
    problem: "依赖、祖先、后代、证据覆盖和影响范围目前由前端小数据临时计算。",
    objective: "支持层级、关系、全文、权限过滤和影响分析查询。",
    conditionSummary: "常用查询有明确语义和性能基线，结果在权限过滤前后均正确",
    children: [],
  },
  "G0.4.3": {
    id: "G0.4.3",
    title: "实现组织身份与细粒度权限",
    level: 2,
    parentId: "G0.4",
    relation: "N4.3 · 必要条件",
    owner: "安全工程",
    status: "待实现",
    problem: "当前所有用户默认看到并修改全部样例数据，不符合企业工作边界。",
    objective: "按组织、角色、图谱范围、对象类型和操作控制访问。",
    conditionSummary: "无权限内容只暴露允许的边界信息，读写越权均被服务端拒绝并记录",
    children: [],
  },
  "G0.4.4": {
    id: "G0.4.4",
    title: "实现版本、并发与审计",
    level: 2,
    parentId: "G0.4",
    relation: "N4.4 · 必要条件",
    owner: "平台工程",
    status: "待实现",
    problem: "没有乐观锁、版本差异、操作日志和冲突解决机制。",
    objective: "确保人和多个 Agent 并发修改时不静默覆盖，并可还原每次变化。",
    conditionSummary: "并发冲突可检测和处理，任一字段可追溯修改主体、依据、时间和前后版本",
    children: [],
  },
  "G0.5.1": {
    id: "G0.5.1",
    title: "建立 Agent 身份与能力注册",
    level: 2,
    parentId: "G0.5",
    relation: "N5.1 · 必要条件",
    owner: "Agent 平台",
    status: "待实现",
    problem: "系统不知道有哪些 Agent、它们能调用什么工具、拥有什么权限和质量记录。",
    objective: "维护 Agent 身份、能力、工具、权限、成本与历史表现。",
    conditionSummary: "每次委派可解释为何选择该 Agent，越权工具无法调用，能力变化可版本化",
    children: [],
  },
  "G0.5.2": {
    id: "G0.5.2",
    title: "实现规划、委派与状态回写",
    level: 2,
    parentId: "G0.5",
    relation: "N5.2 · 必要条件",
    owner: "编排 Agent",
    status: "待实现",
    problem: "当前没有真实任务队列和执行状态，Agent 不能领取或委派 Goal。",
    objective: "让 Agent 从图谱读取上下文，生成计划、领取工作并持续回写状态和产物。",
    conditionSummary: "委派链、输入版本、工具调用、阶段产物和最终结果完整记录且可重放",
    children: [],
  },
  "G0.5.3": {
    id: "G0.5.3",
    title: "实现 Agent 互审与冲突处理",
    level: 2,
    parentId: "G0.5",
    relation: "N5.3 · 必要条件",
    owner: "审查 Agent",
    status: "待实现",
    problem: "单个 Agent 的错误没有独立检查，多个 Agent 的分歧也没有正式处理机制。",
    objective: "对中风险推理和产物执行独立互审，并把分歧转成可处理问题。",
    conditionSummary: "审查者与执行者独立，支持与反驳都有证据，无法收敛时自动升级",
    children: [],
  },
  "G0.5.4": {
    id: "G0.5.4",
    title: "实现风险闸门与人类决策",
    level: 2,
    parentId: "G0.5",
    relation: "N5.4 · 必要条件",
    owner: "治理 Agent",
    status: "待确认",
    problem: "何时自动推进、互审或交给人决策尚无可执行策略。",
    objective: "按权限、影响、可逆性、成本、证据和分歧程度决定推进方式。",
    conditionSummary: "高影响、不可逆、越权和价值取舍事项不会被 Agent 自动执行，决策依据完整呈现",
    children: [],
  },
  "G0.5.5": {
    id: "G0.5.5",
    title: "实现失败恢复、成本与运行观测",
    level: 2,
    parentId: "G0.5",
    relation: "N5.5 · 必要条件",
    owner: "Agent SRE",
    status: "待实现",
    problem: "模型超时、工具失败、循环执行、成本失控和脏写目前没有防护。",
    objective: "让 Agent 运行可暂停、重试、回滚、限额和诊断。",
    conditionSummary: "失败不会破坏正式图谱，循环和预算超限被阻断，运行日志足以定位问题",
    children: [],
  },
  "G0.6.1": {
    id: "G0.6.1",
    title: "建立证据接入与可信度模型",
    level: 2,
    parentId: "G0.6",
    relation: "N6.1 · 必要条件",
    owner: "证据 Agent",
    status: "待实现",
    problem: "当前证据状态由 Goal 状态推测，没有真实文件、数据、日志或确认记录。",
    objective: "接入多类证据并记录来源、时间、权限、完整性和可信度。",
    conditionSummary: "证据内容可访问或可验证，过期、冲突、缺失和低可信证据被明确标记",
    children: [],
  },
  "G0.6.2": {
    id: "G0.6.2",
    title: "实现验收规则与结果判断",
    level: 2,
    parentId: "G0.6",
    relation: "N6.2 · 必要条件",
    owner: "验收 Agent",
    status: "待实现",
    problem: "系统没有可执行验收标准，动作完成容易被误认为目标达成。",
    objective: "把成功标准转成可计算或可人工判断的验收规则。",
    conditionSummary: "每个 Goal 都有验收对象、规则、证据和判定者，动作完成与目标达成分别记录",
    children: [],
  },
  "G0.6.3": {
    id: "G0.6.3",
    title: "实现 Review、Redo 与影响传播",
    level: 2,
    parentId: "G0.6",
    relation: "N6.3 · 必要条件",
    owner: "复盘 Agent",
    status: "待实现",
    problem: "当前 Redo 只生成新文案，不会使依赖旧推理的下游失效或重新执行。",
    objective: "从错误结果回溯输入和推理，生成新版本并传播影响。",
    conditionSummary: "Redo 前展示受影响对象，确认后旧结论保留历史但失效，相关下游进入待复核状态",
    children: [],
  },
  "G0.6.4": {
    id: "G0.6.4",
    title: "形成组织级复盘与知识沉淀",
    level: 2,
    parentId: "G0.6",
    relation: "N6.4 · 必要条件",
    owner: "知识 Agent",
    status: "待实现",
    problem: "知识库仍是独立展示页，尚不能从图谱事实、决策和复盘自动派生知识。",
    objective: "从已验收图谱生成可追溯的复盘、方法和阅读视图。",
    conditionSummary: "派生内容可回链原图谱，事实更新后能提示过期，不形成第二套事实源",
    children: [],
  },
  "G0.7.1": {
    id: "G0.7.1",
    title: "建立自动化测试与质量门",
    level: 2,
    parentId: "G0.7",
    relation: "N7.1 · 必要条件",
    owner: "质量工程",
    status: "开发中",
    problem: "当前只有 lint、类型检查和构建验证，缺少关键状态与用户流程的自动化测试。",
    objective: "覆盖领域规则、组件交互、核心流程和回归风险。",
    conditionSummary: "地图下钻、画布编辑、权限、并发、Agent 执行和 Review 回流均有自动化验证",
    children: [],
  },
  "G0.7.2": {
    id: "G0.7.2",
    title: "建立发布、监控与故障响应",
    level: 2,
    parentId: "G0.7",
    relation: "N7.2 · 必要条件",
    owner: "平台工程",
    status: "开发中",
    problem: "已有本地构建与在线预览路径，但没有正式环境、指标、告警、备份和恢复演练。",
    objective: "建立可重复发布、可观测运行和可恢复的数据保障。",
    conditionSummary: "发布可回滚，错误和延迟可观测，图谱数据有备份且恢复流程经过演练",
    children: [],
  },
  "G0.7.3": {
    id: "G0.7.3",
    title: "完成安全、隐私与提示注入防护",
    level: 2,
    parentId: "G0.7",
    relation: "N7.3 · 必要条件",
    owner: "安全工程",
    status: "待实现",
    problem: "材料接入和 Agent 工具调用会引入数据泄露、越权、提示注入和供应链风险。",
    objective: "在数据、模型、工具和日志各层建立安全边界与处置机制。",
    conditionSummary: "敏感数据不越权进入模型或日志，恶意材料不能改变系统权限，高风险工具调用可审计",
    children: [],
  },
  "G0.7.4": {
    id: "G0.7.4",
    title: "用 WorkGraph 完成 WorkGraph 真实闭环",
    level: 2,
    parentId: "G0.7",
    relation: "N7.4 · 验收条件",
    owner: "全体项目成员",
    status: "待验证",
    problem: "产品定位主要来自推演，尚未证明团队能放弃平行待办并在图谱中持续完成真实建设。",
    objective: "从本示例图谱选择一条真实需求，在系统内完成目标、推理、执行、证据、验收和复盘。",
    conditionSummary: "至少一条需求不依赖平行事实源完成全流程，参与者能追溯每个决策并指出产品真实阻塞",
    children: [],
  },
};

const allGoalIds = Object.keys(goals);

const canvasStages: { id: CanvasStage; label: string }[] = [
  { id: "goal", label: "目标" },
  { id: "conditions", label: "成立条件" },
  { id: "path", label: "路线" },
  { id: "execute", label: "执行" },
  { id: "verify", label: "验收" },
];

const workspaceViews: {
  id: WorkspaceView;
  label: string;
  icon: typeof Map;
}[] = [
  { id: "map", label: "地图", icon: Map },
  { id: "canvas", label: "画布", icon: PanelTop },
  { id: "dependencies", label: "依赖", icon: GitBranch },
  { id: "evidence", label: "证据", icon: FileCheck2 },
  { id: "monitor", label: "监控", icon: Activity },
  { id: "timeline", label: "时间线", icon: Clock3 },
];

const stageAgentMeta: Record<CanvasStage, { name: string; method: string }> = {
  goal: { name: "目标澄清 Agent", method: "歧义检测、结果化改写、边界识别" },
  conditions: { name: "成立条件 Agent", method: "反事实检验、失败模式分析、联合充分性审查" },
  path: { name: "路径规划 Agent", method: "条件覆盖、依赖排序、能力匹配" },
  execute: { name: "治理 Agent", method: "权限检查、风险分级、可逆性判断" },
  verify: { name: "验收 Agent", method: "证据核验、偏差判断、影响传播" },
};

const methodLibrary: Record<CanvasStage, MethodDefinition[]> = {
  goal: [
    {
      id: "smart",
      name: "SMART",
      summary: "检查目标是否具体、可衡量、可实现、相关且有时限。",
      source: "George T. Doran, Management Review, 1981",
      checks: ["具体", "可衡量", "可实现依据", "与上级相关", "有时限"],
    },
    {
      id: "okr",
      name: "OKR",
      summary: "用定性 Objective 表达方向，用可衡量 Key Results 判断是否实现。",
      source: "Google re:Work · Set goals with OKRs",
      sourceUrl: "https://rework.withgoogle.com/guides/set-goals-with-okrs/steps/introduction/",
      checks: ["目标有方向性", "结果可衡量", "结果而非任务", "数量保持聚焦"],
    },
    {
      id: "goal-contract",
      name: "目标契约",
      summary: "适合探索性目标：明确期望变化、边界、负责人、证据与上级关系。",
      source: "WorkGraph 产品方法 · 基于目标与验收约束组合",
      checks: ["期望变化", "范围边界", "责任主体", "验收证据", "上级关系"],
    },
  ],
  conditions: [
    {
      id: "counterfactual",
      name: "反事实检验",
      summary: "逐条删除候选条件，判断目标是否仍可能成立，从而识别必要条件。",
      source: "必要条件逻辑检验",
      checks: ["删除条件后目标失败", "条件不是具体方案", "条件之间不重复", "存在反例检查"],
    },
    {
      id: "fmea",
      name: "FMEA",
      summary: "从潜在失败模式、原因和影响反推必须建立的条件与控制措施。",
      source: "ASQ · Failure Mode and Effects Analysis",
      sourceUrl: "https://asq.org/quality-resources/fmea",
      checks: ["失败模式", "失败原因", "影响程度", "预防或检测措施"],
    },
  ],
  path: [
    {
      id: "coverage",
      name: "条件覆盖",
      summary: "确保每条必要条件都有一个可验收产物或子 Goal 承担。",
      source: "WorkGraph 条件覆盖模型",
      checks: ["无遗漏条件", "无孤立子目标", "产物可独立验收", "父子关系明确"],
    },
    {
      id: "wbs",
      name: "WBS",
      summary: "按可交付成果分解工作，并检查层级是否覆盖完整范围。",
      source: "PMI · Work Breakdown Structure",
      sourceUrl: "https://www.pmi.org/learning/library/work-breakdown-structure-basics-5919",
      checks: ["按产物分解", "覆盖完整范围", "层级互不重叠", "叶子可执行"],
    },
  ],
  execute: [
    {
      id: "raci",
      name: "RACI",
      summary: "明确负责、最终负责、咨询和知会角色，避免责任空白或多头负责。",
      source: "责任分配矩阵（RACI）",
      checks: ["唯一最终负责人", "执行负责人", "咨询对象", "知会对象"],
    },
    {
      id: "risk-gate",
      name: "风险闸门",
      summary: "按权限、影响、可逆性和证据充分度决定自动推进、互审或人工决策。",
      source: "WorkGraph 风险治理模型",
      checks: ["权限内", "影响可控", "操作可逆", "证据充分"],
    },
  ],
  verify: [
    {
      id: "vv",
      name: "Verification / Validation",
      summary: "分别检查产物是否按要求构建，以及它是否真正满足目标用途。",
      source: "NASA Systems Engineering Handbook",
      sourceUrl: "https://www.nasa.gov/wp-content/uploads/2018/09/nasa_systems_engineering_handbook_0.pdf",
      checks: ["要求可验证", "产物符合要求", "满足真实用途", "证据可追溯"],
    },
    {
      id: "review-redo",
      name: "Review / Redo",
      summary: "审查结果与推理；失败时定位错误起点并计算下游影响。",
      source: "WorkGraph 回流模型",
      checks: ["结果证据", "推理证据", "偏差起点", "下游影响"],
    },
  ],
};

export function GrandWorkGraph() {
  const persistedWorkspace = useMemo(loadWorkspace, []);
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>("map");
  const [focusedId, setFocusedId] = useState("G0");
  const [selectedChildId, setSelectedChildId] = useState<string | null>(null);
  const [reviewedGoals, setReviewedGoals] = useState<string[]>([]);
  const [stageByGoal, setStageByGoal] = useState<Record<string, CanvasStage>>({});
  const [drafts, setDrafts] = useState<StageDrafts>(persistedWorkspace.drafts);
  const [agentRequests, setAgentRequests] = useState<StageDrafts>({});
  const [agentSuggestions, setAgentSuggestions] = useState<StageDrafts>({});
  const [agentProposals, setAgentProposals] = useState<Record<string, AgentProposal>>({});
  const [agentErrors, setAgentErrors] = useState<StageDrafts>({});
  const [agentLoadingKey, setAgentLoadingKey] = useState<string | null>(null);
  const [confirmedDrafts, setConfirmedDrafts] = useState<string[]>(
    persistedWorkspace.confirmedDrafts,
  );
  const [methodByStage, setMethodByStage] = useState<Record<string, string>>(
    persistedWorkspace.methodByStage,
  );
  const [versions, setVersions] = useState<WorkspaceVersion[]>(
    persistedWorkspace.versions,
  );

  const focused = goals[focusedId] ?? goals.G0;
  const path = useMemo(() => getGoalPath(focused.id), [focused.id]);
  const selectedChild = selectedChildId ? goals[selectedChildId] : null;
  const reviewed = reviewedGoals.includes(focused.id);
  const activeStage = stageByGoal[focused.id] ?? "goal";
  const collaborationKey = `${focused.id}:${activeStage}`;
  const availableMethods = methodLibrary[activeStage];
  const selectedMethod =
    availableMethods.find(
      (method) => method.id === methodByStage[collaborationKey],
    ) ?? availableMethods[0];
  const draft = drafts[collaborationKey] ?? getInitialDraft(focused, activeStage);
  const confirmed = confirmedDrafts.includes(collaborationKey);
  const currentProposal = agentProposals[collaborationKey];
  const latestVersion = [...versions]
    .reverse()
    .find((version) => version.key === collaborationKey);

  useEffect(() => {
    window.localStorage.setItem(
      workspaceStorageKey,
      JSON.stringify({ drafts, confirmedDrafts, methodByStage, versions }),
    );
  }, [confirmedDrafts, drafts, methodByStage, versions]);

  const focusGoal = (id: string) => {
    if (id !== focusedId) {
      setStageByGoal((current) => ({ ...current, [id]: "goal" }));
    }
    setFocusedId(id);
    setSelectedChildId(null);
  };

  const openGoalCanvas = (id: string) => {
    focusGoal(id);
    setWorkspaceView("canvas");
  };

  const openGoalCanvasAtStage = (id: string, stage: CanvasStage) => {
    setFocusedId(id);
    setSelectedChildId(null);
    setStageByGoal((current) => ({ ...current, [id]: stage }));
    setWorkspaceView("canvas");
  };

  const toggleReviewed = () => {
    setReviewedGoals((current) =>
      current.includes(focused.id)
        ? current.filter((id) => id !== focused.id)
        : [...current, focused.id],
    );
  };

  const askAgent = async (instruction: string) => {
    setAgentLoadingKey(collaborationKey);
    setAgentErrors((current) => ({ ...current, [collaborationKey]: "" }));
    try {
      const parent = focused.parentId ? goals[focused.parentId] : undefined;
      const proposal = await requestAgentProposal({
        goal: {
          id: focused.id,
          title: focused.title,
          problem: focused.problem,
          objective: focused.objective,
          acceptance: focused.conditionSummary,
          parent: parent ? `${parent.id} ${parent.title}` : undefined,
          children: focused.children.map((id) => ({
            id,
            title: goals[id].title,
            relation: goals[id].relation,
          })),
        },
        stage: canvasStages.find((stage) => stage.id === activeStage)?.label ?? activeStage,
        method: {
          name: selectedMethod.name,
          summary: selectedMethod.summary,
          checks: selectedMethod.checks,
        },
        currentDraft: draft,
        instruction,
      });
      setAgentProposals((current) => ({ ...current, [collaborationKey]: proposal }));
      setAgentSuggestions((current) => ({
        ...current,
        [collaborationKey]: proposal.proposedDraft,
      }));
    } catch (error) {
      setAgentErrors((current) => ({
        ...current,
        [collaborationKey]:
          error instanceof Error ? error.message : "Agent 请求失败",
      }));
    } finally {
      setAgentLoadingKey(null);
    }
  };

  const confirmDraft = () => {
    const savedAt = new Date().toISOString();
    setDrafts((current) => ({ ...current, [collaborationKey]: draft }));
    setConfirmedDrafts((current) =>
      current.includes(collaborationKey)
        ? current
        : [...current, collaborationKey],
    );
    setVersions((current) => [
      ...current,
      { key: collaborationKey, draft, savedAt },
    ]);
  };

  return (
    <main className="flex min-h-[760px] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm">
      <CanvasToolbar
        focused={focused}
        onFocus={focusGoal}
        path={path}
      />

      <section
        aria-label={`工作图谱${workspaceViews.find((view) => view.id === workspaceView)?.label ?? ""}视图`}
        className="relative min-h-0 flex-1 overflow-auto bg-slate-100 p-4"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(100,116,139,.18) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        <div className="flex min-w-[820px] items-start gap-3">
          <div className="min-w-0 flex-1">
            {workspaceView === "map" ? (
              <GoalMapView
                focused={focused}
                onEnter={focusGoal}
                onOpen={openGoalCanvas}
              />
            ) : null}
            {workspaceView === "dependencies" ? (
              <DependencyView
                focused={focused}
                onFocus={focusGoal}
                onOpen={openGoalCanvas}
              />
            ) : null}
            {workspaceView === "timeline" ? (
              <TimelineView focused={focused} onOpen={openGoalCanvas} />
            ) : null}
            {workspaceView === "evidence" ? (
              <EvidenceView
                focusedId={focused.id}
                onFocus={focusGoal}
                onOpen={(id) => openGoalCanvasAtStage(id, "verify")}
              />
            ) : null}
            {workspaceView === "monitor" ? (
              <MonitorView
                focusedId={focused.id}
                onFocus={focusGoal}
                onOpen={(id) => openGoalCanvasAtStage(id, "execute")}
              />
            ) : null}
            {workspaceView === "canvas" ? (
              <GoalCanvas
              focused={focused}
              activeStage={activeStage}
              reviewed={reviewed}
              selectedChildId={selectedChildId}
              onStageChange={(stage) =>
                setStageByGoal((current) => ({ ...current, [focused.id]: stage }))
              }
              agentRequest={agentRequests[collaborationKey] ?? ""}
              agentSuggestion={agentSuggestions[collaborationKey] ?? ""}
              agentError={agentErrors[collaborationKey] ?? ""}
              agentLoading={agentLoadingKey === collaborationKey}
              agentProposal={currentProposal}
              availableMethods={availableMethods}
              confirmed={confirmed}
              draft={draft}
              latestSavedAt={latestVersion?.savedAt}
              selectedMethod={selectedMethod}
              onAgentRequestChange={(value) =>
                setAgentRequests((current) => ({ ...current, [collaborationKey]: value }))
              }
              onAskAgent={() =>
                askAgent(
                  agentRequests[collaborationKey] ||
                    "请审查当前草稿，修正问题并补充缺失信息；不确定内容标记为待确认。",
                )
              }
              onMethodChange={(methodId) => {
                setMethodByStage((current) => ({
                  ...current,
                  [collaborationKey]: methodId,
                }));
                setAgentSuggestions((current) => ({ ...current, [collaborationKey]: "" }));
                setAgentProposals((current) => {
                  const next = { ...current };
                  delete next[collaborationKey];
                  return next;
                });
                setConfirmedDrafts((current) =>
                  current.filter((key) => key !== collaborationKey),
                );
              }}
              onApplySuggestion={() => {
                const suggestion = agentSuggestions[collaborationKey];
                if (!suggestion) return;
                setDrafts((current) => ({ ...current, [collaborationKey]: suggestion }));
                setConfirmedDrafts((current) =>
                  current.filter((key) => key !== collaborationKey),
                );
              }}
              onConfirmDraft={confirmDraft}
              onDraftChange={(value) => {
                setDrafts((current) => ({ ...current, [collaborationKey]: value }));
                setConfirmedDrafts((current) =>
                  current.filter((key) => key !== collaborationKey),
                );
              }}
              onRedo={() => {
                void askAgent("不要沿用上一版方案。换一种思路，重点检查遗漏、反例和不成立条件。");
                setConfirmedDrafts((current) =>
                  current.filter((key) => key !== collaborationKey),
                );
              }}
              onReview={toggleReviewed}
              onSelectChild={setSelectedChildId}
              onZoom={openGoalCanvas}
              />
            ) : null}
          </div>
          <ViewRail activeView={workspaceView} onChange={setWorkspaceView} />
        </div>
      </section>

      {workspaceView === "canvas" ? (
        <CanvasSelection
          focused={focused}
          selected={selectedChild}
          onClear={() => setSelectedChildId(null)}
          onZoom={openGoalCanvas}
        />
      ) : (
        <ViewStatusBar focused={focused} view={workspaceView} />
      )}
    </main>
  );
}

function CanvasToolbar({
  focused,
  onFocus,
  path,
}: {
  focused: GoalNode;
  onFocus: (id: string) => void;
  path: GoalNode[];
}) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-4 px-4 py-3">
        <div className="flex shrink-0 items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-slate-950 text-cyan-300">
            <Network className="h-4 w-4" />
          </span>
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Goal Directory</p>
            <p className="text-xs font-semibold text-slate-900">目标目录</p>
          </div>
        </div>

        <nav aria-label="当前目标层级" className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {path.map((node, index) => (
            <div className="flex items-center gap-1" key={node.id}>
              {index > 0 ? <ChevronRight className="h-4 w-4 text-slate-300" /> : null}
              <button
                aria-current={node.id === focused.id ? "page" : undefined}
                className={`rounded-md px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 ${
                  node.id === focused.id
                    ? "bg-cyan-50 text-cyan-950 ring-1 ring-cyan-200"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                }`}
                onClick={() => onFocus(node.id)}
                type="button"
              >
                <span className="block font-mono text-[8px] font-bold text-cyan-700">{node.id}</span>
                <span className="block max-w-52 truncate text-xs font-semibold">{node.title}</span>
              </button>
            </div>
          ))}
        </nav>

        <label className="relative">
          <span className="sr-only">跳转到指定目标</span>
          <select
            className="h-9 max-w-72 appearance-none truncate rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-100"
            onChange={(event) => onFocus(event.target.value)}
            value={focused.id}
          >
            {allGoalIds.map((id) => (
              <option key={id} value={id}>
                L{goals[id].level} · {id} · {goals[id].title}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
        </label>
      </div>

      <nav aria-label="当前目标的直接下级" className="flex min-w-0 items-center gap-2 overflow-x-auto border-t border-slate-100 bg-slate-50 px-4 py-2">
        <span className="shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          下一级
        </span>
        {focused.children.length > 0 ? (
          focused.children.map((childId) => {
            const child = goals[childId];
            return (
            <button
              className="inline-flex min-h-8 shrink-0 items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 text-[10px] text-slate-600 transition hover:border-cyan-400 hover:text-cyan-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
              key={child.id}
              onClick={() => onFocus(child.id)}
              type="button"
            >
              <span className="font-mono font-bold text-cyan-700">{child.id}</span>
              <span className="font-semibold">{child.title}</span>
              <ChevronRight className="h-3 w-3 text-slate-300" />
            </button>
            );
          })
        ) : (
          <span className="text-[10px] text-slate-400">当前是叶子 Goal，没有直接下级</span>
        )}
      </nav>
    </header>
  );
}

function ViewRail({
  activeView,
  onChange,
}: {
  activeView: WorkspaceView;
  onChange: (view: WorkspaceView) => void;
}) {
  return (
    <aside className="sticky top-0 w-16 shrink-0 rounded-lg border border-slate-300 bg-white shadow-sm">
      <p className="border-b border-slate-200 py-2 text-center text-[8px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        视图
      </p>
      <nav aria-label="切换工作图谱视图" className="p-1">
        {workspaceViews.map((view) => {
          const Icon = view.icon;
          const active = view.id === activeView;
          return (
            <button
              aria-label={`${view.label}视图`}
              aria-pressed={active}
              className={`flex h-12 w-14 flex-col items-center justify-center gap-1 rounded-md transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 ${
                active
                  ? "bg-slate-950 text-white"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-900"
              }`}
              key={view.id}
              onClick={() => onChange(view.id)}
              title={view.label}
              type="button"
            >
              <Icon className="h-4 w-4" />
              <span className="text-[8px] font-semibold">{view.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

function GoalMapView({
  focused,
  onEnter,
  onOpen,
}: {
  focused: GoalNode;
  onEnter: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const firstLevel = focused.children.map((id) => goals[id]);
  const attentionCount = allGoalIds.filter((id) =>
    ["待确认", "待实现", "待验证"].includes(goals[id].status),
  ).length;
  const depth = Math.max(...allGoalIds.map((id) => goals[id].level)) + 1;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-300 bg-[#f8faf9] shadow-sm">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 bg-white px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
            <Map className="h-3.5 w-3.5" />
            Goal Map
          </div>
          <h1 className="mt-1 text-lg font-semibold text-slate-950">
            {focused.id} · {focused.title}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            当前以此 Goal 为地图根节点。进入下一级仍留在地图，只有明确编辑时才切换画布。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <span><strong className="text-slate-900">{allGoalIds.length}</strong> 个 Goal</span>
            <span><strong className="text-amber-700">{attentionCount}</strong> 个需关注</span>
            <span><strong className="text-cyan-700">{depth}</strong> 层深度</span>
          </div>
          <button
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-cyan-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
            onClick={() => onOpen(focused.id)}
            type="button"
          >
            <PanelTop className="h-3.5 w-3.5" />
            编辑当前 Goal
          </button>
        </div>
      </header>

      <div className="overflow-x-auto px-5 py-6">
        <div className="mx-auto min-w-[1180px] max-w-[1500px]">
          <div className="grid grid-cols-[72px_1fr] gap-4">
            <MapLaneLabel label={`L${focused.level}`} detail="当前层" />
            <div className="flex justify-center">
              <MapGoalNode
                focused
                goal={focused}
                onEnter={onEnter}
                onOpen={onOpen}
                root
              />
            </div>

            <MapLaneLabel label={`L${focused.level + 1}`} detail="直接下级" />
            {firstLevel.length > 0 ? (
              <div className="relative pt-12">
                <div className="absolute left-[10%] right-[10%] top-5 h-px bg-slate-400" />
                <div className="absolute left-1/2 top-0 h-5 w-px bg-slate-400" />
                <div
                  className="grid gap-3"
                  style={{ gridTemplateColumns: `repeat(${firstLevel.length}, minmax(190px, 1fr))` }}
                >
                  {firstLevel.map((goal) => (
                    <div className="relative pt-4" key={goal.id}>
                      <div className="absolute left-1/2 top-0 h-4 w-px bg-slate-400" />
                      <MapRelationLabel label={goal.relation ?? "支撑"} />
                      <MapGoalNode
                        focused={false}
                        goal={goal}
                        onEnter={onEnter}
                        onOpen={onOpen}
                      />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid min-h-32 place-items-center rounded-lg border border-dashed border-slate-300 bg-white/60">
                <div className="text-center">
                  <CircleDot className="mx-auto h-5 w-5 text-slate-300" />
                  <p className="mt-2 text-xs font-semibold text-slate-600">当前是叶子 Goal</p>
                  <p className="mt-1 text-[10px] text-slate-400">可以编辑执行，也可以继续推导下一级</p>
                </div>
              </div>
            )}

            <MapLaneLabel label={`L${focused.level + 2}`} detail="下级预览" />
            <div
              className="grid gap-3 border-t border-dashed border-slate-300 pt-6"
              style={{ gridTemplateColumns: `repeat(${Math.max(firstLevel.length, 1)}, minmax(190px, 1fr))` }}
            >
              {firstLevel.length > 0 ? firstLevel.map((parent) => (
                <div className="relative" key={parent.id}>
                  {parent.children.length > 0 ? (
                    <div className="space-y-3">
                      {parent.children.map((childId, index) => {
                        const child = goals[childId];
                        return (
                          <div className="relative pl-4" key={child.id}>
                            <div
                              className={`absolute left-0 top-0 w-px bg-slate-300 ${
                                index === parent.children.length - 1 ? "h-1/2" : "h-[calc(100%+12px)]"
                              }`}
                            />
                            <div className="absolute left-0 top-1/2 h-px w-4 bg-slate-300" />
                            <MapRelationLabel label={child.relation ?? "支撑"} compact />
                            <MapGoalNode
                              focused={false}
                              goal={child}
                              onEnter={onEnter}
                              onOpen={onOpen}
                              small
                            />
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid min-h-28 place-items-center rounded-lg border border-dashed border-slate-200 bg-white/50 text-[10px] text-slate-400">
                      尚未展开下一层
                    </div>
                  )}
                </div>
              )) : (
                <div className="py-4 text-center text-[10px] text-slate-400">没有更深层级</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function MapLaneLabel({ detail, label }: { detail: string; label: string }) {
  return (
    <div className="border-r border-slate-200 pr-3 pt-2 text-right">
      <p className="font-mono text-xs font-bold text-slate-800">{label}</p>
      <p className="mt-1 text-[9px] text-slate-400">{detail}</p>
    </div>
  );
}

function MapRelationLabel({
  compact = false,
  label,
}: {
  compact?: boolean;
  label: string;
}) {
  return (
    <span
      className={`mb-1.5 inline-flex rounded border border-cyan-200 bg-cyan-50 font-semibold text-cyan-800 ${
        compact ? "px-1.5 py-0.5 text-[8px]" : "px-2 py-1 text-[9px]"
      }`}
    >
      {label}
    </span>
  );
}

function MapGoalNode({
  focused,
  goal,
  onEnter,
  onOpen,
  root = false,
  small = false,
}: {
  focused: boolean;
  goal: GoalNode;
  onEnter: (id: string) => void;
  onOpen: (id: string) => void;
  root?: boolean;
  small?: boolean;
}) {
  return (
    <article
      className={`group relative overflow-hidden rounded-lg border bg-white transition ${
        focused
          ? "border-cyan-600 shadow-[0_0_0_3px_rgba(8,145,178,.14)]"
          : "border-slate-300 hover:border-slate-500 hover:shadow-md"
      } ${root ? "w-[360px]" : "w-full"} ${small ? "min-h-28" : "min-h-36"}`}
    >
      <button
        className="block w-full p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-cyan-600"
        onClick={() => onEnter(goal.id)}
        type="button"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[9px] font-bold text-cyan-700">{goal.id}</span>
          <GoalStatus status={goal.status} />
        </div>
        <h2 className={`mt-2 font-semibold leading-5 text-slate-950 ${root ? "text-base" : "text-xs"}`}>
          {goal.title}
        </h2>
        <p className={`mt-1.5 text-slate-500 ${small ? "line-clamp-2 text-[9px] leading-4" : "line-clamp-3 text-[10px] leading-4"}`}>
          <span className="font-semibold text-rose-700">问题 · </span>
          {goal.problem}
        </p>
      </button>
      <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-2">
        <span className="truncate text-[9px] text-slate-400">{goal.owner}</span>
        <div className="flex items-center gap-2">
          {!root ? (
            <button
              className="inline-flex items-center gap-1 text-[9px] font-semibold text-cyan-700 hover:text-cyan-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
              onClick={() => onEnter(goal.id)}
              type="button"
            >
              进入此层
              <ArrowRight className="h-3 w-3" />
            </button>
          ) : (
            <span className="text-[9px] font-semibold text-cyan-700">当前层</span>
          )}
          <button
            aria-label={`编辑${goal.title}`}
            className="grid h-6 w-6 place-items-center rounded border border-slate-200 text-slate-400 hover:border-cyan-400 hover:text-cyan-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
            onClick={() => onOpen(goal.id)}
            title="编辑 Goal"
            type="button"
          >
            <PanelTop className="h-3 w-3" />
          </button>
        </div>
      </div>
    </article>
  );
}

function GoalStatus({ status }: { status: string }) {
  const tone =
    status === "原型已实现"
      ? "bg-emerald-100 text-emerald-700"
      : status === "开发中"
        ? "bg-blue-100 text-blue-700"
      : status === "待确认"
        ? "bg-amber-100 text-amber-800"
        : status === "设计中"
          ? "bg-cyan-100 text-cyan-800"
          : status === "待验证"
            ? "bg-violet-100 text-violet-700"
          : "bg-slate-100 text-slate-500";
  return <span className={`rounded px-1.5 py-0.5 text-[8px] font-semibold ${tone}`}>{status}</span>;
}

function DependencyView({
  focused,
  onFocus,
  onOpen,
}: {
  focused: GoalNode;
  onFocus: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const parent = focused.parentId ? goals[focused.parentId] : null;
  const children = focused.children.map((id) => goals[id]);

  return (
    <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <header className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
          <GitBranch className="h-3.5 w-3.5" />
          Dependency
        </div>
        <h1 className="mt-1 text-lg font-semibold text-slate-950">当前 Goal 的上下游依赖</h1>
        <p className="mt-1 text-xs text-slate-500">左侧解释它为什么存在，右侧展示它依赖哪些下级结果成立。</p>
      </header>

      <div className="grid min-h-[560px] grid-cols-[1fr_72px_1.2fr_72px_1.4fr] items-center gap-3 bg-slate-50 p-6">
        <DependencyColumn label="上游目标">
          {parent ? (
            <DependencyNode goal={parent} onClick={onFocus} />
          ) : (
            <DependencyEmpty text="这是根目标，没有上游 Goal" />
          )}
          <DependencyFact label="来源关系" value={focused.relation ?? "组织根目标"} />
        </DependencyColumn>

        <DependencyArrow label="产生" />

        <div className="rounded-xl border-2 border-slate-900 bg-slate-950 p-5 text-white shadow-xl">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-cyan-300">{focused.id}</span>
            <GoalStatus status={focused.status} />
          </div>
          <h2 className="mt-3 text-xl font-semibold">{focused.title}</h2>
          <p className="mt-2 text-xs leading-5 text-slate-300">{focused.objective}</p>
          <div className="mt-4 border-t border-slate-700 pt-3 text-[10px] text-slate-400">
            成立判断：{focused.conditionSummary}
          </div>
          <button
            className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-md bg-cyan-300 px-3 text-xs font-semibold text-slate-950 hover:bg-cyan-200"
            onClick={() => onOpen(focused.id)}
            type="button"
          >
            在画布中处理
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        <DependencyArrow label="依赖" />

        <DependencyColumn label="直接下游">
          {children.length > 0 ? (
            children.map((child) => (
              <div className="grid grid-cols-[90px_1fr] items-center gap-2" key={child.id}>
                <span className="text-right text-[9px] font-semibold text-cyan-700">{child.relation}</span>
                <DependencyNode goal={child} onClick={onFocus} />
              </div>
            ))
          ) : (
            <DependencyEmpty text="当前是叶子 Goal，下一步应进入执行或继续拆解" />
          )}
        </DependencyColumn>
      </div>
    </section>
  );
}

function DependencyColumn({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div>
      <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function DependencyNode({ goal, onClick }: { goal: GoalNode; onClick: (id: string) => void }) {
  return (
    <button
      className="w-full rounded-lg border border-slate-300 bg-white p-3 text-left shadow-sm transition hover:border-cyan-500 hover:shadow-md"
      onClick={() => onClick(goal.id)}
      type="button"
    >
      <span className="font-mono text-[9px] font-bold text-cyan-700">{goal.id}</span>
      <span className="ml-2 text-xs font-semibold text-slate-900">{goal.title}</span>
    </button>
  );
}

function DependencyFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">{label}</p>
      <p className="mt-1 text-xs text-slate-700">{value}</p>
    </div>
  );
}

function DependencyEmpty({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-slate-300 bg-white/60 p-4 text-center text-[10px] leading-5 text-slate-400">{text}</div>;
}

function DependencyArrow({ label }: { label: string }) {
  return (
    <div className="text-center">
      <p className="text-[9px] font-semibold text-slate-400">{label}</p>
      <div className="mt-2 flex items-center">
        <span className="h-px flex-1 bg-slate-400" />
        <ArrowRight className="h-4 w-4 text-slate-500" />
      </div>
    </div>
  );
}

function EvidenceView({
  focusedId,
  onFocus,
  onOpen,
}: {
  focusedId: string;
  onFocus: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-rose-700">
            <FileCheck2 className="h-3.5 w-3.5" />
            Evidence & Review
          </div>
          <h1 className="mt-1 text-lg font-semibold text-slate-950">证据覆盖与回流风险</h1>
          <p className="mt-1 text-xs text-slate-500">区分“已经完成”与“已有证据证明完成”，并标出需要 Review 的节点。</p>
        </div>
        <div className="flex gap-2 text-[10px]">
          <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">1 个执行证据待核验</span>
          <span className="rounded bg-amber-50 px-2 py-1 text-amber-800">2 个推理节点待审查</span>
        </div>
      </header>

      <div className="grid grid-cols-[120px_minmax(220px,1fr)_minmax(240px,1.2fr)_120px_100px] border-b border-slate-200 bg-slate-50 px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        <span>Goal</span>
        <span>目标</span>
        <span>预期证据</span>
        <span>证据状态</span>
        <span>操作</span>
      </div>
      <div className="divide-y divide-slate-100">
        {allGoalIds.map((id) => {
          const goal = goals[id];
          const evidenceState =
            goal.status === "原型已实现"
              ? "原型证据"
              : goal.status === "开发中" || goal.status === "待验证"
              ? "待核验"
              : goal.status === "待确认"
                ? "待人确认"
                : goal.status === "设计中"
                  ? "推理待审"
                  : "尚未产生";
          const tone =
            evidenceState === "原型证据"
              ? "bg-emerald-50 text-emerald-700"
              : evidenceState === "待核验"
                ? "bg-violet-50 text-violet-700"
              : evidenceState === "待人确认" || evidenceState === "推理待审"
                ? "bg-amber-50 text-amber-800"
                : "bg-slate-100 text-slate-500";

          return (
            <article
              className={`grid min-h-14 grid-cols-[120px_minmax(220px,1fr)_minmax(240px,1.2fr)_120px_100px] items-center px-4 py-2 ${
                focusedId === id ? "bg-cyan-50" : "bg-white hover:bg-slate-50"
              }`}
              key={id}
            >
              <button className="text-left font-mono text-[10px] font-bold text-cyan-700" onClick={() => onFocus(id)} type="button">
                {id}
              </button>
              <div>
                <p className="text-xs font-semibold text-slate-900">{goal.title}</p>
                <p className="mt-0.5 text-[9px] text-slate-400">{goal.owner}</p>
              </div>
              <p className="pr-5 text-[10px] leading-4 text-slate-600">{goal.conditionSummary}</p>
              <span className={`w-fit rounded px-2 py-1 text-[9px] font-semibold ${tone}`}>{evidenceState}</span>
              <button
                className="text-[10px] font-semibold text-cyan-700 hover:underline"
                onClick={() => onOpen(id)}
                type="button"
              >
                打开验收
              </button>
            </article>
          );
        })}
      </div>
      <footer className="border-t border-rose-100 bg-rose-50 px-4 py-3 text-[10px] text-rose-800">
        “原型证据”只证明前端交互已出现，不代表后端、Agent、权限或真实验收能力已经完成。
      </footer>
    </section>
  );
}

function MonitorView({
  focusedId,
  onFocus,
  onOpen,
}: {
  focusedId: string;
  onFocus: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  const lanes = [
    { label: "原型已实现", statuses: ["原型已实现"], dotClass: "bg-emerald-500" },
    { label: "设计与确认", statuses: ["设计中", "待确认"], dotClass: "bg-cyan-500" },
    { label: "开发中", statuses: ["开发中"], dotClass: "bg-blue-500" },
    { label: "待实现", statuses: ["待实现"], dotClass: "bg-slate-500" },
    { label: "待验证", statuses: ["待验证"], dotClass: "bg-violet-500" },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700">
            <Activity className="h-3.5 w-3.5" />
            Agent Monitor
          </div>
          <h1 className="mt-1 text-lg font-semibold text-slate-950">Agent 执行监控</h1>
          <p className="mt-1 text-xs text-slate-500">按运行状态聚合 Goal，快速定位停滞、执行和需要人介入的工作。</p>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-500">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          原型状态流正常
        </div>
      </header>

      <div className="grid min-h-[560px] grid-cols-5 gap-3 bg-slate-100 p-4">
        {lanes.map((lane) => {
          const laneGoals = allGoalIds
            .map((id) => goals[id])
            .filter((goal) => lane.statuses.includes(goal.status));
          return (
            <section className="rounded-lg border border-slate-200 bg-slate-50" key={lane.label}>
              <header className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${lane.dotClass}`} />
                  <h2 className="text-xs font-semibold text-slate-800">{lane.label}</h2>
                </div>
                <span className="rounded bg-white px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{laneGoals.length}</span>
              </header>
              <div className="space-y-2 p-2">
                {laneGoals.map((goal) => (
                  <article
                    className={`rounded-md border bg-white p-3 shadow-sm ${
                      focusedId === goal.id ? "border-cyan-500 ring-2 ring-cyan-100" : "border-slate-200"
                    }`}
                    key={goal.id}
                  >
                    <button className="block w-full text-left" onClick={() => onFocus(goal.id)} type="button">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[9px] font-bold text-cyan-700">{goal.id}</span>
                        <GoalStatus status={goal.status} />
                      </div>
                      <h3 className="mt-2 text-xs font-semibold leading-5 text-slate-900">{goal.title}</h3>
                      <p className="mt-1 text-[9px] text-slate-400">{goal.owner}</p>
                    </button>
                    <button
                      className="mt-3 inline-flex items-center gap-1 text-[9px] font-semibold text-cyan-700 hover:underline"
                      onClick={() => onOpen(goal.id)}
                      type="button"
                    >
                      查看工作现场
                      <ArrowRight className="h-3 w-3" />
                    </button>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function TimelineView({
  focused,
  onOpen,
}: {
  focused: GoalNode;
  onOpen: (id: string) => void;
}) {
  const events = [
    {
      label: "目标",
      title: `${focused.id} ${focused.title} 被提出`,
      detail: focused.objective,
      actor: focused.level === 0 ? "产品负责人" : "上级 Goal 推导",
      state: "完成",
    },
    {
      label: "成立条件",
      title: "Agent 生成候选必要条件",
      detail: focused.conditionSummary,
      actor: "成立条件 Agent",
      state: focused.status === "待启动" ? "待开始" : "完成",
    },
    {
      label: "路线",
      title: focused.children.length > 0 ? `生成 ${focused.children.length} 个直接子 Goal` : "尚未形成下级路线",
      detail: focused.children.length > 0 ? focused.children.map((id) => goals[id].title).join("、") : "需判断可直接执行，还是继续拆解。",
      actor: "路径规划 Agent",
      state: focused.children.length > 0 ? "完成" : "待开始",
    },
    {
      label: "执行",
      title: `${focused.owner} 承接当前 Goal`,
      detail: "在权限和风险边界内推进，异常事项升级处理。",
      actor: focused.owner,
      state: focused.status,
    },
    {
      label: "验收",
      title: "证据回流并更新父级支撑状态",
      detail: focused.conditionSummary,
      actor: "验收 Agent + 人类负责人",
      state: focused.status === "待确认" ? "待处理" : "未到达",
    },
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <header className="flex items-end justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">
            <Clock3 className="h-3.5 w-3.5" />
            Timeline
          </div>
          <h1 className="mt-1 text-lg font-semibold text-slate-950">{focused.id} 的演进记录</h1>
          <p className="mt-1 text-xs text-slate-500">这里呈现状态如何产生，不只记录最后结果。</p>
        </div>
        <button
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-cyan-800"
          onClick={() => onOpen(focused.id)}
          type="button"
        >
          打开画布
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="mx-auto max-w-4xl px-8 py-8">
        {events.map((event, index) => (
          <article className="relative grid grid-cols-[100px_28px_1fr] gap-4 pb-8 last:pb-0" key={event.label}>
            <div className="pt-1 text-right">
              <p className="text-xs font-semibold text-slate-800">{event.label}</p>
              <p className="mt-1 text-[9px] text-slate-400">阶段 {index + 1}</p>
            </div>
            <div className="relative flex justify-center">
              {index < events.length - 1 ? <div className="absolute bottom-[-32px] top-4 w-px bg-slate-300" /> : null}
              <span className={`relative z-10 mt-1 h-3 w-3 rounded-full border-2 border-white ring-2 ${
                event.state === "完成" ? "bg-emerald-500 ring-emerald-200" : "bg-slate-300 ring-slate-200"
              }`} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-950">{event.title}</h2>
                <span className="rounded bg-white px-2 py-1 text-[9px] font-semibold text-slate-500">{event.state}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">{event.detail}</p>
              <p className="mt-3 text-[9px] text-slate-400">参与者：{event.actor}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ViewStatusBar({
  focused,
  view,
}: {
  focused: GoalNode;
  view: WorkspaceView;
}) {
  const label = workspaceViews.find((item) => item.id === view)?.label ?? "";
  return (
    <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2.5 text-[11px] text-slate-400">
      <span>当前视图：{label}</span>
      <span>当前焦点：{focused.id} · {focused.title}</span>
    </footer>
  );
}

function GoalCanvas({
  focused,
  activeStage,
  agentError,
  agentLoading,
  agentProposal,
  agentRequest,
  agentSuggestion,
  availableMethods,
  confirmed,
  draft,
  latestSavedAt,
  selectedMethod,
  reviewed,
  selectedChildId,
  onAgentRequestChange,
  onApplySuggestion,
  onAskAgent,
  onConfirmDraft,
  onDraftChange,
  onMethodChange,
  onRedo,
  onReview,
  onSelectChild,
  onStageChange,
  onZoom,
}: {
  focused: GoalNode;
  activeStage: CanvasStage;
  agentError: string;
  agentLoading: boolean;
  agentProposal?: AgentProposal;
  agentRequest: string;
  agentSuggestion: string;
  availableMethods: MethodDefinition[];
  confirmed: boolean;
  draft: string;
  latestSavedAt?: string;
  selectedMethod: MethodDefinition;
  reviewed: boolean;
  selectedChildId: string | null;
  onAgentRequestChange: (value: string) => void;
  onApplySuggestion: () => void;
  onAskAgent: () => void;
  onConfirmDraft: () => void;
  onDraftChange: (value: string) => void;
  onMethodChange: (methodId: string) => void;
  onRedo: () => void;
  onReview: () => void;
  onSelectChild: (id: string) => void;
  onStageChange: (stage: CanvasStage) => void;
  onZoom: (id: string) => void;
}) {
  const parent = focused.parentId ? goals[focused.parentId] : null;
  const conditionsForGoal =
    focused.children.length > 0
      ? focused.children.map((childId, index) => {
          const child = goals[childId];
          return [
            child.relation?.split(" · ")[0] ?? `N${index + 1}`,
            child.title,
          ];
        })
      : [
          [`${focused.id}.N1`, focused.conditionSummary],
          [`${focused.id}.N2`, "产物必须能为父目标提供可验证证据"],
        ];

  return (
    <article className="overflow-hidden rounded-xl border-2 border-slate-400 bg-white shadow-[0_18px_50px_rgba(15,23,42,.10)]">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 bg-slate-950 px-5 py-4 text-white">
        <div className="flex min-w-0 items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cyan-300 text-slate-950">
            <Target className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              <span>Goal Canvas</span>
              <span>·</span>
              <span>L{focused.level}</span>
              <span>·</span>
              <span>{focused.id}</span>
            </div>
            <h1 className="mt-1 text-xl font-semibold">{focused.title}</h1>
            {parent ? (
              <p className="mt-1 text-xs text-slate-400">
                通过 <span className="font-semibold text-cyan-300">{focused.relation}</span> 支撑父目标 {parent.id}
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-400">根目标 · 所有下级证据最终回流到此画布</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[10px] text-slate-300">
            {focused.owner}
          </span>
          <span className="rounded bg-cyan-300 px-2 py-1 text-[10px] font-semibold text-slate-950">
            {focused.status}
          </span>
        </div>
      </header>

      <CanvasStageNav activeStage={activeStage} onChange={onStageChange} />

      <section className="min-h-[360px] bg-white p-5">
        <CanvasStageContent
          activeStage={activeStage}
          conditions={conditionsForGoal}
          focused={focused}
          onReview={onReview}
          onSelectChild={onSelectChild}
          onZoom={onZoom}
          reviewed={reviewed}
          selectedChildId={selectedChildId}
        />
        <CollaborationEditor
          activeStage={activeStage}
          agentError={agentError}
          agentLoading={agentLoading}
          agentProposal={agentProposal}
          agentRequest={agentRequest}
          agentSuggestion={agentSuggestion}
          availableMethods={availableMethods}
          confirmed={confirmed}
          draft={draft}
          focused={focused}
          latestSavedAt={latestSavedAt}
          selectedMethod={selectedMethod}
          onAgentRequestChange={onAgentRequestChange}
          onApplySuggestion={onApplySuggestion}
          onAskAgent={onAskAgent}
          onConfirm={onConfirmDraft}
          onDraftChange={onDraftChange}
          onMethodChange={onMethodChange}
          onRedo={onRedo}
        />
      </section>

      <ChildCanvasIndex
        focused={focused}
        onSelect={onSelectChild}
        onZoom={onZoom}
        selectedChildId={selectedChildId}
      />
    </article>
  );
}

function CanvasStageNav({
  activeStage,
  onChange,
}: {
  activeStage: CanvasStage;
  onChange: (stage: CanvasStage) => void;
}) {
  return (
    <nav aria-label="当前目标工作阶段" className="grid border-b border-slate-200 bg-slate-50 sm:grid-cols-5">
      {canvasStages.map((stage, index) => {
        const active = stage.id === activeStage;
        return (
          <button
            aria-current={active ? "step" : undefined}
            className={`flex min-h-12 items-center gap-2 border-b border-slate-200 px-3 py-2 text-left transition last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 ${
              active ? "bg-white text-slate-950" : "text-slate-400 hover:bg-white hover:text-slate-700"
            }`}
            key={stage.id}
            onClick={() => onChange(stage.id)}
            type="button"
          >
            <span className={`grid h-5 w-5 place-items-center rounded text-[10px] font-bold ${active ? "bg-cyan-700 text-white" : "bg-slate-200 text-slate-500"}`}>
              {index + 1}
            </span>
            <span className="text-xs font-semibold">{stage.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function CanvasStageContent({
  activeStage,
  conditions,
  focused,
  reviewed,
  selectedChildId,
  onReview,
  onSelectChild,
  onZoom,
}: {
  activeStage: CanvasStage;
  conditions: string[][];
  focused: GoalNode;
  reviewed: boolean;
  selectedChildId: string | null;
  onReview: () => void;
  onSelectChild: (id: string) => void;
  onZoom: (id: string) => void;
}) {
  if (activeStage === "goal") {
    return (
      <div className="mx-auto max-w-4xl">
        <SectionLabel icon={Target} label="当前目标契约" />
        <p className="mt-4 max-w-3xl text-xl font-semibold leading-8 text-slate-950">{focused.objective}</p>
        <div className="mt-6 grid gap-5 sm:grid-cols-2">
          <CanvasFact label="当前问题" value={focused.problem} />
          <CanvasFact label="期望结果" value={focused.objective} />
          <CanvasFact label="验收证据" value={focused.conditionSummary} />
          <CanvasFact label="责任主体" value={focused.owner} />
        </div>
        <div className="mt-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
          当前需要审查：目标是否足够明确？范围、对象和验收证据是否仍有歧义？
        </div>
      </div>
    );
  }

  if (activeStage === "conditions") {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="flex items-end justify-between gap-3">
          <div>
            <SectionLabel icon={Bot} label="成立条件" />
            <p className="mt-2 text-sm text-slate-500">
              从已确认的目标出发，推导缺少哪些条件会使目标无法成立。
            </p>
          </div>
          <span className="text-[10px] text-slate-400">{conditions.length} 条当前推理</span>
        </div>
        <div className="mt-4 space-y-2">
          {conditions.map(([id, condition], index) => (
            <div className="grid items-center gap-3 rounded-md border border-slate-200 px-3 py-3 md:grid-cols-[44px_1fr_auto_1.3fr]" key={id}>
              <span className="rounded bg-slate-100 px-1.5 py-1 text-center text-[10px] font-bold text-slate-600">{id}</span>
              <span className="text-xs text-slate-500">{index === 0 ? "当前目标要成立" : "结果要能支撑父目标"}</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-700">
                则必须
                <ArrowRight className="h-3 w-3" />
              </span>
              <span className="text-sm font-medium text-slate-800">{condition}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-3">
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
            <strong className="text-slate-900">必要条件：</strong>
            缺少任意一项，目标不能成立。
          </p>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
            <strong className="text-slate-900">联合充分假设：</strong>
            当前假设这些条件合在一起足以支撑目标，仍需证据验证。
          </p>
          <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-slate-600">
            <strong className="text-slate-900">不是验收标准：</strong>
            验收标准用于判断最终结果是否达标。
          </p>
        </div>
        <button
          className={`mt-5 inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 ${
            reviewed
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "bg-slate-950 text-white hover:bg-cyan-800"
          }`}
          onClick={onReview}
          type="button"
        >
          {reviewed ? <Check className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
          {reviewed ? "本节点推理已确认" : "审查这些推理"}
        </button>
      </div>
    );
  }

  if (activeStage === "path") {
    return (
      <div>
        <div className="flex items-end justify-between gap-3">
          <div>
            <SectionLabel icon={Layers3} label="路线" />
            <p className="mt-2 text-sm text-slate-500">只有在这一步，子 Goal 才作为主要产物展开。</p>
          </div>
          <span className="text-[10px] text-slate-400">{focused.children.length} 个直接子 Goal</span>
        </div>
        {focused.children.length > 0 ? (
          <div className="mt-4 divide-y divide-slate-200 rounded-md border border-slate-200">
            {focused.children.map((childId) => {
              const child = goals[childId];
              const selected = selectedChildId === childId;
              return (
                <div className={`grid items-center gap-3 px-3 py-3 md:grid-cols-[110px_minmax(0,1fr)_120px_100px] ${selected ? "bg-cyan-50" : ""}`} key={childId}>
                  <span className="text-[10px] font-semibold text-cyan-700">{child.relation}</span>
                  <button className="min-w-0 text-left" onClick={() => onSelectChild(childId)} type="button">
                    <span className="block text-sm font-semibold text-slate-900">{child.id} · {child.title}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-slate-500">{child.objective}</span>
                  </button>
                  <span className="text-[10px] text-slate-500">{child.owner}</span>
                  <button
                    className="inline-flex min-h-8 items-center justify-center gap-1 rounded border border-slate-300 bg-white px-2 py-1.5 text-[10px] font-semibold text-slate-700 hover:border-cyan-500 hover:text-cyan-800"
                    onClick={() => onZoom(childId)}
                    type="button"
                  >
                    <Maximize2 className="h-3 w-3" />
                    进入画布
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyLeaf />
        )}
      </div>
    );
  }

  if (activeStage === "execute") {
    return (
      <div className="mx-auto max-w-4xl">
        <SectionLabel icon={Play} label="执行" />
        <div className="mt-4 grid gap-px overflow-hidden rounded-md border border-slate-200 bg-slate-200 sm:grid-cols-3">
          <CanvasFact label="执行主体" value={focused.owner} />
          <CanvasFact label="当前状态" value={focused.status} />
          <CanvasFact label="治理模式" value={focused.status === "待确认" ? "等待人类决策" : "权限内自动推进"} />
        </div>
        <div className="mt-5 flex items-start gap-3 rounded-md border border-slate-200 p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 text-cyan-700" />
          <div>
            <p className="text-sm font-semibold text-slate-900">本节点的执行边界</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              Agent 可以在已确认条件、预算和权限范围内推进；出现越权、不可逆或证据不足时暂停并升级。
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl">
      <SectionLabel icon={Check} label="验收" />
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <CanvasFact label="预期验收证据" value={focused.conditionSummary} />
        <ArrowRight className="mx-auto h-5 w-5 text-slate-300" />
        <CanvasFact label="验收后的系统动作" value="证据写回当前 Goal，并向父目标传播支撑状态" />
      </div>
      <div className="mt-5 rounded-md border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">
        如果证据否定了当前推理，系统会从本画布的成立条件推导重新开始，并标出所有受影响的子 Goal。
      </div>
    </div>
  );
}

function MethodPanel({
  activeStage,
  draft,
  focused,
  methods,
  onChange,
  selected,
}: {
  activeStage: CanvasStage;
  draft: string;
  focused: GoalNode;
  methods: MethodDefinition[];
  onChange: (methodId: string) => void;
  selected: MethodDefinition;
}) {
  const checkResults = getMethodCheckResults(
    focused,
    activeStage,
    selected,
    draft,
  );
  const passedCount = checkResults.filter((result) => result.passed).length;

  return (
    <section className="mb-4 overflow-hidden rounded-lg border border-indigo-200 bg-indigo-50/50">
      <div className="grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="border-b border-indigo-200 p-3 lg:border-b-0 lg:border-r">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-indigo-500">
            本步采用的方法
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 lg:flex-col">
            {methods.map((method) => (
              <button
                aria-pressed={method.id === selected.id}
                className={`rounded-md px-2.5 py-2 text-left text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 ${
                  method.id === selected.id
                    ? "bg-indigo-700 text-white"
                    : "bg-white text-slate-600 hover:bg-indigo-100 hover:text-indigo-900"
                }`}
                key={method.id}
                onClick={() => onChange(method.id)}
                type="button"
              >
                {method.name}
              </button>
            ))}
          </div>
        </div>

        <div className="p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold text-slate-900">{selected.name}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{selected.summary}</p>
              <p className="mt-1 text-[10px] text-slate-400">
                来源：
                {selected.sourceUrl ? (
                  <a
                    className="ml-1 text-indigo-700 underline-offset-2 hover:underline"
                    href={selected.sourceUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {selected.source}
                  </a>
                ) : (
                  <span className="ml-1">{selected.source}</span>
                )}
              </p>
            </div>
            <span className="rounded-md bg-white px-2.5 py-1.5 text-xs font-bold text-indigo-800">
              当前通过 {passedCount}/{checkResults.length}
            </span>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {checkResults.map((result) => (
              <span
                className={`inline-flex items-center gap-1 rounded border px-2 py-1 text-[10px] font-medium ${
                  result.passed
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-800"
                }`}
                key={result.label}
              >
                {result.passed ? <Check className="h-3 w-3" /> : <CircleDot className="h-3 w-3" />}
                {result.label}
                {!result.passed ? " · 待补" : ""}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function CollaborationEditor({
  activeStage,
  agentError,
  agentLoading,
  agentProposal,
  agentRequest,
  agentSuggestion,
  availableMethods,
  confirmed,
  draft,
  focused,
  latestSavedAt,
  onAgentRequestChange,
  onApplySuggestion,
  onAskAgent,
  onConfirm,
  onDraftChange,
  onMethodChange,
  onRedo,
  selectedMethod,
}: {
  activeStage: CanvasStage;
  agentError: string;
  agentLoading: boolean;
  agentProposal?: AgentProposal;
  agentRequest: string;
  agentSuggestion: string;
  availableMethods: MethodDefinition[];
  confirmed: boolean;
  draft: string;
  focused: GoalNode;
  latestSavedAt?: string;
  onAgentRequestChange: (value: string) => void;
  onApplySuggestion: () => void;
  onAskAgent: () => void;
  onConfirm: () => void;
  onDraftChange: (value: string) => void;
  onMethodChange: (methodId: string) => void;
  onRedo: () => void;
  selectedMethod: MethodDefinition;
}) {
  const meta = stageAgentMeta[activeStage];
  const suggestion = agentSuggestion;

  return (
    <section className="mt-7 border-t border-slate-200 pt-5">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-slate-900">你和 Agent 共同编辑这一步</p>
          <p className="mt-1 text-[11px] text-slate-400">
            左侧是将写入图谱的草稿；右侧是 Agent 的演示建议与推理方法。
          </p>
        </div>
        <span
          className={`rounded px-2 py-1 text-[10px] font-semibold ${
            confirmed
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-100 text-amber-800"
          }`}
        >
          {confirmed ? "当前阶段已确认" : "等待共同确认"}
        </span>
      </div>

      <MethodPanel
        activeStage={activeStage}
        draft={draft}
        focused={focused}
        methods={availableMethods}
        onChange={onMethodChange}
        selected={selectedMethod}
      />

      <div className="grid overflow-hidden rounded-lg border border-slate-300 lg:grid-cols-[minmax(0,1.2fr)_minmax(300px,.8fr)]">
        <div className="border-b border-slate-200 bg-white p-4 lg:border-b-0 lg:border-r">
          <label
            className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500"
            htmlFor={`draft-${focused.id}-${activeStage}`}
          >
            共同草稿 · 可直接编辑
          </label>
          <textarea
            className="mt-2 min-h-40 w-full resize-y rounded-md border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-800 outline-none transition focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
            id={`draft-${focused.id}-${activeStage}`}
            onChange={(event) => onDraftChange(event.target.value)}
            value={draft}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-[10px] text-slate-400">
              {latestSavedAt
                ? `已保存在此浏览器 · ${new Date(latestSavedAt).toLocaleString("zh-CN")}`
                : "草稿会自动保存在此浏览器；确认后生成一个本地版本。"}
            </p>
            <button
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 ${
                confirmed
                  ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "bg-slate-950 text-white hover:bg-cyan-800"
              }`}
              onClick={onConfirm}
              type="button"
            >
              <Check className="h-3.5 w-3.5" />
              {confirmed ? "已写入当前 Goal" : "确认并写入图谱"}
            </button>
          </div>
        </div>

        <aside className="bg-cyan-50/60 p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-cyan-700 text-white">
              <Bot className="h-4 w-4" />
            </span>
            <div>
              <p className="text-xs font-semibold text-cyan-950">{meta.name}</p>
              <p className="mt-0.5 text-[10px] leading-4 text-cyan-700">
                当前采用：{selectedMethod.name} · {meta.method}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-md border border-cyan-200 bg-white p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-cyan-800">
              <Sparkles className="h-3.5 w-3.5" />
              {agentLoading ? "Agent 正在读取当前图谱" : "Agent 修改提案"}
            </div>
            {agentLoading ? (
              <p className="mt-2 animate-pulse text-xs text-slate-500">
                正在分析 Goal、父子关系、当前阶段与方法检查项……
              </p>
            ) : suggestion ? (
              <>
                <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap font-sans text-xs leading-5 text-slate-700">
                  {suggestion}
                </pre>
                {agentProposal ? (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-[10px] font-semibold text-slate-500">修改理由</p>
                    <p className="mt-1 text-[10px] leading-4 text-slate-600">{agentProposal.rationale}</p>
                    {agentProposal.questions.length > 0 ? (
                      <ul className="mt-2 space-y-1 text-[10px] leading-4 text-amber-800">
                        {agentProposal.questions.map((question) => (
                          <li key={question}>待确认 · {question}</li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-2 text-[9px] text-slate-400">{agentProposal.provider}</p>
                  </div>
                ) : null}
                <button
                  className="mt-3 text-[11px] font-semibold text-cyan-800 underline-offset-4 hover:underline"
                  onClick={onApplySuggestion}
                  type="button"
                >
                  采用提案并预览草稿
                </button>
              </>
            ) : (
              <p className="mt-2 text-xs leading-5 text-slate-500">
                输入要求后发送。Agent 只生成提案，不会直接修改已确认图谱。
              </p>
            )}
          </div>

          {agentError ? (
            <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-[10px] leading-4 text-rose-700">
              {agentError}
            </p>
          ) : null}

          <label
            className="mt-4 block text-[10px] font-semibold text-slate-600"
            htmlFor={`agent-request-${focused.id}-${activeStage}`}
          >
            告诉 Agent 你想怎么调整
          </label>
          <div className="mt-1.5 flex gap-2">
            <input
              className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              id={`agent-request-${focused.id}-${activeStage}`}
              onChange={(event) => onAgentRequestChange(event.target.value)}
              placeholder="例如：检查是否遗漏权限边界"
              value={agentRequest}
            />
            <button
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-cyan-700 text-white hover:bg-cyan-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 disabled:cursor-wait disabled:opacity-50"
              disabled={agentLoading}
              onClick={onAskAgent}
              title="让 Agent 重新建议"
              type="button"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
          <button
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-900 disabled:cursor-wait disabled:opacity-50"
            disabled={agentLoading}
            onClick={onRedo}
            type="button"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            不沿用当前思路，让 Agent 重做
          </button>
          <p className="mt-3 border-t border-cyan-200 pt-3 text-[9px] leading-4 text-cyan-700">
            模型只能提交修改提案；采用提案后仍需人工确认，才会生成新的图谱版本。
          </p>
        </aside>
      </div>
    </section>
  );
}

function ChildCanvasIndex({
  focused,
  selectedChildId,
  onSelect,
  onZoom,
}: {
  focused: GoalNode;
  selectedChildId: string | null;
  onSelect: (id: string) => void;
  onZoom: (id: string) => void;
}) {
  return (
    <section className="border-t border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex shrink-0 items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
          <Layers3 className="h-3.5 w-3.5" />
          子画布
          <span>{focused.children.length}</span>
        </div>
        {focused.children.length > 0 ? (
          <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
            {focused.children.map((childId) => {
              const child = goals[childId];
              const selected = selectedChildId === childId;
              return (
                <div className={`flex shrink-0 items-center overflow-hidden rounded-md border bg-white ${selected ? "border-cyan-500" : "border-slate-200"}`} key={childId}>
                  <button
                    className="flex min-h-9 items-center gap-2 px-2.5 text-left"
                    onClick={() => onSelect(childId)}
                    type="button"
                  >
                    <span className="text-[9px] font-bold text-cyan-700">{child.id}</span>
                    <span className="max-w-36 truncate text-[11px] font-medium text-slate-700">{child.title}</span>
                    <span className="text-[9px] text-slate-400">{child.relation?.split(" · ")[0]}</span>
                  </button>
                  <button
                    aria-label={`进入${child.title}画布`}
                    className="grid h-9 w-8 place-items-center border-l border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-cyan-700"
                    onClick={() => onZoom(childId)}
                    type="button"
                  >
                    <Maximize2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[10px] text-slate-400">当前为叶子 Goal</p>
        )}
      </div>
    </section>
  );
}

function CanvasFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-3">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{label}</p>
      <p className="mt-1.5 text-sm font-medium leading-6 text-slate-800">{value}</p>
    </div>
  );
}

function EmptyLeaf() {
  return (
    <div className="mt-4 grid min-h-40 place-items-center rounded-lg border border-dashed border-slate-300 bg-slate-50">
      <div className="text-center">
        <CircleDot className="mx-auto h-5 w-5 text-slate-300" />
        <p className="mt-2 text-xs font-medium text-slate-500">当前是叶子 Goal</p>
        <p className="mt-1 text-[10px] text-slate-400">如仍不可直接执行，需要先补充必要条件</p>
      </div>
    </div>
  );
}

function CanvasSelection({
  focused,
  selected,
  onClear,
  onZoom,
}: {
  focused: GoalNode;
  selected: GoalNode | null;
  onClear: () => void;
  onZoom: (id: string) => void;
}) {
  if (!selected) {
    return (
      <footer className="flex items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-2.5 text-[11px] text-slate-400">
        <span>当前聚焦：{focused.id} · {focused.title}</span>
        <span>单击子画布查看关系，放大进入其内部工作</span>
      </footer>
    );
  }

  return (
    <footer className="flex flex-wrap items-center gap-3 border-t border-cyan-200 bg-cyan-50 px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <Focus className="h-4 w-4 shrink-0 text-cyan-700" />
        <p className="truncate text-xs text-cyan-950">
          <strong>{selected.id} {selected.title}</strong>
          <span className="mx-2 text-cyan-400">通过</span>
          <strong>{selected.relation}</strong>
          <span className="mx-2 text-cyan-400">支撑</span>
          {focused.id} {focused.title}
        </p>
      </div>
      <button className="text-xs text-cyan-700 hover:underline" onClick={onClear} type="button">
        取消选择
      </button>
      <button
        className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-slate-950 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-800"
        onClick={() => onZoom(selected.id)}
        type="button"
      >
        <Maximize2 className="h-3.5 w-3.5" />
        进入这个画布
      </button>
    </footer>
  );
}

function SectionLabel({
  icon: Icon,
  label,
}: {
  icon: typeof Target;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
      <Icon className="h-3.5 w-3.5 text-cyan-700" />
      {label}
    </div>
  );
}

function getGoalPath(goalId: string): GoalNode[] {
  const path: GoalNode[] = [];
  let current: GoalNode | undefined = goals[goalId];

  while (current) {
    path.unshift(current);
    current = current.parentId ? goals[current.parentId] : undefined;
  }

  return path;
}

function getInitialDraft(goal: GoalNode, stage: CanvasStage): string {
  const parent = goal.parentId ? goals[goal.parentId] : null;

  if (stage === "goal") {
    return [
      `目标：${goal.title}`,
      `当前问题：${goal.problem}`,
      `期望结果：${goal.objective}`,
      `范围边界：由 ${goal.owner} 负责，${parent ? `通过“${goal.relation}”支撑 ${parent.id} ${parent.title}` : "作为根目标统领所有下级工作"}`,
      `验收证据：${goal.conditionSummary}`,
      "量化指标：待补充",
      "可实现依据：待补充",
      "截止时间：待补充",
    ].join("\n");
  }

  if (stage === "conditions") {
    return [
      `输入目标：${goal.title}`,
      `必要条件 1：${goal.conditionSummary}`,
      `必要条件 2：产物必须能为${parent ? `父目标 ${parent.id}` : "根目标"}提供可验证证据`,
      "联合充分假设：以上必要条件组合后，足以支撑当前目标成立（待验证）",
      "待审查：这些条件是否存在遗漏、重复或把实现方案误当成必要条件？",
    ].join("\n");
  }

  if (stage === "path") {
    const children =
      goal.children.length > 0
        ? goal.children
            .map((childId) => {
              const child = goals[childId];
              return `${child.relation} → ${child.id} ${child.title}（${child.owner}）`;
            })
            .join("\n")
        : "当前没有子 Goal；需先判断本目标是否已可直接执行。";
    return `条件到子目标的映射：\n${children}\n\n覆盖检查：每条必要条件都必须有对应 Goal 或执行证据。`;
  }

  if (stage === "execute") {
    return [
      `执行主体：${goal.owner}`,
      `当前状态：${goal.status}`,
      "自动推进边界：已确认条件、预算和权限范围内。",
      "升级规则：越权、不可逆、高影响或证据不足时暂停并交由人判断。",
    ].join("\n");
  }

  return [
    `验收对象：${goal.title}`,
    `预期证据：${goal.conditionSummary}`,
    "通过：证据写回当前 Goal，并向父目标传播支撑状态。",
    "不通过：回到成立条件推导，标出受影响的子 Goal 并触发 Redo。",
  ].join("\n");
}

function getMethodCheckResults(
  goal: GoalNode,
  stage: CanvasStage,
  method: MethodDefinition,
  draft = "",
): { label: string; passed: boolean }[] {
  const hasChildren = goal.children.length > 0;
  const hasCompletedField = (label: string) => {
    const match = draft.match(new RegExp(`${label}：([^\\n]+)`));
    return Boolean(match?.[1].trim() && !match[1].includes("待补"));
  };
  const resultsByMethod: Record<string, boolean[]> = {
    smart: [
      Boolean(goal.title && goal.objective),
      hasCompletedField("量化指标"),
      hasCompletedField("可实现依据"),
      Boolean(goal.parentId) || goal.id === "G0",
      hasCompletedField("截止时间"),
    ],
    okr: [true, false, true, true],
    "goal-contract": [true, false, true, false, Boolean(goal.parentId) || goal.id === "G0"],
    counterfactual: [true, true, false, false],
    fmea: [false, false, false, false],
    coverage: [hasChildren, hasChildren, hasChildren, true],
    wbs: [hasChildren, hasChildren, false, !hasChildren],
    raci: [false, true, false, false],
    "risk-gate": [true, false, false, false],
    vv: [false, false, false, true],
    "review-redo": [false, false, true, true],
  };
  const stageFallback: Record<CanvasStage, boolean[]> = {
    goal: [true, false, false, true, false],
    conditions: [true, true, false, false],
    path: [hasChildren, hasChildren, false, false],
    execute: [true, false, false, false],
    verify: [false, false, true, true],
  };
  const results = resultsByMethod[method.id] ?? stageFallback[stage];

  return method.checks.map((label, index) => ({
    label,
    passed: results[index] ?? false,
  }));
}
