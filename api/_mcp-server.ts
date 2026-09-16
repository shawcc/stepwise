import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  confirmDecompositionProposal,
  createAction,
  getDecompositionProposal,
  getGoal,
  listActions,
  recordOutcome,
  submitDecision,
  type StepwiseActionStatus,
} from "./_stepwise-store.js";
import { withPersistentWorkspace } from "./_workspace-persistence.js";

type McpEnvironment = {
  writeToken?: string;
};

const responseFormatSchema = z
  .enum(["markdown", "json"])
  .default("markdown")
  .describe("Return human-readable Markdown or machine-readable JSON.");

const actionStatusSchema = z.enum([
  "proposed",
  "authorized",
  "review-required",
  "accepted",
  "redo",
]);

function result(
  value: Record<string, unknown>,
  markdown: string,
  responseFormat: "markdown" | "json",
) {
  return {
    content: [
      {
        type: "text" as const,
        text:
          responseFormat === "json"
            ? JSON.stringify(value, null, 2)
            : markdown,
      },
    ],
    structuredContent: value,
  };
}

function toolError(error: unknown) {
  return {
    isError: true,
    content: [
      {
        type: "text" as const,
        text: error instanceof Error ? error.message : "Stepwise 工具调用失败。",
      },
    ],
  };
}

function requireWriteAccess(providedToken: string, environment: McpEnvironment) {
  if (!environment.writeToken) {
    throw new Error(
      "服务端未配置 STEPWISE_MCP_WRITE_TOKEN，写操作已禁用；读取 Goal 和 Action 仍可使用。",
    );
  }
  if (providedToken !== environment.writeToken) {
    throw new Error(
      "写入凭证无效。请由 Human DRI 提供当前环境的 STEPWISE_MCP_WRITE_TOKEN。",
    );
  }
}

function actorLabel(actor: { name: string; role: string }) {
  return `${actor.name}｜${actor.role}`;
}

export function createStepwiseMcpServer(
  environment: McpEnvironment,
): McpServer {
  const server = new McpServer({
    name: "stepwise-mcp-server",
    version: "1.0.0",
  });

  server.registerTool(
    "stepwise_get_goal",
    {
      title: "Get Stepwise Goal",
      description:
        "Read one Stepwise Goal, including its Human DRI, success criteria, deadline, status, and Agent autonomy boundary. This tool never changes workspace state.",
      inputSchema: z
        .object({
          goal_id: z
            .string()
            .min(1)
            .max(80)
            .default("G0")
            .describe("Goal identifier, for example G0."),
          response_format: responseFormatSchema,
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ goal_id, response_format }) => {
      const goal = await withPersistentWorkspace(() => getGoal(goal_id));
      if (!goal) {
        return toolError(
          new Error(
            `Goal ${goal_id} 不存在。当前演示工作区的根 Goal 为 G0。`,
          ),
        );
      }
      return result(
        { goal },
        [
          `# ${goal.title} (${goal.id})`,
          "",
          `- **DRI**: ${actorLabel(goal.dri)}`,
          `- **状态**: ${goal.status}`,
          `- **时间窗**: ${goal.timebox.startsAt} → ${goal.timebox.dueAt}`,
          `- **目标**: ${goal.intent}`,
          `- **授权边界**: ${goal.autonomy}`,
          "",
          "## Success Criteria",
          ...goal.successCriteria.map(
            (keyResult, index) => `${index + 1}. ${keyResult}`,
          ),
        ].join("\n"),
        response_format,
      );
    },
  );

  server.registerTool(
    "stepwise_get_decomposition_proposal",
    {
      title: "Get Goal Decomposition Proposal",
      description:
        "Read the official Stepwise Reasoning Agent's decomposition proposal for one Goal. Proposed child Goals are not formal workspace facts until the Human DRI confirms them.",
      inputSchema: z
        .object({
          goal_id: z.string().min(1).max(80),
          response_format: responseFormatSchema,
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ goal_id, response_format }) => {
      const proposal = await withPersistentWorkspace(() =>
        getDecompositionProposal(goal_id),
      );
      if (!proposal) {
        return toolError(
          new Error(`Goal ${goal_id} 当前没有 Decomposition Proposal。`),
        );
      }
      return result(
        { proposal },
        [
          `# Decomposition Proposal ${proposal.id}`,
          "",
          `- **Goal**: ${proposal.goalId}`,
          `- **状态**: ${proposal.status}`,
          `- **提出者**: ${proposal.proposedBy.name} ${proposal.proposedBy.version ?? ""}`,
          `- **理由**: ${proposal.rationale}`,
          "",
          ...proposal.proposedGoals.map(
            (goal) =>
              `- **${goal.title}** (${goal.proposedId})\n  - DRI: ${actorLabel(goal.dri)}\n  - Deadline: ${goal.timebox.dueAt}`,
          ),
        ].join("\n"),
        response_format,
      );
    },
  );

  server.registerTool(
    "stepwise_confirm_decomposition",
    {
      title: "Confirm Goal Decomposition",
      description:
        "Record the Human DRI's decision to confirm an official decomposition proposal. Only this transition creates formal child Goals. Requires the server write token.",
      inputSchema: z
        .object({
          proposal_id: z.string().min(1).max(80),
          goal_id: z.string().min(1).max(80),
          decided_by: z.string().min(1).max(120),
          write_token: z.string().min(1),
          response_format: responseFormatSchema,
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      proposal_id,
      goal_id,
      decided_by,
      write_token,
      response_format,
    }) => {
      try {
        requireWriteAccess(write_token, environment);
        return await withPersistentWorkspace(() => {
          const goal = getGoal(goal_id);
          if (!goal) throw new Error(`Goal ${goal_id} 不存在。`);
          if (decided_by !== goal.dri.name) {
            throw new Error(
              `只有 ${actorLabel(goal.dri)} 可以确认 Goal ${goal.id} 的拆解。`,
            );
          }
          const proposal = getDecompositionProposal(goal_id);
          if (!proposal || proposal.id !== proposal_id) {
            throw new Error(
              `Goal ${goal_id} 不存在 Proposal ${proposal_id}。`,
            );
          }
          const confirmed = confirmDecompositionProposal(
            proposal_id,
            goal.dri,
          );
          return result(
            {
              proposal: confirmed,
              goal: getGoal(goal_id),
              childGoals: confirmed.proposedGoals.map((child) =>
                getGoal(child.proposedId),
              ),
            },
            `Human DRI 已确认 ${proposal_id}，创建 ${confirmed.proposedGoals.length} 个正式下级 Goal。`,
            response_format,
          );
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "stepwise_list_actions",
    {
      title: "List Stepwise Actions",
      description:
        "List Actions for a Goal, optionally filtered by lifecycle status. Returns authorization and review state so an Agent can select only work it is allowed to execute.",
      inputSchema: z
        .object({
          goal_id: z.string().min(1).max(80).default("G0"),
          status: actionStatusSchema.optional(),
          limit: z.number().int().min(1).max(50).default(20),
          offset: z.number().int().min(0).default(0),
          response_format: responseFormatSchema,
        })
        .strict(),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ goal_id, status, limit, offset, response_format }) => {
      const actions = await withPersistentWorkspace(() =>
        listActions(
          goal_id,
          status as StepwiseActionStatus | undefined,
        ),
      );
      const items = actions.slice(offset, offset + limit);
      const output = {
        total_count: actions.length,
        count: items.length,
        offset,
        has_more: offset + items.length < actions.length,
        next_offset:
          offset + items.length < actions.length
            ? offset + items.length
            : null,
        actions: items,
      };
      const markdown = [
        `# Actions for ${goal_id}`,
        "",
        `共 ${actions.length} 个，当前显示 ${items.length} 个。`,
        "",
        ...items.map(
          (action) =>
            `- **${action.title}** (${action.id})\n  - 状态: ${action.status}\n  - Agent: ${action.agent}\n  - 风险: ${action.riskLevel}\n  - 授权人: ${action.approvedBy ?? "尚未授权"}`,
        ),
      ].join("\n");
      return result(output, markdown, response_format);
    },
  );

  server.registerTool(
    "stepwise_create_action",
    {
      title: "Create Stepwise Action",
      description:
        "Create one real execution Action for a leaf Goal. An Action is only marked authorized when approved_by and authorization_ref are both supplied. Requires the server write token.",
      inputSchema: z
        .object({
          goal_id: z.string().min(1).max(80).default("G0"),
          title: z.string().min(3).max(180),
          rationale: z.string().min(3).max(1200),
          agent: z.string().min(2).max(120),
          risk_level: z.enum(["low", "medium", "high"]),
          proposed_by: z.string().min(2).max(120),
          approved_by: z.string().min(2).max(120).optional(),
          authorization_ref: z.string().min(3).max(200).optional(),
          write_token: z.string().min(1),
          response_format: responseFormatSchema,
        })
        .strict()
        .refine(
          (input) =>
            Boolean(input.approved_by) === Boolean(input.authorization_ref),
          {
            message:
              "approved_by 与 authorization_ref 必须同时提供；否则 Action 只能保持 proposed。",
          },
        ),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      goal_id,
      title,
      rationale,
      agent,
      risk_level,
      proposed_by,
      approved_by,
      authorization_ref,
      write_token,
      response_format,
    }) => {
      try {
        requireWriteAccess(write_token, environment);
        return await withPersistentWorkspace(() => {
          const goal = getGoal(goal_id);
          if (!goal) {
            throw new Error(`Goal ${goal_id} 不存在。`);
          }
          if (goal.childGoalIds.length > 0) {
            throw new Error(
              `Goal ${goal_id} 是组合 Goal，包含下级 Goal，不能直接创建 Action。请在叶子 Goal 上执行。`,
            );
          }
          const action = createAction({
            goalId: goal_id,
            title,
            rationale,
            agent,
            riskLevel: risk_level,
            proposedBy: proposed_by,
            approvedBy: approved_by,
            authorizationRef: authorization_ref,
          });
          return result(
            { action },
            `已创建 Action **${action.title}** (${action.id})，状态为 \`${action.status}\`。`,
            response_format,
          );
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "stepwise_record_action_result",
    {
      title: "Record Stepwise Action Result",
      description:
        "Record the actual Outcome and structured Evidence for an authorized Action. This moves the Action to review-required; it does not accept the result. Requires the server write token and a DRI authorization reference.",
      inputSchema: z
        .object({
          action_id: z.string().min(1).max(100),
          outcome: z.string().min(3).max(4000),
          evidence: z
            .array(
              z
                .object({
                  label: z.string().min(1).max(160),
                  detail: z.string().min(1).max(2000),
                  kind: z.enum(["artifact", "observation", "claim"]),
                  source: z.string().url().optional(),
                })
                .strict(),
            )
            .min(1)
            .max(12),
          actor: z.string().min(2).max(120),
          authorization_ref: z.string().min(3).max(200),
          write_token: z.string().min(1),
          response_format: responseFormatSchema,
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      action_id,
      outcome,
      evidence,
      actor,
      authorization_ref,
      write_token,
      response_format,
    }) => {
      try {
        requireWriteAccess(write_token, environment);
        return await withPersistentWorkspace(() => {
          const action = recordOutcome(
            action_id,
            outcome,
            evidence.map((item) => ({
              label: String(item.label),
              detail: String(item.detail),
              kind: item.kind ?? "claim",
              source: item.source,
            })),
            actor,
            authorization_ref,
          );
          return result(
            { action },
            `已为 **${action.title}** 记录 Outcome 和 ${action.evidence.length} 条 Evidence；当前等待 DRI 验收。`,
            response_format,
          );
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  server.registerTool(
    "stepwise_decide_action",
    {
      title: "Decide Stepwise Action",
      description:
        "Record a Human DRI decision to accept an Action result or require redo. This tool must only be called after the named Human DRI has made the decision. Requires the server write token.",
      inputSchema: z
        .object({
          action_id: z.string().min(1).max(100),
          decision: z.enum(["accepted", "redo"]),
          decided_by: z.string().min(2).max(120),
          rationale: z.string().min(3).max(1200),
          write_token: z.string().min(1),
          response_format: responseFormatSchema,
        })
        .strict(),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async ({
      action_id,
      decision,
      decided_by,
      rationale,
      write_token,
      response_format,
    }) => {
      try {
        requireWriteAccess(write_token, environment);
        return await withPersistentWorkspace(() => {
          const action = submitDecision(
            action_id,
            decision,
            decided_by,
            rationale,
          );
          return result(
            { action },
            `DRI Decision 已记录：**${action.title}** → \`${action.status}\`。`,
            response_format,
          );
        });
      } catch (error) {
        return toolError(error);
      }
    },
  );

  return server;
}
