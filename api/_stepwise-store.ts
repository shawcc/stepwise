import {
  actors,
  decompositionReviews as initialDecompositionReviews,
  goals as initialGoals,
  initialActions,
  relations as initialRelations,
  type Action,
  type Actor,
  type DecompositionReview,
  type Goal,
  type Relation,
} from "../src/data/stepwise-model.js";

export type StepwiseEvidence = {
  label: string;
  detail: string;
  kind: "artifact" | "observation" | "claim";
  source?: string;
};

export type StepwiseActor = Actor;

export type StepwiseGoalTimebox = Goal["timebox"];

export type StepwiseActionStatus =
  | "proposed"
  | "authorized"
  | "review-required"
  | "accepted"
  | "redo";

export type StepwiseAction = {
  id: string;
  goalId: string;
  title: string;
  rationale: string;
  agent: string;
  riskLevel: "low" | "medium" | "high";
  status: StepwiseActionStatus;
  proposedBy: string;
  approvedBy?: string;
  authorizationRef?: string;
  outcome?: string;
  evidence: StepwiseEvidence[];
  decision?: string;
  createdAt: string;
  updatedAt: string;
};

export type StepwiseGoal = {
  id: string;
  title: string;
  problem: string;
  intent: string;
  successCriteria: string[];
  dri: StepwiseActor;
  autonomy: string;
  timebox: StepwiseGoalTimebox;
  status: string;
  parentId?: string;
  childGoalIds: string[];
};

export type StepwiseProposedGoal = Omit<
  StepwiseGoal,
  "id" | "parentId" | "childGoalIds" | "status"
> & {
  proposedId: string;
};

export type StepwiseDecompositionProposal = {
  id: string;
  goalId: string;
  status: "proposed" | "confirmed";
  proposedBy: StepwiseActor;
  proposedGoals: StepwiseProposedGoal[];
  rationale: string;
  assumptions: string[];
  createdAt: string;
  confirmedBy?: StepwiseActor;
  confirmedAt?: string;
};

type CanonicalAction = Action & {
  rationale: string;
  proposedBy: string;
  authorizationRef?: string;
  createdAt: string;
  updatedAt: string;
};

type StepwiseStore = {
  revision: number;
  updatedAt: string;
  goals: Record<string, Goal>;
  actions: CanonicalAction[];
  relations: Relation[];
  decompositionReviews: DecompositionReview[];
};

export type StepwiseWorkspaceSnapshot = {
  version: 3;
  revision: number;
  updatedAt: string;
  goals: Record<string, Goal>;
  actions: Action[];
  relations: Relation[];
  decompositionReviews: DecompositionReview[];
};

export type ImportableWorkspaceSnapshot = {
  updatedAt: string;
  goals: Record<string, Goal>;
  actions: Action[];
  relations: Relation[];
  decompositionReviews: DecompositionReview[];
};

const globalStore = globalThis as typeof globalThis & {
  __stepwiseWorkspaceStore?: StepwiseStore;
};

function actorLabel(actor: Actor): string {
  return `${actor.name}｜${actor.role}`;
}

function actorFromLabel(
  label: string,
  kind: Actor["kind"],
  role: string,
): Actor {
  const known = Object.values(actors).find(
    (actor) =>
      actor.id === label ||
      actor.name === label ||
      actorLabel(actor) === label,
  );
  if (known) return structuredClone(known);

  const [name, parsedRole] = label.split(/[｜|]/).map((item) => item.trim());
  const safeName = name || (kind === "human-dri" ? "未指定 DRI" : "外部 Agent");
  return {
    id: `EXTERNAL-${safeName.replace(/\s+/g, "-").toUpperCase()}`,
    name: safeName,
    kind,
    role: parsedRole || role,
  };
}

function toCanonicalAction(action: Action): CanonicalAction {
  const metadata = action as Partial<CanonicalAction>;
  const createdAt =
    metadata.createdAt ?? action.startedAt ?? new Date(0).toISOString();
  return {
    ...structuredClone(action),
    rationale: metadata.rationale ?? action.expectedOutput,
    proposedBy: metadata.proposedBy ?? actorLabel(action.executor),
    authorizationRef:
      metadata.authorizationRef ?? (action.authorization || undefined),
    createdAt,
    updatedAt: metadata.updatedAt ?? action.completedAt ?? createdAt,
  };
}

function createInitialStore(): StepwiseStore {
  return {
    revision: 0,
    updatedAt: new Date(0).toISOString(),
    goals: structuredClone(initialGoals),
    actions: initialActions.map(toCanonicalAction),
    relations: structuredClone(initialRelations),
    decompositionReviews: structuredClone(initialDecompositionReviews),
  };
}

function getStore(): StepwiseStore {
  if (!globalStore.__stepwiseWorkspaceStore) {
    globalStore.__stepwiseWorkspaceStore = createInitialStore();
  }
  return globalStore.__stepwiseWorkspaceStore;
}

function touch(store: StepwiseStore): void {
  store.revision += 1;
  store.updatedAt = new Date().toISOString();
}

function snapshot(store = getStore()): StepwiseWorkspaceSnapshot {
  return structuredClone({
    version: 3 as const,
    revision: store.revision,
    updatedAt: store.updatedAt,
    goals: store.goals,
    actions: store.actions,
    relations: store.relations,
    decompositionReviews: store.decompositionReviews,
  });
}

function isImportableWorkspace(
  value: unknown,
): value is ImportableWorkspaceSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<ImportableWorkspaceSnapshot>;
  return Boolean(
    candidate.goals &&
      typeof candidate.goals === "object" &&
      Array.isArray(candidate.actions) &&
      Array.isArray(candidate.relations) &&
      Array.isArray(candidate.decompositionReviews) &&
      typeof candidate.updatedAt === "string",
  );
}

function actionStatus(action: CanonicalAction): StepwiseActionStatus {
  if (action.status === "review") return "review-required";
  if (action.status === "accepted" || action.status === "redo") {
    return action.status;
  }
  if (action.authorization) return "authorized";
  return "proposed";
}

function toStepwiseAction(action: CanonicalAction): StepwiseAction {
  return {
    id: action.id,
    goalId: action.goalId,
    title: action.title,
    rationale: action.rationale,
    agent: actorLabel(action.executor),
    riskLevel: action.risk,
    status: actionStatus(action),
    proposedBy: action.proposedBy,
    approvedBy: action.authorization
      ? actorLabel(action.approvedBy)
      : undefined,
    authorizationRef: action.authorizationRef,
    outcome: action.outcome,
    evidence: action.evidence.map(({ label, detail, kind, source }) => ({
      label,
      detail,
      kind,
      source,
    })),
    decision: action.decision,
    createdAt: action.createdAt,
    updatedAt: action.updatedAt,
  };
}

function nextRelationId(relations: Relation[]): string {
  const max = relations.reduce((current, relation) => {
    const match = /^R(\d+)$/.exec(relation.id);
    return match ? Math.max(current, Number(match[1])) : current;
  }, 0);
  return `R${max + 1}`;
}

export function getWorkspaceSnapshot(): StepwiseWorkspaceSnapshot {
  return snapshot();
}

export function importWorkspaceSnapshot(
  value: unknown,
): StepwiseWorkspaceSnapshot {
  const store = getStore();
  if (store.revision !== 0) return snapshot(store);
  if (!isImportableWorkspace(value)) {
    throw new Error("Workspace 快照格式无效。");
  }

  store.goals = structuredClone(value.goals);
  store.actions = value.actions.map(toCanonicalAction);
  store.relations = structuredClone(value.relations);
  store.decompositionReviews = structuredClone(value.decompositionReviews);
  touch(store);
  return snapshot(store);
}

export function updateWorkspaceAction(value: unknown): StepwiseWorkspaceSnapshot {
  const store = getStore();
  if (!value || typeof value !== "object") {
    throw new Error("Action 内容无效。");
  }
  const updated = value as Action;
  const index = store.actions.findIndex((action) => action.id === updated.id);
  if (index < 0) throw new Error(`Action ${updated.id ?? ""} 不存在。`);

  const current = store.actions[index];
  if (updated.goalId !== current.goalId) {
    throw new Error("Action 所属 Goal 不允许通过更新命令修改。");
  }
  store.actions[index] = {
    ...current,
    ...structuredClone(updated),
    updatedAt: new Date().toISOString(),
  };
  touch(store);
  return snapshot(store);
}

export function updateWorkspaceRelation(
  value: unknown,
): StepwiseWorkspaceSnapshot {
  const store = getStore();
  if (!value || typeof value !== "object") {
    throw new Error("Relation 内容无效。");
  }
  const updated = value as Relation;
  const index = store.relations.findIndex(
    (relation) => relation.id === updated.id,
  );
  if (index < 0) throw new Error(`Relation ${updated.id ?? ""} 不存在。`);

  const current = store.relations[index];
  if (
    updated.sourceId !== current.sourceId ||
    updated.targetId !== current.targetId ||
    updated.kind !== current.kind ||
    updated.status !== current.status
  ) {
    throw new Error("Relation 的端点、类型和状态不能通过讨论更新修改。");
  }
  store.relations[index] = structuredClone(updated);
  touch(store);
  return snapshot(store);
}

export function updateWorkspaceDecomposition(
  value: unknown,
): StepwiseWorkspaceSnapshot {
  const store = getStore();
  if (!value || typeof value !== "object") {
    throw new Error("Decomposition Review 内容无效。");
  }
  const updated = value as DecompositionReview;
  const index = store.decompositionReviews.findIndex(
    (review) => review.id === updated.id,
  );
  if (index < 0) {
    throw new Error(`Decomposition Review ${updated.id ?? ""} 不存在。`);
  }

  const current = store.decompositionReviews[index];
  if (
    updated.goalId !== current.goalId ||
    updated.status !== current.status ||
    updated.childGoalIds.join(",") !== current.childGoalIds.join(",")
  ) {
    throw new Error("拆解状态和正式子 Goal 只能通过确认命令修改。");
  }
  store.decompositionReviews[index] = structuredClone(updated);
  touch(store);
  return snapshot(store);
}

export function confirmWorkspaceDecomposition(
  proposalId: string,
  decidedById: string,
): StepwiseWorkspaceSnapshot {
  const proposal = getStore().decompositionReviews.find(
    (item) => item.id === proposalId,
  );
  if (!proposal) {
    throw new Error(`Decomposition Proposal ${proposalId} 不存在。`);
  }
  const parent = getStore().goals[proposal.goalId];
  if (!parent) throw new Error(`Goal ${proposal.goalId} 不存在。`);
  if (parent.dri.id !== decidedById) {
    throw new Error(`只有 ${parent.dri.name} 可以确认 Goal ${parent.id} 的拆解。`);
  }
  confirmDecompositionProposal(proposalId, parent.dri);
  return snapshot();
}

export function getGoal(goalId: string): StepwiseGoal | undefined {
  const store = getStore();
  const goal = store.goals[goalId];
  if (!goal) return undefined;
  return {
    id: goal.id,
    title: goal.title,
    problem: goal.intent,
    intent: goal.intent,
    successCriteria: structuredClone(goal.successCriteria),
    dri: structuredClone(goal.dri),
    autonomy: goal.autonomy,
    timebox: structuredClone(goal.timebox),
    status: goal.status,
    parentId: goal.parentId,
    childGoalIds: Object.values(store.goals)
      .filter((candidate) => candidate.parentId === goal.id)
      .map((candidate) => candidate.id),
  };
}

export function listActions(
  goalId: string,
  status?: StepwiseActionStatus,
): StepwiseAction[] {
  return getStore()
    .actions.filter((action) => action.goalId === goalId)
    .map(toStepwiseAction)
    .filter((action) => !status || action.status === status)
    .map((action) => structuredClone(action));
}

export function getDecompositionProposal(
  goalId: string,
): StepwiseDecompositionProposal | undefined {
  const review = getStore().decompositionReviews.find(
    (item) => item.goalId === goalId,
  );
  if (!review) return undefined;
  const parent = getStore().goals[goalId];
  const confirmedBy =
    review.status === "confirmed" && parent ? structuredClone(parent.dri) : undefined;
  const confirmedEvent = [...review.events]
    .reverse()
    .find((event) => event.type === "decision");

  return {
    id: review.id,
    goalId: review.goalId,
    status: review.status,
    proposedBy: review.createdBy.includes(actors.reasoning.name)
      ? structuredClone(actors.reasoning)
      : actorFromLabel(review.createdBy, "reasoning-agent", "目标拆解"),
    proposedGoals: review.proposedGoals.map((goal) => ({
      proposedId: goal.proposedId,
      title: goal.title,
      problem: goal.intent,
      intent: goal.intent,
      successCriteria: structuredClone(goal.successCriteria),
      dri: structuredClone(goal.dri),
      autonomy: goal.autonomy,
      timebox: structuredClone(goal.timebox),
    })),
    rationale: review.logic,
    assumptions: structuredClone(review.openQuestions),
    createdAt: review.createdAt,
    confirmedBy,
    confirmedAt: confirmedEvent?.createdAt,
  };
}

export function confirmDecompositionProposal(
  proposalId: string,
  decidedBy: StepwiseActor,
): StepwiseDecompositionProposal {
  const store = getStore();
  const proposal = store.decompositionReviews.find(
    (item) => item.id === proposalId,
  );
  if (!proposal) {
    throw new Error(`Decomposition Proposal ${proposalId} 不存在。`);
  }
  if (proposal.status !== "proposed") {
    throw new Error(`Decomposition Proposal ${proposalId} 已经确认。`);
  }
  const parent = store.goals[proposal.goalId];
  if (!parent) throw new Error(`Goal ${proposal.goalId} 不存在。`);
  if (
    Object.values(store.goals).some((goal) => goal.parentId === parent.id)
  ) {
    throw new Error(`Goal ${parent.id} 已有下级 Goal，不能重复确认拆解。`);
  }
  if (store.actions.some((action) => action.goalId === parent.id)) {
    throw new Error(
      `Goal ${parent.id} 已有 Action，不能同时转为组合 Goal。请先处理现有 Action。`,
    );
  }
  if (decidedBy.id !== parent.dri.id || decidedBy.kind !== "human-dri") {
    throw new Error(`只有 ${parent.dri.name} 可以确认 Goal ${parent.id} 的拆解。`);
  }

  const now = new Date().toISOString();
  const proposedGoals = structuredClone(proposal.proposedGoals);
  for (const proposed of proposedGoals) {
    store.goals[proposed.proposedId] = {
      ...proposed,
      id: proposed.proposedId,
      level: parent.level + 1,
      parentId: parent.id,
      status: "draft",
    };
    store.relations.push({
      id: nextRelationId(store.relations),
      kind: "decomposes",
      sourceId: parent.id,
      targetId: proposed.proposedId,
      label: "拆解为",
      rationale: proposal.logic,
      assumptions: structuredClone(proposal.openQuestions),
      status: "confirmed",
      createdBy: actors.reasoning.name,
      createdAt: now,
      events: [
        {
          id: `${proposal.id}-CONFIRM-${proposed.proposedId}`,
          actor: actorLabel(decidedBy),
          type: "decision",
          content: `确认 ${proposed.proposedId} 进入正式 Goal，并接受其 DRI 与时间窗。`,
          createdAt: now,
        },
      ],
    });
  }

  proposal.childGoalIds = proposedGoals.map((goal) => goal.proposedId);
  proposal.proposedGoals = [];
  proposal.status = "confirmed";
  proposal.events.push({
    id: `${proposal.id}-CONFIRM`,
    actor: actorLabel(decidedBy),
    type: "decision",
    content: `确认该拆解提案；${proposedGoals.length} 个候选 Goal 已写入正式工作图谱。`,
    createdAt: now,
  });
  touch(store);

  return {
    id: proposal.id,
    goalId: proposal.goalId,
    status: "confirmed",
    proposedBy: structuredClone(actors.reasoning),
    proposedGoals: proposedGoals.map((goal) => ({
      proposedId: goal.proposedId,
      title: goal.title,
      problem: goal.intent,
      intent: goal.intent,
      successCriteria: structuredClone(goal.successCriteria),
      dri: structuredClone(goal.dri),
      autonomy: goal.autonomy,
      timebox: structuredClone(goal.timebox),
    })),
    rationale: proposal.logic,
    assumptions: structuredClone(proposal.openQuestions),
    createdAt: proposal.createdAt,
    confirmedBy: structuredClone(decidedBy),
    confirmedAt: now,
  };
}

export function createAction(
  input: Omit<
    StepwiseAction,
    "id" | "status" | "evidence" | "createdAt" | "updatedAt"
  >,
): StepwiseAction {
  const store = getStore();
  const goal = store.goals[input.goalId];
  if (!goal) throw new Error(`Goal ${input.goalId} 不存在。`);

  const now = new Date().toISOString();
  const executor = actorFromLabel(input.agent, "execution-agent", "外部执行");
  const approvedBy = input.approvedBy
    ? actorFromLabel(input.approvedBy, "human-dri", "授权")
    : structuredClone(goal.dri);
  const action: CanonicalAction = {
    id: `A-${Date.now().toString(36).toUpperCase()}`,
    goalId: input.goalId,
    title: input.title,
    executor,
    approvedBy,
    authorization: input.authorizationRef ?? "",
    risk: input.riskLevel,
    status: "ready",
    input: input.rationale,
    expectedOutput: `完成 ${input.title} 并回填可复核 Outcome 与 Evidence。`,
    evidence: [],
    rationale: input.rationale,
    proposedBy: input.proposedBy,
    authorizationRef: input.authorizationRef,
    createdAt: now,
    updatedAt: now,
  };
  store.actions.unshift(action);
  touch(store);
  return toStepwiseAction(action);
}

export function recordOutcome(
  actionId: string,
  outcome: string,
  evidence: StepwiseEvidence[],
  actor: string,
  authorizationRef: string,
): StepwiseAction {
  const store = getStore();
  const action = store.actions.find((item) => item.id === actionId);
  if (!action) {
    throw new Error(`Action ${actionId} 不存在，请先调用 stepwise_list_actions。`);
  }
  const status = actionStatus(action);
  if (status !== "authorized" && status !== "redo") {
    throw new Error(
      `Action ${actionId} 当前状态为 ${status}，只有已授权或要求重做的 Action 可以回填结果。`,
    );
  }

  const now = new Date().toISOString();
  action.outcome = outcome;
  action.evidence = evidence.map((item, index) => ({
    ...item,
    id: `${action.id}-E${index + 1}`,
  }));
  action.status = "review";
  action.authorization = authorizationRef;
  action.authorizationRef = authorizationRef;
  action.completedAt = now;
  action.updatedAt = now;
  action.proposedBy = action.proposedBy || actor;
  touch(store);
  return toStepwiseAction(action);
}

export function submitDecision(
  actionId: string,
  decision: "accepted" | "redo",
  decidedBy: string,
  rationale: string,
): StepwiseAction {
  const store = getStore();
  const action = store.actions.find((item) => item.id === actionId);
  if (!action) {
    throw new Error(`Action ${actionId} 不存在，请先调用 stepwise_list_actions。`);
  }
  if (actionStatus(action) !== "review-required") {
    throw new Error(
      `Action ${actionId} 当前状态为 ${actionStatus(action)}，只有待验收结果可以形成 DRI Decision。`,
    );
  }

  action.status = decision;
  action.decision = `${decidedBy}：${rationale}`;
  action.updatedAt = new Date().toISOString();
  touch(store);
  return toStepwiseAction(action);
}

export function replaceStepwiseStore(value: unknown): void {
  if (!isImportableWorkspace(value)) {
    throw new Error("持久化 Workspace 快照格式无效。");
  }
  const persisted = value as Partial<StepwiseWorkspaceSnapshot>;
  if (
    typeof persisted.revision !== "number" ||
    persisted.revision < 0 ||
    !Number.isInteger(persisted.revision)
  ) {
    throw new Error("持久化 Workspace revision 无效。");
  }

  globalStore.__stepwiseWorkspaceStore = {
    revision: persisted.revision,
    updatedAt: value.updatedAt,
    goals: structuredClone(value.goals),
    actions: value.actions.map(toCanonicalAction),
    relations: structuredClone(value.relations),
    decompositionReviews: structuredClone(value.decompositionReviews),
  };
}

export function resetStepwiseStoreForTests(): void {
  globalStore.__stepwiseWorkspaceStore = createInitialStore();
}
