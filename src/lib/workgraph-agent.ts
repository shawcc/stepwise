export type AgentProposal = {
  proposedDraft: string;
  rationale: string;
  questions: string[];
  provider: string;
};

export type AgentGoalContext = {
  id: string;
  title: string;
  problem: string;
  objective: string;
  acceptance: string;
  dri: string;
  reasoningAgent: string;
  executionAgents: string[];
  autonomy: string;
  parent?: string;
  children: Array<{ id: string; title: string; relation?: string }>;
};

export type AgentProposalRequest = {
  goal: AgentGoalContext;
  stage: string;
  method: {
    name: string;
    summary: string;
    checks: string[];
  };
  currentDraft: string;
  instruction: string;
};

export type ExecutionEvidence = {
  label: string;
  detail: string;
  kind: "artifact" | "observation" | "claim";
  source?: string;
};

export type ExecutionAgentRequest = {
  goal: AgentGoalContext;
  action: string;
  agent: string;
  riskLevel: "low" | "medium" | "high";
  approvedBy: string;
  context: string;
};

export type ExecutionAgentResponse = {
  outcome: string;
  evidence: ExecutionEvidence[];
  needsDecision: boolean;
  decisionQuestion?: string;
  provider: string;
};

export async function requestAgentProposal(
  request: AgentProposalRequest,
): Promise<AgentProposal> {
  const response = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<AgentProposal> & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? `Agent 请求失败（${response.status}）`);
  }
  if (!payload.proposedDraft || !payload.rationale) {
    throw new Error("Agent 返回的数据结构不完整");
  }

  return {
    proposedDraft: payload.proposedDraft,
    rationale: payload.rationale,
    questions: payload.questions ?? [],
    provider: payload.provider ?? "unknown",
  };
}

export async function requestExecutionAgent(
  request: ExecutionAgentRequest,
): Promise<ExecutionAgentResponse> {
  const response = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  const payload = (await response.json().catch(() => ({}))) as Partial<ExecutionAgentResponse> & {
    error?: string;
  };
  if (!response.ok) {
    throw new Error(payload.error ?? `Action 执行失败（${response.status}）`);
  }
  if (!payload.outcome || !Array.isArray(payload.evidence)) {
    throw new Error("执行 Agent 返回的数据结构不完整");
  }

  return {
    outcome: payload.outcome,
    evidence: payload.evidence,
    needsDecision: Boolean(payload.needsDecision),
    decisionQuestion: payload.decisionQuestion,
    provider: payload.provider ?? "unknown",
  };
}
