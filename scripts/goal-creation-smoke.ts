import { strict as assert } from "node:assert";
import {
  createWorkspaceGoal,
  getWorkspaceSnapshot,
  resetStepwiseStoreForTests,
} from "../api/_stepwise-store";

resetStepwiseStoreForTests();

const before = getWorkspaceSnapshot();
const created = createWorkspaceGoal({
  title: "验证人工创建 Goal",
  intent: "从空白目标定义开始验证 Human DRI 主导的工作流。",
  driName: "测试 DRI",
  driRole: "负责人",
  startsAt: "2026-09-16T09:00:00.000Z",
  dueAt: "2026-09-30T09:00:00.000Z",
  timezone: "Asia/Shanghai",
  successCriteria: ["Goal 已持久化", "创建后可进入 Doc"],
  constraints: ["不得自动创建 Action"],
  autonomy: "可逆工作由 Agent 推进，最终验收由 Human DRI 决策。",
});

const newGoals = Object.values(created.goals).filter(
  (goal) => !before.goals[goal.id],
);
assert.equal(newGoals.length, 1);
assert.equal(created.revision, before.revision + 1);
assert.equal(newGoals[0].level, 0);
assert.equal(newGoals[0].status, "active");
assert.equal(newGoals[0].dri.kind, "human-dri");
assert.equal(created.actions.length, before.actions.length);

assert.throws(
  () =>
    createWorkspaceGoal({
      title: "非法期限",
      intent: "截止时间早于开始时间。",
      driName: "测试 DRI",
      driRole: "负责人",
      startsAt: "2026-09-30T09:00:00.000Z",
      dueAt: "2026-09-16T09:00:00.000Z",
      timezone: "Asia/Shanghai",
      successCriteria: ["应被拒绝"],
      constraints: [],
      autonomy: "",
    }),
  /Deadline 必须晚于开始时间/,
);

resetStepwiseStoreForTests();

console.log(
  JSON.stringify({
    createdGoalId: newGoals[0].id,
    serverAssignedId: true,
    revisionAdvanced: true,
    invalidDeadlineRejected: true,
    noActionCreated: true,
  }),
);
