import { strict as assert } from "node:assert";
import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { handleMcpRequest } from "../api/_mcp-http.js";
import {
  getWorkspaceSnapshot,
  resetStepwiseStoreForTests,
} from "../api/_stepwise-store.js";
import { handleWorkspaceRequest } from "../api/_workspace-http.js";

const writeToken = "mcp-smoke-write-token";

async function readBody(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of request) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

async function main(): Promise<void> {
  const httpServer = createServer(async (request, response) => {
    if (request.url === "/api/workspace") {
      const body =
        request.method === "POST" ? await readBody(request) : undefined;
      await handleWorkspaceRequest(request, response, body);
      return;
    }
    if (request.url !== "/api/mcp") {
      response.statusCode = 404;
      response.end();
      return;
    }
    const body = request.method === "POST" ? await readBody(request) : undefined;
    await handleMcpRequest(
      request,
      response,
      { writeToken, allowedOrigins: "http://127.0.0.1" },
      body,
    );
  });

  await new Promise<void>((resolve) =>
    httpServer.listen(0, "127.0.0.1", resolve),
  );
  const address = httpServer.address();
  assert(address && typeof address === "object");
  const endpoint = `http://127.0.0.1:${address.port}/api/mcp`;
  const preflight = await fetch(endpoint, {
    method: "OPTIONS",
    headers: {
      Origin: "http://127.0.0.1",
      "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers":
        "authorization, content-type, mcp-protocol-version",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(
    preflight.headers.get("access-control-allow-origin"),
    "http://127.0.0.1",
  );

  const client = new Client({
    name: "stepwise-mcp-smoke-client",
    version: "1.0.0",
  });
  const transport = new StreamableHTTPClientTransport(
    new URL(endpoint),
  );

  try {
    await client.connect(transport);

    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      "stepwise_confirm_decomposition",
      "stepwise_create_action",
      "stepwise_decide_action",
      "stepwise_get_decomposition_proposal",
      "stepwise_get_goal",
      "stepwise_list_actions",
      "stepwise_record_action_result",
    ]);

    const goal = await client.callTool({
      name: "stepwise_get_goal",
      arguments: { goal_id: "G0", response_format: "json" },
    });
    assert.equal(goal.isError, undefined);
    assert.match(JSON.stringify(goal.structuredContent), /Amazon Developer/);

    const proposal = await client.callTool({
      name: "stepwise_get_decomposition_proposal",
      arguments: { goal_id: "G4", response_format: "json" },
    });
    assert.equal(proposal.isError, undefined);
    assert.match(JSON.stringify(proposal.structuredContent), /G41/);

    const wrongDri = await client.callTool({
      name: "stepwise_confirm_decomposition",
      arguments: {
        proposal_id: "D3",
        goal_id: "G4",
        decided_by: "陈默",
        write_token: writeToken,
        response_format: "json",
      },
    });
    assert.equal(wrongDri.isError, true);

    const confirmed = await client.callTool({
      name: "stepwise_confirm_decomposition",
      arguments: {
        proposal_id: "D3",
        goal_id: "G4",
        decided_by: "林然",
        write_token: writeToken,
        response_format: "json",
      },
    });
    assert.equal(confirmed.isError, undefined);
    assert.match(JSON.stringify(confirmed.structuredContent), /G42/);

    const childGoal = await client.callTool({
      name: "stepwise_get_goal",
      arguments: { goal_id: "G41", response_format: "json" },
    });
    assert.equal(childGoal.isError, undefined);

    resetStepwiseStoreForTests();
    const staleLocalSnapshot = {
      ...getWorkspaceSnapshot(),
      updatedAt: new Date().toISOString(),
    };
    const webConfirmation = await fetch(
      `http://127.0.0.1:${address.port}/api/workspace`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "confirm-decomposition",
          proposalId: "D3",
          decidedById: "H-LIN-RAN",
        }),
      },
    );
    assert.equal(webConfirmation.status, 200);
    const webCreatedGoal = await client.callTool({
      name: "stepwise_get_goal",
      arguments: { goal_id: "G41", response_format: "json" },
    });
    assert.equal(webCreatedGoal.isError, undefined);
    const ignoredLateImport = await fetch(
      `http://127.0.0.1:${address.port}/api/workspace`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command: "import",
          snapshot: staleLocalSnapshot,
        }),
      },
    );
    const workspaceAfterLateImport =
      (await ignoredLateImport.json()) as ReturnType<
        typeof getWorkspaceSnapshot
      >;
    assert(workspaceAfterLateImport.goals.G41);

    const denied = await client.callTool({
      name: "stepwise_create_action",
      arguments: {
        goal_id: "G21",
        title: "验证无凭证写入",
        rationale: "确认 MCP 写工具不会绕过 Human DRI 的授权边界。",
        agent: "测试 Agent",
        risk_level: "low",
        proposed_by: "测试 Agent",
        write_token: "wrong-token",
        response_format: "json",
      },
    });
    assert.equal(denied.isError, true);

    const compositeDenied = await client.callTool({
      name: "stepwise_create_action",
      arguments: {
        goal_id: "G0",
        title: "错误地直接执行组合 Goal",
        rationale: "验证有下级 Goal 的组合 Goal 不能直接创建 Action。",
        agent: "测试 Agent",
        risk_level: "low",
        proposed_by: "测试 Agent",
        write_token: writeToken,
        response_format: "json",
      },
    });
    assert.equal(compositeDenied.isError, true);

    const created = await client.callTool({
      name: "stepwise_create_action",
      arguments: {
        goal_id: "G21",
        title: "验证 Alexa+ MCP 完整闭环",
        rationale: "赛事 Demo 需要展示外部 Agent 如何在 DRI 授权下推进工作。",
        agent: "Alexa+ 模拟 Agent",
        risk_level: "medium",
        proposed_by: "演示 Agent",
        approved_by: "林然｜队长",
        authorization_ref: "smoke-test-authorization",
        write_token: writeToken,
        response_format: "json",
      },
    });
    const createdAction = (
      created.structuredContent as {
        action: { id: string; status: string };
      }
    ).action;
    assert.equal(createdAction.status, "authorized");

    const webWorkspaceResponse = await fetch(
      `http://127.0.0.1:${address.port}/api/workspace`,
    );
    assert.equal(webWorkspaceResponse.status, 200);
    const webWorkspace = (await webWorkspaceResponse.json()) as ReturnType<
      typeof getWorkspaceSnapshot
    >;
    assert(
      webWorkspace.actions.some(
        (action) =>
          action.id === createdAction.id &&
          action.title === "验证 Alexa+ MCP 完整闭环",
      ),
    );

    const recorded = await client.callTool({
      name: "stepwise_record_action_result",
      arguments: {
        action_id: createdAction.id,
        outcome: "MCP 客户端已完成 Goal 读取和授权 Action 调用。",
        evidence: [
          {
            label: "协议调用结果",
            detail: "初始化、工具发现与授权写入均返回结构化结果。",
            kind: "observation",
          },
        ],
        actor: "Alexa+ 模拟 Agent",
        authorization_ref: "smoke-test-authorization",
        write_token: writeToken,
        response_format: "json",
      },
    });
    const recordedAction = (
      recorded.structuredContent as {
        action: { status: string };
      }
    ).action;
    assert.equal(recordedAction.status, "review-required");

    const decided = await client.callTool({
      name: "stepwise_decide_action",
      arguments: {
        action_id: createdAction.id,
        decision: "accepted",
        decided_by: "林然｜队长",
        rationale: "协议、授权和证据状态迁移符合演示验收标准。",
        write_token: writeToken,
        response_format: "json",
      },
    });
    const decidedAction = (
      decided.structuredContent as {
        action: { status: string };
      }
    ).action;
    assert.equal(decidedAction.status, "accepted");

    console.log(
      JSON.stringify({
        tools: names.length,
        goal: "G0",
        deniedWrite: true,
        deniedCompositeAction: true,
        confirmedDecomposition: true,
        webApiWriteVisibleToMcp: true,
        mcpWriteVisibleToWebApi: true,
        lateLocalImportIgnored: true,
        corsPreflight: true,
        finalActionStatus: decidedAction.status,
      }),
    );
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) =>
      httpServer.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
