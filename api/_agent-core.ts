export type AgentRequest = {
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

export type AgentResponse = {
  proposedDraft: string;
  rationale: string;
  questions: string[];
  provider: string;
};

type AgentEnvironment = {
  apiKey?: string;
  baseUrl?: string;
  model?: string;
};

function isAgentRequest(value: unknown): value is AgentRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<AgentRequest>;
  return Boolean(
    request.goal?.id &&
      request.goal.title &&
      request.stage &&
      request.method?.name &&
      typeof request.currentDraft === "string" &&
      typeof request.instruction === "string",
  );
}

function extractJson(content: string): unknown {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? content;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("模型没有返回 JSON 对象");
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

function normalizeResponse(value: unknown, provider: string): AgentResponse {
  if (!value || typeof value !== "object") {
    throw new Error("模型返回结构无效");
  }
  const response = value as Partial<AgentResponse>;
  if (!response.proposedDraft || !response.rationale) {
    throw new Error("模型返回缺少 proposedDraft 或 rationale");
  }
  return {
    proposedDraft: String(response.proposedDraft),
    rationale: String(response.rationale),
    questions: Array.isArray(response.questions)
      ? response.questions.map(String).slice(0, 5)
      : [],
    provider,
  };
}

export async function runAgent(
  value: unknown,
  environment: AgentEnvironment,
): Promise<AgentResponse> {
  if (!isAgentRequest(value)) {
    throw new Error("请求缺少 Goal、阶段、方法或草稿");
  }

  const apiKey = environment.apiKey;
  const baseUrl = (environment.baseUrl ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = environment.model ?? "gpt-4.1-mini";

  if (!apiKey) {
    const error = new Error("未配置 WORKGRAPH_AI_API_KEY");
    error.name = "ConfigurationError";
    throw error;
  }

  const systemPrompt = [
    "你是 WorkGraph 中的协作 Agent。",
    "你的任务是改进当前 Goal 某一阶段的结构化草稿，而不是替用户做最终决定。",
    "必须保留可追溯事实，不得虚构数据、证据、截止时间或已完成状态。",
    "不确定内容必须明确标为待确认。",
    "只返回 JSON，不要使用 Markdown 代码块。",
    'JSON 格式：{"proposedDraft":"完整的新草稿","rationale":"修改理由","questions":["需要用户确认的问题"]}',
  ].join("\n");

  const userPrompt = JSON.stringify(
    {
      goal: value.goal,
      currentStage: value.stage,
      method: value.method,
      currentDraft: value.currentDraft,
      userInstruction: value.instruction,
    },
    null,
    2,
  );

  const result = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });

  if (!result.ok) {
    const detail = await result.text();
    throw new Error(`模型请求失败（${result.status}）：${detail.slice(0, 300)}`);
  }

  const payload = (await result.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("模型没有返回内容");
  }

  return normalizeResponse(extractJson(content), `${model} @ ${baseUrl}`);
}
