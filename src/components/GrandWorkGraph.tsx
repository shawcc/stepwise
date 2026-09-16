import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDot,
  Clock3,
  Focus,
  FileCheck2,
  FileDiff,
  GitBranch,
  History,
  Map,
  Maximize2,
  MessageSquare,
  Network,
  PanelTop,
  Play,
  RotateCcw,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import {
  requestExecutionAgent,
  requestAgentProposal,
  type AgentProposal,
  type ExecutionEvidence,
} from "@/lib/workgraph-agent";

type CanvasStage = "goal" | "conditions" | "path" | "execute" | "verify";
type WorkspaceView = "map" | "canvas" | "dependencies" | "evidence" | "monitor" | "timeline";

type StageDrafts = Record<string, string>;

type WorkspaceVersion = {
  key: string;
  draft: string;
  savedAt: string;
};

type ThreadEntryKind =
  | "comment"
  | "agent-analysis"
  | "agent-run"
  | "evidence"
  | "proposal"
  | "decision"
  | "system";

type ThreadEntry = {
  id: string;
  kind: ThreadEntryKind;
  actor: string;
  content: string;
  createdAt: string;
};

type AgentRunStatus =
  | "running"
  | "review-required"
  | "accepted"
  | "redo"
  | "failed";

type AgentRun = {
  id: string;
  goalId: string;
  action: string;
  agent: string;
  riskLevel: "low" | "medium" | "high";
  approvedBy: string;
  status: AgentRunStatus;
  startedAt: string;
  completedAt?: string;
  outcome?: string;
  evidence: ExecutionEvidence[];
  needsDecision?: boolean;
  decisionQuestion?: string;
  decision?: string;
  provider?: string;
  error?: string;
};

type PersistedWorkspace = {
  drafts: StageDrafts;
  confirmedDrafts: string[];
  methodByStage: Record<string, string>;
  versions: WorkspaceVersion[];
  threads: Record<string, ThreadEntry[]>;
  agentRuns: AgentRun[];
};

const workspaceStorageKey = "workgraph:mvp-workspace:v4";

function loadWorkspace(): PersistedWorkspace {
  const demoWorkspace = createDemoWorkspace();
  if (typeof window === "undefined") return demoWorkspace;

  try {
    const stored = JSON.parse(window.localStorage.getItem(workspaceStorageKey) ?? "null");
    if (!stored || typeof stored !== "object") return demoWorkspace;
    const migratedStored = JSON.parse(
      JSON.stringify(stored).split("ReasonOS").join("Stepwise"),
    );
    const drafts = { ...(migratedStored.drafts ?? {}) };
    const threads = { ...(migratedStored.threads ?? {}) };
    if (
      ["WorkBuddy", "Nebius"].some((legacyName) =>
        String(drafts["G0:goal"] ?? "").includes(legacyName),
      )
    ) {
      drafts["G0:goal"] = demoWorkspace.drafts["G0:goal"];
      threads["G0:goal"] = demoWorkspace.threads["G0:goal"];
    }
    return {
      drafts,
      confirmedDrafts: migratedStored.confirmedDrafts ?? [],
      methodByStage: migratedStored.methodByStage ?? {},
      versions: migratedStored.versions ?? [],
      threads,
      agentRuns: JSON.stringify(migratedStored.agentRuns ?? []).includes("Nebius")
        ? demoWorkspace.agentRuns
        : (migratedStored.agentRuns ?? demoWorkspace.agentRuns),
    };
  } catch {
    return demoWorkspace;
  }
}

function createThreadEntry(
  kind: ThreadEntryKind,
  actor: string,
  content: string,
): ThreadEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    actor,
    content,
    createdAt: new Date().toISOString(),
  };
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
  keyResults: string[];
  children: string[];
  initiatives?: string[];
  actions?: string[];
  outcome?: string;
  evidence?: string;
  decision?: string;
  reasoningAgent?: string;
  executionAgents?: string[];
  autonomy?: string;
};

const goals: Record<string, GoalNode> = {
  G0: {
    id: "G0",
    title: "提交 Stepwise 参加 Amazon Developer Hackathon",
    level: 0,
    owner: "林然｜队长",
    status: "进行中",
    problem: "Stepwise 已能表达目标与协作过程，但还缺少让 Alexa+ 等外部 Agent 按授权边界读取 Objective、执行 Action 并回填 Evidence 的标准接口。",
    objective: "在 2026 年 10 月 23 日 12:00 PT 前，为 Stepwise 提供符合 MCP 2025-11-25 的远程协作接口，完成 Amazon Developer Hackathon Alexa+ 赛道作品与正式提交。",
    keyResults: [
      "线上产品可完成 Objective → Action → Agent Run → Evidence → DRI Decision 闭环",
      "Alexa+ 模拟体验或兼容客户端可通过 MCP 读取 Objective、创建 Action、回填 Outcome 与 Evidence",
      "公开仓库包含开源许可证、完整源码、部署与测试说明，评审可独立运行",
      "Devpost 提交包含可用 Demo、三分钟内英文视频、产品反馈和重大更新说明，并获得提交回执",
    ],
    children: ["G0.1", "G0.2", "G0.3", "G0.4", "G0.5"],
    initiatives: ["用 Stepwise 驱动 Stepwise 的参赛开发，只补齐一条真实运行闭环及提交必需能力。"],
    actions: ["工程 Agent 实现运行闭环；规则 Agent 维护官方约束；DRI 决定范围、授权和最终提交。"],
    outcome: "已完成替代赛事选择、官方规则核验和 DRI/Agent 责任模型；MCP 远程协作接口正在补齐。",
    evidence: "官方赛事页与规则页已核验；现有 DRI 重构已通过 lint、TypeScript 检查、生产构建和本地界面验证。",
    decision: "参加 Amazon Developer Hackathon 的 Alexa+ 赛道；以 Stepwise MCP 和 Web 模拟体验展示跨 Agent 目标协作。",
    reasoningAgent: "参赛策略 Agent",
    executionAgents: ["规则 Agent", "洞察 Agent", "工程 Agent", "演示 Agent", "质量 Agent"],
    autonomy: "Agent 可自主推进可逆调研、分析与原型；赛题、范围、预算、正式提交和验收由 DRI 决策。",
  },
  "G0.1": {
    id: "G0.1",
    title: "确认比赛规则与参赛策略",
    level: 1,
    parentId: "G0",
    relation: "N1 · 必要条件",
    owner: "林然｜队长",
    status: "已确认",
    problem: "比赛要求、时间节点与已有项目资格需要形成可追溯的约束基线。",
    objective: "建立 Amazon Developer Hackathon 的唯一可信约束清单，并据此确定 Alexa+ 参赛路径、节奏和风险边界。",
    keyResults: [
      "规则、赛程、资格、提交物和评分维度均链接官方来源并由 DRI 确认",
      "最终提交时间固定为 2026 年 10 月 23 日 12:00 PT，并设置内部提前量",
    ],
    children: ["G0.1.1", "G0.1.2"],
    initiatives: ["集中收集官方材料，建立规则核验表和参赛决策记录。"],
    actions: ["规则 Agent 持续检查官方更新；DRI 确认参赛资格、赛道与不可逆提交动作。"],
    outcome: "已确认中国大陆个人可参赛、已有项目可在赛期内重大更新；Alexa+ 接受 Agent Skill、自建 MCP 或可运行的 Web 模拟体验。",
    evidence: "https://amazonappdev2026.devpost.com/；https://amazonappdev2026.devpost.com/rules",
    decision: "选择 Alexa+ 赛道，以 Stepwise MCP 与 Web 产品共同构成参赛项目。",
    reasoningAgent: "规则推理 Agent",
    executionAgents: ["规则采集 Agent"],
    autonomy: "可自主收集和比对公开规则；资格判断、冲突条款与时间承诺升级给 DRI。",
  },
  "G0.2": {
    id: "G0.2",
    title: "定义值得解决的用户问题",
    level: 1,
    parentId: "G0",
    relation: "N2 · 必要条件",
    owner: "周宁｜产品",
    status: "推演中",
    problem: "团队有多个 AI 创意，但尚未证明哪个问题真实、重要且适合在比赛周期内解决。",
    objective: "选择一个真实、高价值、可验证，并能清楚展示 AI 独特作用的参赛命题。",
    keyResults: [
      "至少完成 5 次目标用户访谈或等价的一手问题验证",
      "最终命题有明确用户、场景、现有替代方案和可验证价值指标",
      "方案范围可在比赛周期内形成完整演示闭环",
    ],
    children: ["G0.2.1", "G0.2.2"],
    initiatives: ["并行验证候选问题，再用用户价值、AI 必要性和交付可行性进行取舍。"],
    actions: ["产品负责人组织访谈；洞察 Agent 汇总证据并反驳弱命题。"],
    reasoningAgent: "用户洞察 Agent",
    executionAgents: ["访谈分析 Agent", "机会反证 Agent"],
    autonomy: "可自主整理证据、提出候选命题；最终命题和范围冻结由 DRI 决策。",
  },
  "G0.3": {
    id: "G0.3",
    title: "交付稳定可用的 AI 作品",
    level: 1,
    parentId: "G0",
    relation: "N3 · 必要条件",
    owner: "陈默｜工程",
    status: "进行中",
    problem: "现有闭环只在浏览器内部运行，Alexa+ 或其他外部 Agent 无法按统一协议参与。",
    objective: "交付符合 MCP 2025-11-25、保留 DRI 授权边界并可稳定演示的 Stepwise 远程协作接口。",
    keyResults: [
      "MCP 客户端可完成初始化、工具发现、Objective 读取和完整 Action 验收链路",
      "未授权写入、错误状态迁移和非法输入均返回可执行错误",
      "部署地址、演示流程和恢复方案均通过非开发成员验证",
    ],
    children: ["G0.3.1", "G0.3.2"],
    initiatives: ["先实现无会话 Streamable HTTP MCP，再接入 Alexa+ 模拟体验并提高可演示性。"],
    actions: ["工程负责人实现 MCP 数据面；测试 Agent 验证协议、权限和状态迁移。"],
    reasoningAgent: "技术方案 Agent",
    executionAgents: ["开发 Agent", "测试 Agent"],
    autonomy: "可在已确认架构和测试边界内自主实现；架构变更、数据风险和不可逆操作升级给 DRI。",
  },
  "G0.4": {
    id: "G0.4",
    title: "形成清晰可信的评审叙事",
    level: 1,
    parentId: "G0",
    relation: "N4 · 必要条件",
    owner: "苏遥｜设计与演示",
    status: "待启动",
    problem: "即使作品可运行，如果价值、AI 作用和结果证据无法被快速理解，也难以获得有效评价。",
    objective: "让评审在有限时间内理解问题、方案、AI 独特价值、真实结果和团队判断。",
    keyResults: [
      "演示在规定时长内完整覆盖问题、方案、关键操作、结果与证据；时长待规则确认",
      "演示脚本由一名未参与开发的体验者复述后，核心价值无关键误解",
      "提交文案、演示视频和现场讲述使用同一组事实与指标",
    ],
    children: ["G0.4.1", "G0.4.2"],
    initiatives: ["从评审问题倒推演示结构，让每个主张都连接产品画面或证据。"],
    actions: ["设计负责人制作叙事板；演示 Agent 检查信息密度、时长和证据缺口。"],
    reasoningAgent: "评审叙事 Agent",
    executionAgents: ["设计 Agent", "演示检查 Agent"],
    autonomy: "可自主生成和校验材料草稿；核心价值主张与最终对外表述由 DRI 决策。",
  },
  "G0.5": {
    id: "G0.5",
    title: "完成质量验收与正式提交",
    level: 1,
    parentId: "G0",
    relation: "N5 · 必要条件",
    owner: "许清｜质量与提交",
    status: "待启动",
    problem: "比赛提交通常涉及多项材料和不可逆截止时间，遗漏任何关键项都可能使作品无法被评审。",
    objective: "在截止前完成独立验收、全流程彩排、风险处置和可追溯提交。",
    keyResults: [
      "规则要求的每项提交物均有负责人、最终版本和检查证据",
      "全流程彩排无阻断问题，非阻断问题均有接受或修复决策",
      "正式提交完成后保存平台回执、最终产物快照和团队确认记录",
    ],
    children: ["G0.5.1", "G0.5.2"],
    initiatives: ["建立提交清单和冻结机制，由未直接开发对应模块的成员交叉验收。"],
    actions: ["质量负责人维护验收清单；队长执行最终 go/no-go 决策。"],
    reasoningAgent: "验收审查 Agent",
    executionAgents: ["回归 Agent", "提交检查 Agent"],
    autonomy: "可自主执行检查和整理证据；风险接受、版本冻结与正式提交必须由 DRI 决策。",
  },
  "G0.1.1": {
    id: "G0.1.1",
    title: "建立官方规则清单",
    level: 2,
    parentId: "G0.1",
    relation: "N1.1 · 必要条件",
    owner: "规则 Agent + 林然",
    status: "已核验",
    problem: "需要把官方规则从网页信息转化为可执行、可追溯的约束。",
    objective: "把官方规则转成带来源、状态和责任人的可执行约束清单。",
    keyResults: ["每条关键规则可定位到官方来源，模糊或冲突条款有明确待确认人"],
    children: [],
    outcome: "已核验参赛资格、技术要求、提交物、评审标准和时间节点。",
    evidence: "官方 Overview 与 Official Rules；核验日期 2026-09-14。",
    decision: "规则基线可用于倒排开发；正式提交前再次检查官方更新。",
  },
  "G0.1.2": {
    id: "G0.1.2",
    title: "确定参赛节奏与风险边界",
    level: 2,
    parentId: "G0.1",
    relation: "N1.2 · 必要条件",
    owner: "林然｜队长",
    status: "进行中",
    problem: "官方截止时间已确认，但内部冻结点、演示验收和提交预演尚未排定。",
    objective: "建立包含内部提前量、决策门和退出条件的参赛计划。",
    keyResults: ["每个不可逆节点至少有一次提前检查，关键风险有责任人和触发条件"],
    children: [],
  },
  "G0.2.1": {
    id: "G0.2.1",
    title: "验证目标用户与问题",
    level: 2,
    parentId: "G0.2",
    relation: "N2.1 · 必要条件",
    owner: "周宁｜产品",
    status: "进行中",
    problem: "候选创意主要来自团队直觉，缺少一手用户证据。",
    objective: "找到反复出现、影响明确且现有方案不足的真实问题。",
    keyResults: ["形成至少 5 份可追溯的一手验证记录，并明确支持与反驳证据"],
    children: [],
  },
  "G0.2.2": {
    id: "G0.2.2",
    title: "冻结最小作品范围",
    level: 2,
    parentId: "G0.2",
    relation: "N2.2 · 必要条件",
    owner: "周宁 + 陈默",
    status: "待验证",
    problem: "尚未把用户价值转成一个可交付、可演示的最小闭环。",
    objective: "定义比赛周期内必须成立的一个核心场景，并主动排除非必要功能。",
    keyResults: ["范围包含明确输入、AI 处理、用户决策和结果输出，且每项功能都服务核心价值"],
    children: [],
  },
  "G0.3.1": {
    id: "G0.3.1",
    title: "跑通 Stepwise MCP",
    level: 2,
    parentId: "G0.3",
    relation: "N3.1 · 必要条件",
    owner: "陈默｜工程",
    status: "进行中",
    problem: "外部 Agent 还不能通过标准协议进入 Stepwise 的目标与执行闭环。",
    objective: "让 MCP 客户端完成 Objective 读取、Action 授权、Outcome 回填和 DRI Decision。",
    keyResults: ["初始化、工具发现、读取与写入链路均可复现，非法状态和无凭证写入被拒绝"],
    children: [],
  },
  "G0.3.2": {
    id: "G0.3.2",
    title: "验证 Alexa+ 协作体验",
    level: 2,
    parentId: "G0.3",
    relation: "N3.2 · 必要条件",
    owner: "AI Agent + 陈默",
    status: "待启动",
    problem: "协议可调用不等于用户能理解外部 Agent 如何与 Human DRI 共同推进目标。",
    objective: "用 Alexa+ 模拟体验展示 Agent 提案、受权执行、证据回填和人类验收的完整分工。",
    keyResults: ["三分钟演示中能看清 Agent 做了什么、为何需要授权、Evidence 如何影响 DRI Decision"],
    children: [],
  },
  "G0.4.1": {
    id: "G0.4.1",
    title: "建立评审叙事与证据链",
    level: 2,
    parentId: "G0.4",
    relation: "N4.1 · 必要条件",
    owner: "苏遥｜设计与演示",
    status: "待启动",
    problem: "产品主张、功能展示和证据尚未组织成统一故事。",
    objective: "让每个评审主张都能落到一个具体画面、操作或结果证据。",
    keyResults: ["叙事结构覆盖问题、洞察、方案、AI 作用、结果与下一步，且没有无证据主张"],
    children: [],
  },
  "G0.4.2": {
    id: "G0.4.2",
    title: "完成演示与提交材料",
    level: 2,
    parentId: "G0.4",
    relation: "N4.2 · 必要条件",
    owner: "苏遥 + 全体成员",
    status: "待启动",
    problem: "演示视频、讲述、截图和提交文案尚未生产。",
    objective: "形成符合官方格式、事实一致、可以独立理解的最终材料包。",
    keyResults: ["所有材料通过规则检查、事实核对、时长检查和非项目成员理解测试"],
    children: [],
  },
  "G0.5.1": {
    id: "G0.5.1",
    title: "执行独立验收与彩排",
    level: 2,
    parentId: "G0.5",
    relation: "N5.1 · 必要条件",
    owner: "许清｜质量与提交",
    status: "待启动",
    problem: "尚未由独立视角验证作品、材料和演示的完整性。",
    objective: "在正式提交前暴露作品、叙事和流程中的阻断问题。",
    keyResults: ["完成产品、AI 质量、规则符合性和演示四类验收，并记录问题关闭证据"],
    children: [],
  },
  "G0.5.2": {
    id: "G0.5.2",
    title: "完成正式提交与归档",
    level: 2,
    parentId: "G0.5",
    relation: "N5.2 · 必要条件",
    owner: "林然 + 许清",
    status: "待启动",
    problem: "正式提交尚未发生，也没有最终版本冻结和回执。",
    objective: "按官方流程提交最终作品，并保存可核验的版本与回执。",
    keyResults: ["平台确认提交成功，最终版本、提交时间、回执和责任人均可追溯"],
    children: [],
  },
};

function createDemoWorkspace(): PersistedWorkspace {
  const rootDraft = [
    "Objective：提交 Stepwise 参加 Amazon Developer Hackathon",
    "目标描述：在 2026 年 10 月 23 日 12:00 PT 前，为 Stepwise 提供符合 MCP 2025-11-25 的远程协作接口，完成 Alexa+ 赛道作品与正式提交。",
    "KR1：线上产品可完成 Objective → Action → Agent Run → Evidence → DRI Decision 闭环",
    "KR2：Alexa+ 模拟体验或兼容客户端可通过 MCP 读取 Objective、创建 Action、回填 Outcome 与 Evidence",
    "KR3：公开仓库包含开源许可证、完整源码、部署与测试说明，评审可独立运行",
    "KR4：Devpost 提交包含可用 Demo、三分钟内英文视频、产品反馈和重大更新说明，并获得提交回执",
    "范围：只建设 Alexa+ 参赛闭环所需的 MCP、模拟体验和提交材料，暂缓通用连接器与组织级权限。",
  ].join("\n");
  const savedAt = "2026-09-14T13:55:00.000Z";

  return {
    drafts: { "G0:goal": rootDraft },
    confirmedDrafts: ["G0:goal"],
    methodByStage: { "G0:goal": "okr" },
    versions: [{ key: "G0:goal", draft: rootDraft, savedAt }],
    threads: {
      "G0:goal": [
        {
          id: "demo-1",
          kind: "comment",
          actor: "林然｜队长",
          content: "先寻找比 Kaggriculture 更适合的比赛，重点解决周期太短和领域干扰问题。",
          createdAt: "2026-09-14T13:20:00.000Z",
        },
        {
          id: "demo-2",
          kind: "agent-analysis",
          actor: "参赛策略 Agent",
          content: "Amazon Developer Hackathon 允许中国大陆个人参赛和已有项目重大更新；Alexa+ 赛道接受自建 MCP 或 Web 模拟体验，直接验证 Stepwise 的 Agent 协作边界。",
          createdAt: "2026-09-14T13:35:00.000Z",
        },
        {
          id: "demo-3",
          kind: "proposal",
          actor: "参赛策略 Agent",
          content: rootDraft,
          createdAt: "2026-09-14T13:45:00.000Z",
        },
        {
          id: "demo-4",
          kind: "decision",
          actor: "林然｜队长",
          content: "确认参加 Amazon Developer Hackathon Alexa+ 赛道，以 Stepwise MCP 的真实协议闭环作为核心重大更新。",
          createdAt: savedAt,
        },
      ],
    },
    agentRuns: [
      {
        id: "run-competition-selection",
        goalId: "G0",
        action: "筛选并核验更适合验证 Stepwise 的真实 AI Agent 比赛",
        agent: "参赛策略 Agent",
        riskLevel: "low",
        approvedBy: "林然｜队长",
        status: "accepted",
        startedAt: "2026-09-14T13:20:00.000Z",
        completedAt: "2026-09-14T13:55:00.000Z",
        outcome: "核验国内外仍开放赛事及参赛限制后，停止 Nebius 接入，选择 Amazon Developer Hackathon Alexa+ 赛道。",
        evidence: [
          {
            label: "官方赛事页",
            detail: "赛事 Alexa+ 赛道接受 Agent Skill、自建 MCP 或 Web 模拟体验，提交截止为 2026 年 10 月 23 日 12:00 PT。",
            kind: "observation",
            source: "https://amazonappdev2026.devpost.com/",
          },
          {
            label: "官方规则",
            detail: "允许个人或团队参赛，已有项目可在赛期内重大更新后提交。",
            kind: "observation",
            source: "https://amazonappdev2026.devpost.com/rules",
          },
        ],
        decision: "DRI 已接受结果，并将 Alexa+ 参赛路径写入根 Objective。",
        provider: "TRAE research run",
      },
    ],
  };
}

const allGoalIds = Object.keys(goals);

function formatKeyResults(goal: GoalNode): string {
  return goal.keyResults
    .map((result, index) => `KR${index + 1}：${result}`)
    .join("\n");
}

function getHumanDri(goal: GoalNode): string {
  const humanOwner = goal.owner
    .split("+")
    .map((owner) => owner.trim())
    .find((owner) => !owner.toLowerCase().includes("agent"));
  return humanOwner ?? goal.owner;
}

function getReasoningAgent(goal: GoalNode): string {
  return goal.reasoningAgent ?? stageAgentMeta.goal.name;
}

function getExecutionAgents(goal: GoalNode): string[] {
  if (goal.executionAgents?.length) return goal.executionAgents;
  return [`${goal.title}执行 Agent`];
}

function getAutonomyPolicy(goal: GoalNode): string {
  return (
    goal.autonomy ??
    "Agent 可在已确认目标、权限与可逆边界内自主推进；越权、高影响、不可逆或证据冲突时升级给 DRI。"
  );
}

function getConditionRows(goal: GoalNode): string[][] {
  if (goal.children.length === 0) {
    return [[`${goal.id}.N?`, "待通过反事实检验生成候选必要条件"]];
  }

  return goal.children.map((childId, index) => {
    const child = goals[childId];
    return [
      child.relation?.split(" · ")[0] ?? `N${index + 1}`,
      child.title,
    ];
  });
}

const canvasStages: { id: CanvasStage; label: string }[] = [
  { id: "goal", label: "目标与 KR" },
  { id: "conditions", label: "必要条件" },
  { id: "path", label: "举措与路线" },
  { id: "execute", label: "执行与结果" },
  { id: "verify", label: "审查与决策" },
];

const workspaceViews: {
  id: WorkspaceView;
  label: string;
  icon: typeof Map;
}[] = [
  { id: "map", label: "地图", icon: Map },
  { id: "canvas", label: "工作台", icon: PanelTop },
];

const stageAgentMeta: Record<CanvasStage, { name: string; method: string }> = {
  goal: { name: "Objective & KR Agent", method: "目标澄清、结果定义、口径与时限检查" },
  conditions: { name: "必要条件 Agent", method: "反事实检验、失败模式分析、承担方式判断" },
  path: { name: "Initiative Agent", method: "条件覆盖、举措设计、行动与依赖排序" },
  execute: { name: "执行与证据 Agent", method: "权限检查、结果回填、证据追溯" },
  verify: { name: "Review Agent", method: "KR 核验、偏差归因、决策与影响传播" },
};

const methodLibrary: Record<CanvasStage, MethodDefinition[]> = {
  goal: [
    {
      id: "okr",
      name: "OKR",
      summary: "用 Objective 表达方向，用少量可衡量、可验证的 Key Results 定义成功。",
      source: "Google re:Work · Set goals with OKRs",
      sourceUrl: "https://rework.withgoogle.com/guides/set-goals-with-okrs/steps/introduction/",
      checks: ["目标有方向性", "结果可验证", "结果而非任务", "数量保持聚焦"],
    },
    {
      id: "smart",
      name: "SMART",
      summary: "检查目标是否具体、可衡量、可实现、相关且有时限。",
      source: "George T. Doran, Management Review, 1981",
      checks: ["具体", "可衡量", "可实现依据", "与上级相关", "有时限"],
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
      summary: "确保每条必要条件都由下级目标、举措、约束或共享目标承担。",
      source: "WorkGraph 条件覆盖模型",
      checks: ["无遗漏条件", "承担方式明确", "举措边界清楚", "递归关系明确"],
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
  const [threads, setThreads] = useState<Record<string, ThreadEntry[]>>(
    persistedWorkspace.threads,
  );
  const [agentRuns, setAgentRuns] = useState<AgentRun[]>(
    persistedWorkspace.agentRuns,
  );
  const [threadOpen, setThreadOpen] = useState(true);

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
  const currentVersions = versions.filter(
    (version) => version.key === collaborationKey,
  );
  const currentAgentRuns = agentRuns.filter((run) => run.goalId === focused.id);
  const threadEntries = threads[collaborationKey] ?? [];
  const threadEntriesByStage = Object.fromEntries(
    canvasStages.map((stage) => [
      stage.id,
      threads[`${focused.id}:${stage.id}`] ?? [],
    ]),
  ) as Record<CanvasStage, ThreadEntry[]>;
  const threadCountByStage = Object.fromEntries(
    canvasStages.map((stage) => [
      stage.id,
      threadEntriesByStage[stage.id].length,
    ]),
  ) as Record<CanvasStage, number>;

  useEffect(() => {
    window.localStorage.setItem(
      workspaceStorageKey,
      JSON.stringify({
        drafts,
        confirmedDrafts,
        methodByStage,
        versions,
        threads,
        agentRuns,
      }),
    );
  }, [agentRuns, confirmedDrafts, drafts, methodByStage, threads, versions]);

  const appendThreadEntry = (
    key: string,
    kind: ThreadEntryKind,
    actor: string,
    content: string,
  ) => {
    setThreads((current) => ({
      ...current,
      [key]: [
        ...(current[key] ?? []),
        createThreadEntry(kind, actor, content),
      ],
    }));
  };

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
    const requestedChange = instruction.trim();
    appendThreadEntry(
      collaborationKey,
      "comment",
      getHumanDri(focused),
      requestedChange,
    );
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
          acceptance: formatKeyResults(focused),
          dri: getHumanDri(focused),
          reasoningAgent: getReasoningAgent(focused),
          executionAgents: getExecutionAgents(focused),
          autonomy: getAutonomyPolicy(focused),
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
      appendThreadEntry(
        collaborationKey,
        "agent-analysis",
        getReasoningAgent(focused),
        proposal.rationale,
      );
      appendThreadEntry(
        collaborationKey,
        "proposal",
        getReasoningAgent(focused),
        proposal.proposedDraft,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Agent 请求失败";
      setAgentErrors((current) => ({
        ...current,
        [collaborationKey]: message,
      }));
      appendThreadEntry(
        collaborationKey,
        "system",
        "系统",
        `Agent 请求失败：${message}`,
      );
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
    appendThreadEntry(
      collaborationKey,
      "decision",
      getHumanDri(focused),
      "DRI 已确认当前提案并写入目标文档，系统生成了一个新版本。",
    );
  };

  const startAgentRun = async (
    action: string,
    agent: string,
    riskLevel: AgentRun["riskLevel"],
  ) => {
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const approvedBy = getHumanDri(focused);
    const run: AgentRun = {
      id: runId,
      goalId: focused.id,
      action,
      agent,
      riskLevel,
      approvedBy,
      status: "running",
      startedAt: new Date().toISOString(),
      evidence: [],
    };
    setAgentRuns((current) => [run, ...current]);
    appendThreadEntry(
      `${focused.id}:execute`,
      "agent-run",
      agent,
      `已由 ${approvedBy} 授权运行：${action}`,
    );

    try {
      const parent = focused.parentId ? goals[focused.parentId] : undefined;
      const response = await requestExecutionAgent({
        goal: {
          id: focused.id,
          title: focused.title,
          problem: focused.problem,
          objective: focused.objective,
          acceptance: formatKeyResults(focused),
          dri: approvedBy,
          reasoningAgent: getReasoningAgent(focused),
          executionAgents: getExecutionAgents(focused),
          autonomy: getAutonomyPolicy(focused),
          parent: parent ? `${parent.id} ${parent.title}` : undefined,
          children: focused.children.map((id) => ({
            id,
            title: goals[id].title,
            relation: goals[id].relation,
          })),
        },
        action,
        agent,
        riskLevel,
        approvedBy,
        context: canvasStages
          .map((stage) => {
            const key = `${focused.id}:${stage.id}`;
            return drafts[key] ?? getInitialDraft(focused, stage.id);
          })
          .join("\n\n---\n\n"),
      });

      setAgentRuns((current) =>
        current.map((item) =>
          item.id === runId
            ? {
                ...item,
                status: "review-required",
                completedAt: new Date().toISOString(),
                outcome: response.outcome,
                evidence: response.evidence,
                needsDecision: response.needsDecision,
                decisionQuestion: response.decisionQuestion,
                provider: response.provider,
              }
            : item,
        ),
      );
      appendThreadEntry(
        `${focused.id}:execute`,
        "evidence",
        agent,
        `${response.outcome}\n\nEvidence：${response.evidence
          .map((item) => item.label)
          .join("、") || "无"}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Agent Run 失败";
      setAgentRuns((current) =>
        current.map((item) =>
          item.id === runId
            ? {
                ...item,
                status: "failed",
                completedAt: new Date().toISOString(),
                error: message,
              }
            : item,
        ),
      );
      appendThreadEntry(
        `${focused.id}:execute`,
        "system",
        "系统",
        `Agent Run 失败：${message}`,
      );
    }
  };

  const decideAgentRun = (runId: string, decision: "accepted" | "redo") => {
    const run = agentRuns.find((item) => item.id === runId);
    if (!run) return;
    const decisionText =
      decision === "accepted"
        ? "DRI 已接受本次结果，Evidence 进入 Objective 验收上下文。"
        : "DRI 要求重做，本次结果保留为历史证据，不作为当前结论。";
    setAgentRuns((current) =>
      current.map((item) =>
        item.id === runId
          ? { ...item, status: decision, decision: decisionText }
          : item,
      ),
    );
    appendThreadEntry(
      `${focused.id}:verify`,
      "decision",
      getHumanDri(focused),
      `${decisionText}\nAction：${run.action}`,
    );
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
        className="relative min-h-0 flex-1 overflow-auto bg-slate-100 p-2 sm:p-4"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(100,116,139,.18) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        <div className="flex min-w-0 items-start gap-2 sm:gap-3">
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
              <TimelineView
                focused={focused}
                onOpen={openGoalCanvas}
                threads={threads}
              />
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
              threadCountByStage={threadCountByStage}
              threadEntriesByStage={threadEntriesByStage}
              threadEntries={threadEntries}
              threadOpen={threadOpen}
              versions={currentVersions}
              agentRuns={currentAgentRuns}
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
              onAskAgent={() => {
                const instruction =
                  agentRequests[collaborationKey] ||
                  "请审查当前草稿，修正问题并补充缺失信息；不确定内容标记为待确认。";
                setAgentRequests((current) => ({
                  ...current,
                  [collaborationKey]: "",
                }));
                void askAgent(instruction);
              }}
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
                appendThreadEntry(
                  collaborationKey,
                  "system",
                  "系统",
                  "已采用 Agent 提案作为待确认草稿。",
                );
              }}
              onConfirmDraft={confirmDraft}
              onDecideAgentRun={decideAgentRun}
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
              onStartAgentRun={(action, agent, riskLevel) => {
                void startAgentRun(action, agent, riskLevel);
              }}
              onSelectChild={setSelectedChildId}
              onThreadClose={() => setThreadOpen(false)}
              onThreadOpen={() => setThreadOpen(true)}
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
            <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">Objective Directory</p>
            <p className="text-xs font-semibold text-slate-900">目标目录</p>
          </div>
        </div>

        <nav
          aria-label="当前目标层级"
          className="order-3 flex w-full min-w-0 items-center gap-1 sm:order-none sm:w-auto sm:flex-1 sm:flex-wrap"
        >
          {path.map((node, index) => (
            <div className="flex min-w-0 flex-1 items-center gap-1 sm:flex-none" key={node.id}>
              {index > 0 ? <ChevronRight className="h-4 w-4 text-slate-300" /> : null}
              <button
                aria-current={node.id === focused.id ? "page" : undefined}
                className={`min-w-0 flex-1 rounded-md px-3 py-2 text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 sm:flex-none ${
                  node.id === focused.id
                    ? "bg-cyan-50 text-cyan-950 ring-1 ring-cyan-200"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                }`}
                onClick={() => onFocus(node.id)}
                type="button"
              >
                <span className="block font-mono text-[8px] font-bold text-cyan-700">{node.id}</span>
                <span className="block truncate text-xs font-semibold sm:max-w-52">{node.title}</span>
              </button>
            </div>
          ))}
        </nav>

        <label className="relative order-4 w-full sm:order-none sm:w-auto">
          <span className="sr-only">跳转到指定目标</span>
          <select
            className="h-9 w-full appearance-none truncate rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 focus:border-cyan-600 focus:outline-none focus:ring-2 focus:ring-cyan-100 sm:max-w-72"
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
    <aside className="sticky top-0 hidden w-16 shrink-0 rounded-lg border border-slate-300 bg-white shadow-sm sm:block">
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
            Objective Map
          </div>
          <h1 className="mt-1 text-lg font-semibold text-slate-950">
            {focused.id} · {focused.title}
          </h1>
          <p className="mt-1 text-xs text-slate-500">
            当前以此目标为地图根节点。进入下一级仍留在地图，只有明确编辑时才进入目标工作台。
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 text-[10px] text-slate-500">
            <span><strong className="text-slate-900">{allGoalIds.length}</strong> 个目标</span>
            <span><strong className="text-amber-700">{attentionCount}</strong> 个需关注</span>
            <span><strong className="text-cyan-700">{depth}</strong> 层深度</span>
          </div>
          <button
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-cyan-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
            onClick={() => onOpen(focused.id)}
            type="button"
          >
            <PanelTop className="h-3.5 w-3.5" />
            进入目标工作台
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
                  <p className="mt-2 text-xs font-semibold text-slate-600">当前是叶子目标</p>
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
        <div className="min-w-0">
          <p className="truncate text-[9px] font-semibold text-slate-600">
            DRI · {getHumanDri(goal)}
          </p>
          {!small ? (
            <p className="mt-0.5 truncate text-[8px] text-slate-400">
              Agent · {getReasoningAgent(goal)}
            </p>
          ) : null}
        </div>
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
            title="进入目标工作台"
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
    status === "原型已实现" || status === "已确认" || status === "已核验"
      ? "bg-emerald-100 text-emerald-700"
      : status === "开发中" || status === "进行中"
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
        <h1 className="mt-1 text-lg font-semibold text-slate-950">当前目标的上下游依赖</h1>
        <p className="mt-1 text-xs text-slate-500">左侧解释它为什么存在，右侧展示它依赖哪些下级结果成立。</p>
      </header>

      <div className="grid min-h-[560px] grid-cols-[1fr_72px_1.2fr_72px_1.4fr] items-center gap-3 bg-slate-50 p-6">
        <DependencyColumn label="上游目标">
          {parent ? (
            <DependencyNode goal={parent} onClick={onFocus} />
          ) : (
            <DependencyEmpty text="这是根目标，没有上级目标" />
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
          <div className="mt-4 whitespace-pre-line border-t border-slate-700 pt-3 text-[10px] leading-4 text-slate-400">
            {formatKeyResults(focused)}
          </div>
          <button
            className="mt-4 inline-flex min-h-9 items-center gap-1.5 rounded-md bg-cyan-300 px-3 text-xs font-semibold text-slate-950 hover:bg-cyan-200"
            onClick={() => onOpen(focused.id)}
            type="button"
          >
            在目标文档中处理
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
            <DependencyEmpty text="当前是叶子目标，下一步应进入执行或继续拆解" />
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
        <span>Objective</span>
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
              <p className="whitespace-pre-line pr-5 text-[10px] leading-4 text-slate-600">{formatKeyResults(goal)}</p>
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
          <p className="mt-1 text-xs text-slate-500">按运行状态聚合目标，快速定位停滞、执行和需要人介入的工作。</p>
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
  threads,
}: {
  focused: GoalNode;
  onOpen: (id: string) => void;
  threads: Record<string, ThreadEntry[]>;
}) {
  const baselineEvents = [
    {
      label: "目标与 KR",
      title: `${focused.id} ${focused.title} 的目标契约被提出`,
      detail: `${focused.objective}\n${formatKeyResults(focused)}`,
      actor: focused.level === 0 ? "产品负责人" : "上级目标推导",
      state: "完成",
      goalId: focused.id,
      createdAt: "",
    },
    {
      label: "必要条件",
      title: "Agent 生成候选必要条件",
      detail: getConditionRows(focused).map(([, condition]) => condition).join("、"),
      actor: "必要条件 Agent",
      state: focused.status === "待启动" ? "待开始" : "完成",
      goalId: focused.id,
      createdAt: "",
    },
    {
      label: "路线",
      title: focused.children.length > 0 ? `生成 ${focused.children.length} 个下级目标` : "尚未形成下级路线",
      detail: focused.children.length > 0 ? focused.children.map((id) => goals[id].title).join("、") : "需判断可直接执行，还是继续拆解。",
      actor: "路径规划 Agent",
      state: focused.children.length > 0 ? "完成" : "待开始",
      goalId: focused.id,
      createdAt: "",
    },
    {
      label: "执行",
      title: `${focused.owner} 承接当前目标`,
      detail: "在权限和风险边界内推进，异常事项升级处理。",
      actor: focused.owner,
      state: focused.status,
      goalId: focused.id,
      createdAt: "",
    },
    {
      label: "验收复盘",
      title: "证据核验 KR，并更新父级支撑状态",
      detail: formatKeyResults(focused),
      actor: "验收与复盘 Agent + 人类负责人",
      state: focused.status === "待确认" ? "待处理" : "未到达",
      goalId: focused.id,
      createdAt: "",
    },
  ];
  const collaborationEvents = Object.entries(threads)
    .filter(([key]) => {
      const objectiveId = key.split(":")[0];
      return (
        objectiveId === focused.id ||
        objectiveId.startsWith(`${focused.id}.`)
      );
    })
    .flatMap(([key, entries]) => {
      const [objectiveId, stageId] = key.split(":");
      const stageLabel =
        canvasStages.find((stage) => stage.id === stageId)?.label ??
        stageId;
      return entries.map((entry) => ({
        label: stageLabel,
        title: `${objectiveId} · ${
          entry.kind === "proposal"
            ? "修改提案"
            : entry.kind === "agent-analysis"
              ? "AI 分析"
              : entry.kind === "decision"
                ? "确认决策"
                : entry.kind === "comment"
                  ? "协作讨论"
                  : "系统事件"
        }`,
        detail: entry.content,
        actor: entry.actor,
        state: entry.kind === "decision" ? "已确认" : "已记录",
        goalId: objectiveId,
        createdAt: entry.createdAt,
      }));
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const events =
    collaborationEvents.length > 0
      ? collaborationEvents
      : baselineEvents;

  return (
    <section className="overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm">
      <header className="flex items-end justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-violet-700">
            <Clock3 className="h-3.5 w-3.5" />
            Timeline
          </div>
          <h1 className="mt-1 text-lg font-semibold text-slate-950">{focused.id} 的演进记录</h1>
          <p className="mt-1 text-xs text-slate-500">
            {collaborationEvents.length > 0
              ? `聚合当前目标及下级文档的 ${collaborationEvents.length} 条真实协作事件。`
              : "尚无真实协作事件，当前展示目标生命周期结构。"}
          </p>
        </div>
        <button
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-cyan-800"
          onClick={() => onOpen(focused.id)}
          type="button"
        >
          进入目标工作台
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="mx-auto max-w-4xl px-8 py-8">
        {events.map((event, index) => (
          <article className="relative grid grid-cols-[100px_28px_1fr] gap-4 pb-8 last:pb-0" key={`${event.goalId}-${event.label}-${event.createdAt}-${index}`}>
            <div className="pt-1 text-right">
              <p className="text-xs font-semibold text-slate-800">{event.label}</p>
              <p className="mt-1 text-[9px] text-slate-400">事件 {index + 1}</p>
            </div>
            <div className="relative flex justify-center">
              {index < events.length - 1 ? <div className="absolute bottom-[-32px] top-4 w-px bg-slate-300" /> : null}
              <span className={`relative z-10 mt-1 h-3 w-3 rounded-full border-2 border-white ring-2 ${
                event.state === "完成" || event.state === "已确认" ? "bg-emerald-500 ring-emerald-200" : "bg-slate-300 ring-slate-200"
              }`} />
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-slate-950">{event.title}</h2>
                <span className="rounded bg-white px-2 py-1 text-[9px] font-semibold text-slate-500">{event.state}</span>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">{event.detail}</p>
              <div className="mt-3 flex items-center justify-between gap-3 text-[9px] text-slate-400">
                <span>
                  参与者：{event.actor}
                  {event.createdAt
                    ? ` · ${new Date(event.createdAt).toLocaleString("zh-CN")}`
                    : ""}
                </span>
                <button
                  className="font-semibold text-cyan-700 hover:underline"
                  onClick={() => onOpen(event.goalId)}
                  type="button"
                >
                  打开文档
                </button>
              </div>
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
  agentRuns,
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
  threadCountByStage,
  threadEntriesByStage,
  threadEntries,
  threadOpen,
  versions,
  onAgentRequestChange,
  onApplySuggestion,
  onAskAgent,
  onConfirmDraft,
  onDecideAgentRun,
  onDraftChange,
  onMethodChange,
  onRedo,
  onReview,
  onSelectChild,
  onStartAgentRun,
  onStageChange,
  onThreadClose,
  onThreadOpen,
  onZoom,
}: {
  focused: GoalNode;
  activeStage: CanvasStage;
  agentRuns: AgentRun[];
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
  threadCountByStage: Record<CanvasStage, number>;
  threadEntriesByStage: Record<CanvasStage, ThreadEntry[]>;
  threadEntries: ThreadEntry[];
  threadOpen: boolean;
  versions: WorkspaceVersion[];
  onAgentRequestChange: (value: string) => void;
  onApplySuggestion: () => void;
  onAskAgent: () => void;
  onConfirmDraft: () => void;
  onDecideAgentRun: (runId: string, decision: "accepted" | "redo") => void;
  onDraftChange: (value: string) => void;
  onMethodChange: (methodId: string) => void;
  onRedo: () => void;
  onReview: () => void;
  onSelectChild: (id: string) => void;
  onStartAgentRun: (
    action: string,
    agent: string,
    riskLevel: AgentRun["riskLevel"],
  ) => void;
  onStageChange: (stage: CanvasStage) => void;
  onThreadClose: () => void;
  onThreadOpen: () => void;
  onZoom: (id: string) => void;
}) {
  const parent = focused.parentId ? goals[focused.parentId] : null;
  const conditionsForGoal = getConditionRows(focused);
  const workFacts = getObjectiveWorkFacts(focused);
  const [threadAnchor, setThreadAnchor] = useState<string | null>(null);

  return (
    <article className="relative overflow-hidden rounded-lg border border-slate-300 bg-white shadow-[0_14px_40px_rgba(15,23,42,.08)]">
      <header className="border-b border-slate-200 px-4 py-5 sm:px-8 sm:py-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 max-w-4xl">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold text-slate-400">
              <span className="rounded border border-slate-200 px-1.5 py-0.5 font-mono">{focused.id}</span>
              <span>Objective Workspace｜目标工作台</span>
              <span>·</span>
              <span>第 {focused.level + 1} 层</span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-slate-950">{focused.title}</h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-slate-700">{focused.objective}</p>
            {parent ? (
              <button
                className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-cyan-800"
                onClick={() => onZoom(parent.id)}
                type="button"
              >
                <ChevronRight className="h-3.5 w-3.5 rotate-180" />
                由 {parent.id} 的 {focused.relation} 推导
              </button>
            ) : (
              <p className="mt-3 text-xs text-slate-400">根目标 · 所有下级工作与证据最终回流到此文档</p>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px]">
            <span className="rounded border border-slate-200 bg-slate-50 px-2 py-1 font-semibold text-slate-700">
              DRI · {getHumanDri(focused)}
            </span>
            <span className="rounded bg-slate-950 px-2 py-1 font-semibold text-white">{focused.status}</span>
            <button
              className="inline-flex min-h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 py-1 font-semibold text-slate-700 hover:border-cyan-500 hover:text-cyan-800"
              onClick={() => {
                setThreadAnchor(null);
                onThreadOpen();
              }}
              type="button"
            >
              <Sparkles className="h-3.5 w-3.5" />
              推演 {threadEntries.length}
            </button>
          </div>
        </div>
        <ObjectiveGovernanceBar focused={focused} />
      </header>

      <div className="grid lg:grid-cols-[190px_minmax(0,1fr)]">
        <ObjectiveDocumentOutline activeStage={activeStage} onChange={onStageChange} />
        <div className="min-w-0 px-4 py-5 sm:px-8 sm:py-7">
          <ObjectivePlainTextOutline focused={focused} />
          <ObjectiveDocumentBody
            activeStage={activeStage}
            agentRuns={agentRuns}
            conditions={conditionsForGoal}
            focused={focused}
            onReview={onReview}
            onDecideAgentRun={onDecideAgentRun}
            onSelectChild={onSelectChild}
            onStartAgentRun={onStartAgentRun}
            onStageChange={onStageChange}
            onThreadOpen={(stage, anchor) => {
              onStageChange(stage);
              setThreadAnchor(anchor ?? null);
              onThreadOpen();
            }}
            onZoom={onZoom}
            reviewed={reviewed}
            selectedChildId={selectedChildId}
            threadCountByStage={threadCountByStage}
            threadEntriesByStage={threadEntriesByStage}
            workFacts={workFacts}
          />
        </div>
      </div>
      {threadOpen ? (
        <CollaborationThreadPanel
          activeStage={activeStage}
          anchor={threadAnchor}
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
          threadEntries={threadEntries}
          versions={versions}
          onAgentRequestChange={onAgentRequestChange}
          onApplySuggestion={onApplySuggestion}
          onAskAgent={onAskAgent}
          onClose={() => {
            setThreadAnchor(null);
            onThreadClose();
          }}
          onConfirm={onConfirmDraft}
          onDraftChange={onDraftChange}
          onMethodChange={onMethodChange}
          onRedo={onRedo}
        />
      ) : null}
    </article>
  );
}

function ObjectiveDocumentOutline({
  activeStage,
  onChange,
}: {
  activeStage: CanvasStage;
  onChange: (stage: CanvasStage) => void;
}) {
  return (
    <nav aria-label="目标文档目录" className="border-r border-slate-200 bg-slate-50 px-3 py-6">
      <p className="px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">文档目录</p>
      <div className="mt-3 space-y-1">
      {canvasStages.map((stage, index) => {
        const active = stage.id === activeStage;
        return (
          <button
            aria-current={active ? "location" : undefined}
            className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition ${
              active ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200" : "text-slate-500 hover:bg-white hover:text-slate-800"
            }`}
            key={stage.id}
            onClick={() => onChange(stage.id)}
            type="button"
          >
            <span className={`font-mono text-[10px] ${active ? "text-cyan-700" : "text-slate-400"}`}>0{index + 1}</span>
            <span className="text-xs font-medium">{stage.label}</span>
          </button>
        );
      })}
      </div>
    </nav>
  );
}

function ObjectiveGovernanceBar({ focused }: { focused: GoalNode }) {
  const executionAgents = getExecutionAgents(focused);
  return (
    <section
      aria-label="Objective 协作责任"
      className="mt-5 grid divide-y divide-slate-200 border-y border-slate-200 sm:grid-cols-[1fr_1fr_1.2fr] sm:divide-x sm:divide-y-0"
    >
      <div className="flex items-start gap-2 py-3 sm:pr-4">
        <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-slate-700" />
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase text-slate-400">Human DRI · 结果责任</p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-900">{getHumanDri(focused)}</p>
          <p className="mt-0.5 text-[10px] leading-4 text-slate-500">定义目标、授权边界与最终验收</p>
        </div>
      </div>
      <div className="flex items-start gap-2 py-3 sm:px-4">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" />
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase text-slate-400">Reasoning Agent · 推理</p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-900">{getReasoningAgent(focused)}</p>
          <p className="mt-0.5 text-[10px] leading-4 text-slate-500">分析条件、生成工作与提出决策请求</p>
        </div>
      </div>
      <div className="flex items-start gap-2 py-3 sm:pl-4">
        <Bot className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
        <div className="min-w-0">
          <p className="text-[9px] font-semibold uppercase text-slate-400">Execution Agent · 执行</p>
          <p className="mt-1 truncate text-xs font-semibold text-slate-900">{executionAgents.join(" · ")}</p>
          <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-slate-500">{getAutonomyPolicy(focused)}</p>
        </div>
      </div>
    </section>
  );
}

function ObjectivePlainTextOutline({ focused }: { focused: GoalNode }) {
  const childCount = focused.children.length;
  return (
    <details className="mx-auto mb-3 max-w-4xl border-b border-slate-200 pb-4">
      <summary className="cursor-pointer text-[10px] font-semibold text-slate-400 hover:text-slate-700">
        查看结构摘要
      </summary>
      <pre className="mt-3 overflow-x-auto whitespace-pre font-mono text-xs leading-6 text-slate-600">{`目标 Objective
├── 关键结果 Key Results × ${focused.keyResults.length}
├── 必要条件 Necessary Conditions × ${Math.max(childCount, 1)}
│   └── 下级目标 Child Objective × ${childCount}
├── 举措 Initiative
│   └── 行动 Action → 实际结果 Outcome
└── 证据 Evidence → 审查 Review → 决策 Decision`}</pre>
    </details>
  );
}

type ObjectiveWorkFacts = {
  initiative: string;
  action: string;
  outcome: string;
  evidence: string;
  decision: string;
};

function ObjectiveDocumentBody({
  activeStage,
  agentRuns,
  conditions,
  focused,
  reviewed,
  selectedChildId,
  onDecideAgentRun,
  onReview,
  onSelectChild,
  onStartAgentRun,
  onStageChange,
  onThreadOpen,
  onZoom,
  threadCountByStage,
  threadEntriesByStage,
  workFacts,
}: {
  activeStage: CanvasStage;
  agentRuns: AgentRun[];
  conditions: string[][];
  focused: GoalNode;
  reviewed: boolean;
  selectedChildId: string | null;
  onDecideAgentRun: (runId: string, decision: "accepted" | "redo") => void;
  onReview: () => void;
  onSelectChild: (id: string) => void;
  onStartAgentRun: (
    action: string,
    agent: string,
    riskLevel: AgentRun["riskLevel"],
  ) => void;
  onStageChange: (stage: CanvasStage) => void;
  onThreadOpen: (stage: CanvasStage, anchor?: string) => void;
  onZoom: (id: string) => void;
  threadCountByStage: Record<CanvasStage, number>;
  threadEntriesByStage: Record<CanvasStage, ThreadEntry[]>;
  workFacts: ObjectiveWorkFacts;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <DocumentSection
        active={activeStage === "goal"}
        index="01"
        label="Objective｜目标与关键结果"
        latestEntry={threadEntriesByStage.goal.at(-1)}
        onFocus={() => onStageChange("goal")}
        onThreadOpen={() => onThreadOpen("goal", "Objective｜目标与关键结果")}
        threadCount={threadCountByStage.goal}
      >
        <p className="text-sm leading-6 text-slate-600">{focused.problem}</p>
        <div className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
          {focused.keyResults.map((result, index) => (
            <div className="group/conclusion grid gap-3 py-3 sm:grid-cols-[48px_1fr_auto_auto] sm:items-center" key={result}>
              <span className="font-mono text-[10px] font-bold text-cyan-700">KR{index + 1}</span>
              <span className="text-sm text-slate-800">{result}</span>
              <span className="text-[10px] text-slate-400">待证据</span>
              <ReasoningTraceButton
                label={`KR${index + 1}`}
                onClick={() => onThreadOpen("goal", `KR${index + 1}｜${result}`)}
              />
            </div>
          ))}
        </div>
      </DocumentSection>

      <DocumentSection
        active={activeStage === "conditions"}
        index="02"
        label="Necessary Conditions｜必要条件"
        latestEntry={threadEntriesByStage.conditions.at(-1)}
        onFocus={() => onStageChange("conditions")}
        onThreadOpen={() => onThreadOpen("conditions", "Necessary Conditions｜必要条件")}
        threadCount={threadCountByStage.conditions}
      >
        <p className="text-xs leading-5 text-slate-500">删除任意一项后，如果目标仍能成立，它就不是必要条件。</p>
        <div className="mt-4 space-y-3">
          {conditions.map(([id, condition], index) => {
            const childId = focused.children[index];
            const child = childId ? goals[childId] : null;
            const selected = childId === selectedChildId;
            return (
              <div className="border-l border-slate-300 pl-4" key={id}>
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 font-mono text-[10px] font-bold text-cyan-700">{id}</span>
                  <div className="min-w-0 flex-1">
                    <div className="group/conclusion flex items-start justify-between gap-3">
                      <p className="text-sm font-medium text-slate-800">{condition}</p>
                      <ReasoningTraceButton
                        label={id}
                        onClick={() => onThreadOpen("conditions", `${id}｜${condition}`)}
                      />
                    </div>
                    {child ? (
                      <div className={`mt-2 flex items-center rounded-md border bg-white ${selected ? "border-cyan-500" : "border-slate-200"}`}>
                        <button className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left" onClick={() => onSelectChild(child.id)} type="button">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded border border-slate-200 bg-slate-50 font-mono text-[9px] font-bold text-slate-500">
                            {child.id}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-[10px] font-semibold text-slate-400">Child Objective｜下级目标文档</span>
                            <span className="mt-0.5 block text-sm font-semibold text-slate-900">{child.title}</span>
                            <span className="mt-1 block truncate text-xs text-slate-500">{child.objective}</span>
                          </span>
                        </button>
                        <button
                          aria-label={`打开${child.title}文档`}
                          className="mr-3 inline-flex shrink-0 items-center gap-1 rounded px-2 py-2 text-[10px] font-semibold text-cyan-800 hover:bg-cyan-50"
                          onClick={() => onZoom(child.id)}
                          type="button"
                        >
                          打开文档
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <p className="mt-1 text-[10px] text-slate-400">待判断：转化为下级目标、举措、约束或共享目标</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        <button
          className={`mt-5 inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold ${
            reviewed ? "border border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-slate-950 text-white hover:bg-cyan-800"
          }`}
          onClick={onReview}
          type="button"
        >
          {reviewed ? <Check className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
          {reviewed ? "因果判断已确认" : "审查必要条件"}
        </button>
      </DocumentSection>

      <DocumentSection
        active={activeStage === "path"}
        index="03"
        label="Initiative & Route｜举措与路线"
        latestEntry={threadEntriesByStage.path.at(-1)}
        onFocus={() => onStageChange("path")}
        onThreadOpen={() => onThreadOpen("path", "Initiative & Route｜举措与路线")}
        threadCount={threadCountByStage.path}
      >
        <DocumentRelation
          label="Initiative｜举措"
          onThreadOpen={() => onThreadOpen("path", `Initiative｜${workFacts.initiative}`)}
          value={workFacts.initiative}
        />
        <DocumentRelation
          label="Action｜行动"
          nested
          onThreadOpen={() => onThreadOpen("path", `Action｜${workFacts.action}`)}
          value={workFacts.action}
        />
        <p className="mt-3 text-[10px] leading-4 text-slate-400">
          路线不是独立事实对象，而是下级目标、举措、行动和依赖关系的组合视图。
        </p>
      </DocumentSection>

      <DocumentSection
        active={activeStage === "execute"}
        index="04"
        label="Execution｜执行与实际结果"
        latestEntry={threadEntriesByStage.execute.at(-1)}
        onFocus={() => onStageChange("execute")}
        onThreadOpen={() => onThreadOpen("execute", "Execution｜执行与实际结果")}
        threadCount={threadCountByStage.execute}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <DocumentFact label="Human DRI｜结果责任" value={getHumanDri(focused)} />
          <DocumentFact label="Execution Agent｜执行主体" value={getExecutionAgents(focused).join("、")} />
          <DocumentFact label="授权与升级边界" value={getAutonomyPolicy(focused)} />
        </div>
        <ExecutionRunPanel
          focused={focused}
          onDecide={onDecideAgentRun}
          onStart={onStartAgentRun}
          runs={agentRuns}
        />
        <DocumentRelation
          label="Outcome｜实际结果"
          onThreadOpen={() => onThreadOpen("execute", `Outcome｜${workFacts.outcome}`)}
          value={workFacts.outcome}
        />
        <DocumentRelation
          label="Evidence｜证据"
          nested
          onThreadOpen={() => onThreadOpen("execute", `Evidence｜${workFacts.evidence}`)}
          value={workFacts.evidence}
        />
      </DocumentSection>

      <DocumentSection
        active={activeStage === "verify"}
        index="05"
        label="Review & Decision｜审查与决策"
        latestEntry={threadEntriesByStage.verify.at(-1)}
        onFocus={() => onStageChange("verify")}
        onThreadOpen={() => onThreadOpen("verify", "Review & Decision｜审查与决策")}
        threadCount={threadCountByStage.verify}
      >
        <div className="divide-y divide-slate-200 border-y border-slate-200">
          {focused.keyResults.map((result, index) => (
            <div className="group/conclusion grid gap-3 py-3 sm:grid-cols-[48px_1fr_100px_auto]" key={result}>
              <span className="font-mono text-[10px] font-bold text-cyan-700">KR{index + 1}</span>
              <span className="text-sm text-slate-700">{result}</span>
              <span className="text-[10px] text-amber-700">证据不足</span>
              <ReasoningTraceButton
                label={`KR${index + 1} 验收`}
                onClick={() => onThreadOpen("verify", `KR${index + 1} 验收｜${result}`)}
              />
            </div>
          ))}
        </div>
        <DocumentRelation
          label="Review｜审查"
          onThreadOpen={() => onThreadOpen("verify", "Review｜比较证据、实际结果与关键结果")}
          value={`由 Review Agent 比较证据、实际结果与关键结果，区分执行偏差、路线错误和因果假设错误；${getHumanDri(focused)} 作为 DRI 负责最终验收。`}
        />
        <DocumentRelation
          label="Decision｜决策"
          nested
          onThreadOpen={() => onThreadOpen("verify", `Decision｜${workFacts.decision}`)}
          value={workFacts.decision}
        />
      </DocumentSection>
    </div>
  );
}

function ExecutionRunPanel({
  focused,
  onDecide,
  onStart,
  runs,
}: {
  focused: GoalNode;
  onDecide: (runId: string, decision: "accepted" | "redo") => void;
  onStart: (
    action: string,
    agent: string,
    riskLevel: AgentRun["riskLevel"],
  ) => void;
  runs: AgentRun[];
}) {
  const agents = getExecutionAgents(focused);
  const [action, setAction] = useState(
    focused.actions?.[0] ?? `分析“${focused.title}”的当前状态并产出下一步可执行结果。`,
  );
  const [agent, setAgent] = useState(agents[0]);
  const [riskLevel, setRiskLevel] = useState<AgentRun["riskLevel"]>("low");
  const running = runs.some((run) => run.status === "running");

  useEffect(() => {
    setAction(
      focused.actions?.[0] ??
        `分析“${focused.title}”的当前状态并产出下一步可执行结果。`,
    );
    setAgent(getExecutionAgents(focused)[0]);
    setRiskLevel("low");
  }, [focused]);

  const statusMeta: Record<
    AgentRunStatus,
    { label: string; tone: string }
  > = {
    running: { label: "运行中", tone: "bg-cyan-50 text-cyan-800" },
    "review-required": {
      label: "待 DRI 验收",
      tone: "bg-amber-50 text-amber-800",
    },
    accepted: { label: "已接受", tone: "bg-emerald-50 text-emerald-700" },
    redo: { label: "要求重做", tone: "bg-violet-50 text-violet-700" },
    failed: { label: "运行失败", tone: "bg-rose-50 text-rose-700" },
  };

  return (
    <section className="mt-5 border-y border-slate-200 bg-slate-50/70">
      <div className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_150px_112px_auto]">
        <label className="min-w-0">
          <span className="text-[9px] font-semibold uppercase text-slate-400">
            Action｜授权执行的行动
          </span>
          <input
            className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-xs text-slate-800 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
            onChange={(event) => setAction(event.target.value)}
            value={action}
          />
        </label>
        <label>
          <span className="text-[9px] font-semibold uppercase text-slate-400">
            Execution Agent
          </span>
          <select
            className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-cyan-600"
            onChange={(event) => setAgent(event.target.value)}
            value={agent}
          >
            {agents.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="text-[9px] font-semibold uppercase text-slate-400">
            风险等级
          </span>
          <select
            className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none focus:border-cyan-600"
            onChange={(event) =>
              setRiskLevel(event.target.value as AgentRun["riskLevel"])
            }
            value={riskLevel}
          >
            <option value="low">低风险</option>
            <option value="medium">中风险</option>
            <option value="high">高风险</option>
          </select>
        </label>
        <button
          className="mt-[22px] inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-cyan-800 disabled:cursor-wait disabled:opacity-50"
          disabled={running || !action.trim()}
          onClick={() => onStart(action.trim(), agent, riskLevel)}
          type="button"
        >
          {running ? (
            <Activity className="h-3.5 w-3.5 animate-pulse" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {running ? "运行中" : "DRI 授权并运行"}
        </button>
      </div>

      <div className="border-t border-slate-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h3 className="text-xs font-semibold text-slate-900">
              Agent Runs｜执行记录
            </h3>
            <p className="mt-0.5 text-[10px] text-slate-500">
              每次运行保留授权、结果、证据和 DRI 决策。
            </p>
          </div>
          <span className="font-mono text-[10px] text-slate-400">
            {runs.length} RUNS
          </span>
        </div>

        {runs.length === 0 ? (
          <div className="border-t border-dashed border-slate-200 px-4 py-5 text-center text-xs text-slate-400">
            尚无运行记录。授权一个边界明确的 Action 开始执行。
          </div>
        ) : (
          <div className="divide-y divide-slate-200 border-t border-slate-200">
            {runs.map((run) => {
              const meta = statusMeta[run.status];
              return (
                <article className="bg-white px-4 py-4" key={run.id}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded px-2 py-1 text-[9px] font-semibold ${meta.tone}`}>
                          {meta.label}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-600">
                          {run.agent}
                        </span>
                        <span className="text-[9px] text-slate-400">
                          {run.riskLevel === "low"
                            ? "低风险"
                            : run.riskLevel === "medium"
                              ? "中风险"
                              : "高风险"}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-medium leading-6 text-slate-900">
                        {run.action}
                      </p>
                      <p className="mt-1 text-[10px] text-slate-400">
                        {run.approvedBy} 授权 ·{" "}
                        {new Date(run.startedAt).toLocaleString("zh-CN")}
                      </p>
                    </div>
                    {run.status === "review-required" ? (
                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-[10px] font-semibold text-slate-700 hover:border-violet-400 hover:text-violet-700"
                          onClick={() => onDecide(run.id, "redo")}
                          type="button"
                        >
                          <RotateCcw className="h-3 w-3" />
                          要求重做
                        </button>
                        <button
                          className="inline-flex h-8 items-center gap-1 rounded bg-emerald-700 px-2.5 text-[10px] font-semibold text-white hover:bg-emerald-800"
                          onClick={() => onDecide(run.id, "accepted")}
                          type="button"
                        >
                          <Check className="h-3 w-3" />
                          接受结果
                        </button>
                      </div>
                    ) : null}
                  </div>

                  {run.status === "running" ? (
                    <p className="mt-3 flex items-center gap-2 text-xs text-cyan-700">
                      <Activity className="h-3.5 w-3.5 animate-pulse" />
                      Agent 正在读取 Objective、授权边界和当前文档……
                    </p>
                  ) : null}
                  {run.error ? (
                    <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-rose-700">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {run.error}
                    </p>
                  ) : null}
                  {run.outcome ? (
                    <div className="mt-4 border-l-2 border-cyan-600 pl-3">
                      <p className="text-[9px] font-semibold uppercase text-slate-400">
                        Outcome｜实际结果
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-slate-700">
                        {run.outcome}
                      </p>
                    </div>
                  ) : null}
                  {run.evidence.length > 0 ? (
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      {run.evidence.map((item, index) => (
                        <div
                          className="border-l border-slate-300 bg-slate-50 px-3 py-2"
                          key={`${run.id}-${item.label}-${index}`}
                        >
                          <div className="flex items-center gap-1.5">
                            <ShieldCheck className="h-3 w-3 text-emerald-700" />
                            <p className="text-[9px] font-semibold text-slate-700">
                              {item.label}
                            </p>
                            <span className="text-[8px] uppercase text-slate-400">
                              {item.kind}
                            </span>
                          </div>
                          <p className="mt-1 text-[10px] leading-4 text-slate-600">
                            {item.detail}
                          </p>
                          {item.source ? (
                            <a
                              className="mt-1 block truncate text-[9px] font-medium text-cyan-700 hover:underline"
                              href={item.source}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {item.source}
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  {run.needsDecision && run.decisionQuestion ? (
                    <p className="mt-3 flex items-start gap-2 border-l-2 border-amber-400 bg-amber-50 px-3 py-2 text-[10px] leading-4 text-amber-900">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      DRI 决策请求：{run.decisionQuestion}
                    </p>
                  ) : null}
                  {run.decision ? (
                    <p className="mt-3 flex items-start gap-2 text-[10px] leading-4 text-emerald-700">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {run.decision}
                    </p>
                  ) : null}
                  {run.provider ? (
                    <p className="mt-3 truncate font-mono text-[8px] text-slate-400">
                      {run.provider}
                    </p>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function DocumentSection({
  active,
  children,
  index,
  label,
  latestEntry,
  onFocus,
  onThreadOpen,
  threadCount,
}: {
  active: boolean;
  children: React.ReactNode;
  index: string;
  label: string;
  latestEntry?: ThreadEntry;
  onFocus: () => void;
  onThreadOpen: () => void;
  threadCount: number;
}) {
  return (
    <section className={`group/section border-l-2 py-6 pl-5 transition ${active ? "border-cyan-700" : "border-slate-200"}`}>
      <div className="flex items-center justify-between gap-3">
        <button className="flex items-center gap-3 text-left" onClick={onFocus} type="button">
          <span className={`font-mono text-[10px] font-bold ${active ? "text-cyan-700" : "text-slate-400"}`}>{index}</span>
          <h2 className="text-base font-semibold text-slate-950">{label}</h2>
        </button>
        <button
          aria-label={`打开${label}过程推演`}
          className={`inline-flex min-h-8 items-center gap-1.5 rounded px-2 py-1 text-[10px] font-semibold transition sm:opacity-0 sm:group-hover/section:opacity-100 sm:focus-visible:opacity-100 ${
            active ? "bg-cyan-50 text-cyan-800" : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          }`}
          onClick={onThreadOpen}
          type="button"
        >
          <Sparkles className="h-3.5 w-3.5" />
          过程推演{threadCount > 0 ? ` · ${threadCount}` : ""}
        </button>
      </div>
      {latestEntry ? (
        <details className="ml-8 mt-3 border-l border-cyan-200 pl-3">
          <summary className="cursor-pointer text-[10px] font-semibold text-cyan-800">
            推演记录 · {threadCount} 条
          </summary>
          <div className="mt-2 max-w-2xl text-[11px] leading-5 text-slate-500">
            <p className="font-semibold text-slate-700">{latestEntry.actor}</p>
            <p className="mt-0.5 line-clamp-3 whitespace-pre-wrap">{latestEntry.content}</p>
            <button
              className="mt-2 font-semibold text-cyan-700 hover:underline"
              onClick={onThreadOpen}
              type="button"
            >
              打开完整推演
            </button>
          </div>
        </details>
      ) : null}
      <div className="mt-4 pl-8">{children}</div>
    </section>
  );
}

function DocumentRelation({
  label,
  nested = false,
  onThreadOpen,
  value,
}: {
  label: string;
  nested?: boolean;
  onThreadOpen?: () => void;
  value: string;
}) {
  return (
    <div className={`group/conclusion mt-3 border-l border-slate-300 ${nested ? "ml-8 pl-5" : "pl-4"}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold text-slate-400">{label}</p>
        {onThreadOpen ? (
          <ReasoningTraceButton label={label} onClick={onThreadOpen} />
        ) : null}
      </div>
      <p className="mt-1 text-sm leading-6 text-slate-700">{value}</p>
    </div>
  );
}

function ReasoningTraceButton({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={`打开${label}的过程推演`}
      className="inline-flex min-h-7 shrink-0 items-center gap-1 rounded px-1.5 py-1 text-[9px] font-semibold text-cyan-700 transition sm:opacity-0 sm:group-hover/conclusion:opacity-100 sm:focus-visible:opacity-100 hover:bg-cyan-50"
      onClick={onClick}
      title="过程推演"
      type="button"
    >
      <Sparkles className="h-3 w-3" />
      过程推演
    </button>
  );
}

function DocumentFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-slate-200 pt-3">
      <p className="text-[10px] font-semibold text-slate-400">{label}</p>
      <p className="mt-1 text-xs leading-5 text-slate-700">{value}</p>
    </div>
  );
}

function getObjectiveWorkFacts(goal: GoalNode): ObjectiveWorkFacts {
  const firstChild = goal.children[0] ? goals[goal.children[0]] : null;
  return {
    initiative:
      goal.initiatives?.join("；") ??
      (firstChild
        ? `围绕“${firstChild.title}”组织当前周期的方案、资源与依赖。`
        : `形成“${goal.title}”的可执行方案，并明确范围、负责人和依赖。`),
    action:
      goal.actions?.join("；") ??
      `${getExecutionAgents(goal).join("、")} 在授权边界内完成当前优先事项，并持续回填状态、阻塞和产物。`,
    outcome:
      goal.outcome ??
      (goal.status === "原型已实现" || goal.status === "开发中"
        ? "已有阶段性产物，尚未完成关键结果验收。"
        : "尚未产生经过确认的实际结果。"),
    evidence: goal.evidence ?? "待连接可追溯的文档、数据、日志或人工确认记录。",
    decision:
      goal.decision ??
      (goal.status === "待确认"
        ? "等待责任人确认后推进。"
        : "证据不足，保持推进并在关键结果验收时重新判断。"),
  };
}

function summarizeVersionChanges(versions: WorkspaceVersion[]): string {
  if (versions.length === 0) {
    return "尚未形成正式版本。完成推演并确认后，结论变化会记录在这里。";
  }

  const distinctDrafts = [...new Set(versions.map((version) => version.draft))];
  if (distinctDrafts.length === 1) {
    return `已经历 ${versions.length} 次确认，形成 1 个结论版本；结论内容尚未发生实质变化。`;
  }

  const firstLines = new Set(
    distinctDrafts[0].split("\n").map((line) => line.trim()).filter(Boolean),
  );
  const latestLines = new Set(
    distinctDrafts.at(-1)!.split("\n").map((line) => line.trim()).filter(Boolean),
  );
  const added = [...latestLines].filter((line) => !firstLines.has(line)).length;
  const removed = [...firstLines].filter((line) => !latestLines.has(line)).length;

  return `已经历 ${versions.length} 次确认，形成 ${distinctDrafts.length} 个不同结论版本；最新版本较首版新增 ${added} 行、移除 ${removed} 行。`;
}

function CollaborationThreadPanel({
  activeStage,
  anchor,
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
  threadEntries,
  versions,
  onAgentRequestChange,
  onApplySuggestion,
  onAskAgent,
  onClose,
  onConfirm,
  onDraftChange,
  onMethodChange,
  onRedo,
  selectedMethod,
}: {
  activeStage: CanvasStage;
  anchor: string | null;
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
  threadEntries: ThreadEntry[];
  versions: WorkspaceVersion[];
  onAgentRequestChange: (value: string) => void;
  onApplySuggestion: () => void;
  onAskAgent: () => void;
  onClose: () => void;
  onConfirm: () => void;
  onDraftChange: (value: string) => void;
  onMethodChange: (methodId: string) => void;
  onRedo: () => void;
  selectedMethod: MethodDefinition;
}) {
  const meta = stageAgentMeta[activeStage];
  const stageLabel =
    canvasStages.find((stage) => stage.id === activeStage)?.label ??
    activeStage;
  const checkResults = getMethodCheckResults(
    focused,
    activeStage,
    selectedMethod,
    draft,
  );
  const passedCount = checkResults.filter((result) => result.passed).length;
  const proposalCount = threadEntries.filter(
    (entry) => entry.kind === "proposal",
  ).length;
  const decisionCount = threadEntries.filter(
    (entry) => entry.kind === "decision",
  ).length;
  const analysisCount = threadEntries.filter(
    (entry) => entry.kind === "agent-analysis",
  ).length;
  const roundCount = Math.max(
    proposalCount,
    decisionCount,
    threadEntries.length > 0 ? 1 : 0,
  );
  const versionChangeSummary = summarizeVersionChanges(versions);
  const visibleEntries =
    threadEntries.length > 0
      ? threadEntries
      : [
          {
            id: "thread-start",
            kind: "system" as const,
            actor: "系统",
            content: `过程推演已锚定到“${stageLabel}”。讨论、AI 分析、提案和决策都会保留在这里。`,
            createdAt: "",
          },
        ];

  return (
    <aside
      aria-label={`${stageLabel}过程推演`}
      className="fixed bottom-4 right-4 top-4 z-50 flex w-[620px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-[0_24px_80px_rgba(15,23,42,.24)] lg:right-20"
    >
      <header className="border-b border-slate-200 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-cyan-700" />
              <h2 className="text-sm font-semibold text-slate-950">过程推演</h2>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
                {threadEntries.length}
              </span>
            </div>
            <p className="mt-1 truncate text-[10px] text-slate-500">
              {focused.id} · {stageLabel}
            </p>
          </div>
          <button
            aria-label="关闭过程推演"
            className="grid h-8 w-8 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-800"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {anchor ? (
          <div className="mt-3 border-l-2 border-cyan-500 bg-cyan-50 px-3 py-2">
            <p className="flex items-center gap-1 text-[9px] font-semibold text-cyan-700">
              <Sparkles className="h-3 w-3" />
              当前锚定结论
            </p>
            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-cyan-950">
              {anchor}
            </p>
          </div>
        ) : null}
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <label className="sr-only" htmlFor={`thread-method-${focused.id}-${activeStage}`}>
            当前推演方法
          </label>
          <select
            className="min-w-0 rounded-md border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-700 outline-none focus:border-cyan-600"
            id={`thread-method-${focused.id}-${activeStage}`}
            onChange={(event) => onMethodChange(event.target.value)}
            value={selectedMethod.id}
          >
            {availableMethods.map((method) => (
              <option key={method.id} value={method.id}>
                {method.name}
              </option>
            ))}
          </select>
          <span className="rounded-md bg-slate-100 px-2.5 py-2 text-[10px] font-semibold text-slate-600">
            检查 {passedCount}/{checkResults.length}
          </span>
        </div>
        <p className="mt-2 text-[10px] leading-4 text-slate-400">
          {meta.name} 代表推理 Agent 提交分析与提案 · {selectedMethod.summary}
        </p>
        <div className="mt-3 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-200 text-[9px]">
          <div className="py-2 pr-2">
            <p className="text-slate-400">DRI</p>
            <p className="mt-0.5 truncate font-semibold text-slate-700">{getHumanDri(focused)}</p>
          </div>
          <div className="px-2 py-2">
            <p className="text-slate-400">推理 Agent</p>
            <p className="mt-0.5 truncate font-semibold text-cyan-800">{getReasoningAgent(focused)}</p>
          </div>
          <div className="py-2 pl-2">
            <p className="text-slate-400">执行 Agent</p>
            <p className="mt-0.5 truncate font-semibold text-violet-800">{getExecutionAgents(focused).join(" · ")}</p>
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <section className="mb-6 overflow-hidden rounded-md bg-slate-950 text-white">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 px-4 py-3">
            <div>
              <p className="text-[10px] font-semibold uppercase text-cyan-300">
                推演总结
              </p>
              <p className="mt-1 text-sm font-semibold">
                {roundCount > 0
                  ? `当前结论经过 ${roundCount} 轮过程推演`
                  : "当前结论尚未开始过程推演"}
              </p>
            </div>
            <span className="rounded bg-white/10 px-2 py-1 text-[9px] text-slate-300">
              {confirmed ? "已回写结果" : "等待结果确认"}
            </span>
          </div>
          <div className="grid grid-cols-4 divide-x divide-white/10">
            {[
              ["推演轮次", roundCount],
              ["AI 分析", analysisCount],
              ["修改提案", proposalCount],
              ["正式版本", versions.length],
            ].map(([label, value]) => (
              <div className="px-3 py-3" key={label}>
                <p className="text-lg font-semibold text-white">{value}</p>
                <p className="mt-0.5 text-[9px] text-slate-400">{label}</p>
              </div>
            ))}
          </div>
          <p className="border-t border-white/10 px-4 py-3 text-[10px] leading-5 text-slate-300">
            {versionChangeSummary}
          </p>
        </section>

        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-xs font-semibold text-slate-900">历史推演过程</h3>
            <p className="mt-1 text-[10px] text-slate-400">
              保留讨论、分析、提案、决策和结果回写的完整顺序。
            </p>
          </div>
          <span className="font-mono text-[10px] text-slate-400">
            {threadEntries.length} EVENTS
          </span>
        </div>
        <div className="space-y-4 border-l border-slate-200 pl-4">
          {visibleEntries.map((entry) => (
            <ThreadEntryItem entry={entry} key={entry.id} />
          ))}
          {agentLoading ? (
            <div className="relative">
              <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-cyan-600 ring-4 ring-white" />
              <div className="flex items-start gap-2">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-cyan-700 text-white">
                  <Bot className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="text-[10px] font-semibold text-cyan-800">AI 正在分析</p>
                  <p className="mt-1 animate-pulse text-xs leading-5 text-slate-500">
                    正在读取当前文档、上下游关系与方法检查项……
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <details className="mt-5 border-t border-slate-200 pt-4" open={Boolean(agentSuggestion)}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-xs font-semibold text-slate-800">
            <span className="inline-flex items-center gap-2">
              <FileDiff className="h-4 w-4 text-cyan-700" />
              待确认文档草稿
            </span>
            <span className={confirmed ? "text-emerald-700" : "text-amber-700"}>
              {confirmed ? "已写入" : "未确认"}
            </span>
          </summary>
          <textarea
            className="mt-3 min-h-44 w-full resize-y rounded-md border border-slate-300 bg-slate-50 p-3 font-mono text-[11px] leading-5 text-slate-700 outline-none focus:border-cyan-600 focus:bg-white"
            id={`draft-${focused.id}-${activeStage}`}
            onChange={(event) => onDraftChange(event.target.value)}
            value={draft}
          />
          {agentProposal?.questions.length ? (
            <ul className="mt-2 space-y-1 text-[10px] leading-4 text-amber-800">
              {agentProposal.questions.map((question) => (
                <li key={question}>待确认 · {question}</li>
              ))}
            </ul>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 text-[9px] text-slate-400">
              <History className="h-3 w-3" />
              {latestSavedAt
                ? new Date(latestSavedAt).toLocaleString("zh-CN")
                : "尚无正式版本"}
            </span>
            <div className="flex items-center gap-2">
              {agentSuggestion ? (
                <button
                  className="rounded border border-slate-300 bg-white px-2.5 py-2 text-[10px] font-semibold text-slate-700 hover:border-cyan-500"
                  onClick={onApplySuggestion}
                  type="button"
                >
                  采用 AI 提案
                </button>
              ) : null}
              <button
                className={`inline-flex min-h-8 items-center gap-1.5 rounded px-2.5 py-2 text-[10px] font-semibold ${
                  confirmed
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "bg-slate-950 text-white hover:bg-cyan-800"
                }`}
                onClick={onConfirm}
                type="button"
              >
                <Check className="h-3.5 w-3.5" />
                {confirmed ? "DRI 已确认" : "由 DRI 确认写入"}
              </button>
            </div>
          </div>
        </details>

        {agentError ? (
          <p className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-2 text-[10px] leading-4 text-rose-700">
            {agentError}
          </p>
        ) : null}
      </div>

      <footer className="border-t border-slate-200 bg-slate-50 p-3">
        <label
          className="text-[10px] font-semibold text-slate-600"
          htmlFor={`agent-request-${focused.id}-${activeStage}`}
        >
          向推理 Agent 提出要求
        </label>
        <div className="mt-1.5 flex gap-2">
          <input
            className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 py-2.5 text-xs text-slate-700 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
            id={`agent-request-${focused.id}-${activeStage}`}
            onChange={(event) => onAgentRequestChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !agentLoading) {
                event.preventDefault();
                onAskAgent();
              }
            }}
            placeholder={anchor ? "检查这条结论的依据与风险……" : "继续分析并提出下一步工作……"}
            value={agentRequest}
          />
          <button
            className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-cyan-700 text-white hover:bg-cyan-800 disabled:cursor-wait disabled:opacity-50"
            disabled={agentLoading}
            onClick={onAskAgent}
            title="发送并让 AI 参与"
            type="button"
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2">
          <span className="text-[9px] leading-4 text-slate-400">
            Agent 在授权内执行；目标、越权例外与最终验收由 DRI 决策。
          </span>
          <button
            className="inline-flex shrink-0 items-center gap-1 text-[10px] font-medium text-slate-500 hover:text-slate-900 disabled:opacity-50"
            disabled={agentLoading}
            onClick={onRedo}
            type="button"
          >
            <RotateCcw className="h-3 w-3" />
            换种思路
          </button>
        </div>
      </footer>
    </aside>
  );
}

function ThreadEntryItem({ entry }: { entry: ThreadEntry }) {
  const meta: Record<
    ThreadEntryKind,
    { label: string; icon: typeof MessageSquare; tone: string }
  > = {
    comment: {
      label: "讨论",
      icon: UserRound,
      tone: "bg-slate-500",
    },
    "agent-analysis": {
      label: "AI 分析",
      icon: Sparkles,
      tone: "bg-cyan-600",
    },
    "agent-run": {
      label: "Agent Run",
      icon: Play,
      tone: "bg-slate-900",
    },
    evidence: {
      label: "证据回填",
      icon: ShieldCheck,
      tone: "bg-emerald-600",
    },
    proposal: {
      label: "修改提案",
      icon: FileDiff,
      tone: "bg-violet-600",
    },
    decision: {
      label: "决策",
      icon: Check,
      tone: "bg-emerald-600",
    },
    system: {
      label: "系统事件",
      icon: History,
      tone: "bg-slate-400",
    },
  };
  const current = meta[entry.kind];
  const Icon = current.icon;

  return (
    <article className="relative">
      <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${current.tone} ring-4 ring-white`} />
      <div className="flex items-start gap-2">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded border border-slate-200 bg-white text-slate-500">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold text-slate-800">
              {entry.actor} · {current.label}
            </p>
            {entry.createdAt ? (
              <time className="shrink-0 text-[9px] text-slate-400">
                {new Date(entry.createdAt).toLocaleTimeString("zh-CN", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </time>
            ) : null}
          </div>
          <p className="mt-1 max-h-36 overflow-hidden whitespace-pre-wrap text-xs leading-5 text-slate-600">
            {entry.content}
          </p>
        </div>
      </div>
    </article>
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
        <span>在正文中选择下级目标，或打开它的嵌套文档</span>
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
        打开这个文档
      </button>
    </footer>
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
      `Objective：${goal.title}`,
      `当前问题：${goal.problem}`,
      `目标描述：${goal.objective}`,
      formatKeyResults(goal),
      `Human DRI：${getHumanDri(goal)}，对目标和最终结果负责`,
      `Reasoning Agent：${getReasoningAgent(goal)}，负责分析、拆解与提案`,
      `Execution Agent：${getExecutionAgents(goal).join("、")}，在授权范围内执行并回填证据`,
      `授权边界：${getAutonomyPolicy(goal)}`,
      `范围关系：${parent ? `通过“${goal.relation}”支撑 ${parent.id} ${parent.title}` : "作为根目标统领所有下级工作"}`,
      "可实现依据：待补充",
      "时间周期：待补充",
    ].join("\n");
  }

  if (stage === "conditions") {
    const conditionDraft = getConditionRows(goal)
      .map(([id, condition]) => `${id}：${condition}`)
      .join("\n");
    return [
      `输入 Objective：${goal.title}`,
      `成功定义：\n${formatKeyResults(goal)}`,
      `候选必要条件：\n${conditionDraft}`,
      "联合充分假设：以上必要条件组合后，足以支撑当前目标成立（待验证）",
      "待审查：这些条件是否存在遗漏、重复或把实现方案误当成必要条件？",
    ].join("\n");
  }

  if (stage === "path") {
    const childObjectives =
      goal.children.length > 0
        ? goal.children
            .map((childId) => {
              const child = goals[childId];
              return `${child.relation} → 下级目标 ${child.id} ${child.title}（${child.owner}）`;
            })
            .join("\n")
        : "当前没有下级目标；需判断必要条件应由举措、约束或共享目标承担。";
    const workFacts = getObjectiveWorkFacts(goal);
    return [
      `必要条件的承担方式：\n${childObjectives}`,
      `Initiative｜举措：${workFacts.initiative}`,
      `Action｜行动：${workFacts.action}`,
      `Reasoning Agent：${getReasoningAgent(goal)} 负责说明任务为什么产生`,
      `Human DRI：${getHumanDri(goal)} 负责确认方向、授权与高风险取舍`,
      "路线检查：每条必要条件必须有明确承担方式；举措若需要独立 KR 或继续拆解，应升级为下级目标。",
    ].join("\n\n");
  }

  if (stage === "execute") {
    const workFacts = getObjectiveWorkFacts(goal);
    return [
      `Human DRI：${getHumanDri(goal)}`,
      `Execution Agent：${getExecutionAgents(goal).join("、")}`,
      `当前状态：${goal.status}`,
      `Outcome｜实际结果：${workFacts.outcome}`,
      `Evidence｜证据：${workFacts.evidence}`,
      `授权与升级边界：${getAutonomyPolicy(goal)}`,
    ].join("\n");
  }

  const workFacts = getObjectiveWorkFacts(goal);
  return [
    `Review｜审查对象：${goal.title}`,
    formatKeyResults(goal),
    ...goal.keyResults.map((_, index) => `KR${index + 1} 证据：待补充`),
    "审查：逐项核验 KR，区分执行偏差、路线错误和必要条件错误。",
    `审查分工：Review Agent 提供证据判断；Human DRI ${getHumanDri(goal)} 负责最终验收。`,
    `Decision｜决策：${workFacts.decision}`,
    "影响传播：必要时标出受影响的下级目标，并触发调整、重做或停止。",
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
  const keyResultLines: string[] = draft.match(/^KR\d+：.+$/gm) ?? [];
  const hasVerifiableKeyResults =
    keyResultLines.length > 0 &&
    keyResultLines.every((line) => !line.includes("待补充"));
  const hasFocusedKeyResults =
    keyResultLines.length >= 1 && keyResultLines.length <= 5;
  const resultsByMethod: Record<string, boolean[]> = {
    smart: [
      Boolean(goal.title && goal.objective),
      hasVerifiableKeyResults,
      hasCompletedField("可实现依据"),
      Boolean(goal.parentId) || goal.id === "G0",
      hasCompletedField("时间周期"),
    ],
    okr: [Boolean(goal.objective), hasVerifiableKeyResults, hasVerifiableKeyResults, hasFocusedKeyResults],
    "goal-contract": [true, true, true, hasVerifiableKeyResults, Boolean(goal.parentId) || goal.id === "G0"],
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
