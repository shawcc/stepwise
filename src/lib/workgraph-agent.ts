export type AgentProposal = {
  proposedDraft: string;
  rationale: string;
  questions: string[];
  provider: string;
};

export type AgentProposalRequest = {
  goal: {
    id: string;
    title: string;
    problem: string;
    objective: string;
    acceptance: string;
    parent?: string;
    children: Array<{ id: string; title: string; relation?: string }>;
  };
  stage: string;
  method: {
    name: string;
    summary: string;
    checks: string[];
  };
  currentDraft: string;
  instruction: string;
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
