import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bot,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  FileCheck2,
  GitBranch,
  Link2,
  ListTree,
  Map,
  Network,
  Play,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import {
  actors,
  initialActions,
  type Action,
  type ActionStatus,
  type CreateGoalInput,
  type DecompositionReview,
  type Goal,
  type GoalStatus,
  type Relation,
  type RelationKind,
} from "@/data/stepwise-model";
import {
  loadWorkspaceSnapshot,
  saveWorkspaceSnapshot,
} from "@/lib/stepwise-workspace-storage";
import {
  confirmDecomposition as confirmServerDecomposition,
  createGoal as createServerGoal,
  fetchWorkspace,
  importWorkspace,
  updateAction as updateServerAction,
  updateDecomposition as updateServerDecomposition,
  updateRelation as updateServerRelation,
  type ServerWorkspaceSnapshot,
} from "@/lib/stepwise-workspace-api";
import { requestExecutionAgent } from "@/lib/workgraph-agent";

type Selection =
  | { type: "goal"; id: string }
  | { type: "action"; id: string };

type NodePosition = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const goalPositions: Record<string, NodePosition> = {
  G0: { x: 430, y: 44, width: 340, height: 148 },
  G1: { x: 40, y: 300, width: 250, height: 158 },
  G2: { x: 330, y: 300, width: 250, height: 158 },
  G3: { x: 620, y: 300, width: 250, height: 158 },
  G4: { x: 910, y: 300, width: 250, height: 158 },
  G21: { x: 250, y: 574, width: 250, height: 148 },
  G22: { x: 520, y: 574, width: 250, height: 148 },
  G41: { x: 800, y: 574, width: 170, height: 148 },
  G42: { x: 990, y: 574, width: 170, height: 148 },
};

const actionPositions: Record<string, NodePosition> = {
  A1: { x: 40, y: 860, width: 200, height: 112 },
  A2: { x: 270, y: 860, width: 200, height: 112 },
  A3: { x: 500, y: 860, width: 200, height: 112 },
  A4: { x: 730, y: 860, width: 200, height: 112 },
  A5: { x: 960, y: 860, width: 200, height: 112 },
};

const activeRootStorageKey = "stepwise.active-root-goal";

const relationLabels: Record<string, { x: number; y: number }> = {
  R7: { x: 582, y: 367 },
  R8: { x: 872, y: 367 },
  R9: { x: 472, y: 904 },
  R10: { x: 932, y: 904 },
};

const relationMeta: Record<
  RelationKind,
  { label: string; tone: string; line: string }
> = {
  decomposes: {
    label: "上下级",
    tone: "border-slate-300 bg-white text-slate-600",
    line: "stroke-slate-400",
  },
  executes: {
    label: "执行",
    tone: "border-cyan-300 bg-cyan-50 text-cyan-800",
    line: "stroke-cyan-600",
  },
  "goal-dependency": {
    label: "Goal 依赖",
    tone: "border-violet-300 bg-violet-50 text-violet-800",
    line: "stroke-violet-500",
  },
  "action-dependency": {
    label: "Action 依赖",
    tone: "border-amber-300 bg-amber-50 text-amber-800",
    line: "stroke-amber-500",
  },
};

const goalStatusMeta: Record<GoalStatus, { label: string; tone: string }> = {
  draft: { label: "草稿", tone: "bg-slate-100 text-slate-600" },
  active: { label: "推进中", tone: "bg-blue-50 text-blue-700" },
  blocked: { label: "被依赖阻塞", tone: "bg-amber-50 text-amber-800" },
  review: { label: "待验收", tone: "bg-violet-50 text-violet-700" },
  accepted: { label: "已达成", tone: "bg-emerald-50 text-emerald-700" },
};

const actionStatusMeta: Record<ActionStatus, { label: string; tone: string }> = {
  ready: { label: "待执行", tone: "bg-slate-100 text-slate-600" },
  running: { label: "执行中", tone: "bg-blue-50 text-blue-700" },
  review: { label: "待验收", tone: "bg-amber-50 text-amber-800" },
  accepted: { label: "已接受", tone: "bg-emerald-50 text-emerald-700" },
  redo: { label: "要求重做", tone: "bg-violet-50 text-violet-700" },
  failed: { label: "执行失败", tone: "bg-rose-50 text-rose-700" },
};

function getActionStatusMeta(action: Action) {
  if (action.status === "ready" && !action.authorization) {
    return { label: "待授权", tone: "bg-amber-50 text-amber-800" };
  }
  return actionStatusMeta[action.status];
}

function actorLabel(actor: Action["executor"] | Goal["dri"]): string {
  return `${actor.name}｜${actor.role}`;
}

function formatDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    timeZone: timezone,
  }).format(new Date(value));
}

function getGoalChildren(
  goalId: string,
  goalRecords: Record<string, Goal>,
): Goal[] {
  return Object.values(goalRecords).filter((goal) => goal.parentId === goalId);
}

function getGoalPath(
  goalId: string,
  goalRecords: Record<string, Goal>,
): Goal[] {
  const path: Goal[] = [];
  let current: Goal | undefined = goalRecords[goalId];
  while (current) {
    path.unshift(current);
    current = current.parentId ? goalRecords[current.parentId] : undefined;
  }
  return path;
}

function getRootGoalId(
  goalId: string,
  goalRecords: Record<string, Goal>,
): string | null {
  const path = getGoalPath(goalId, goalRecords);
  return path[0]?.level === 0 ? path[0].id : null;
}

function getProjectGoalIds(
  rootGoalId: string,
  goalRecords: Record<string, Goal>,
): Set<string> {
  const ids = new Set<string>();
  const pending = [rootGoalId];
  while (pending.length) {
    const goalId = pending.shift()!;
    if (ids.has(goalId) || !goalRecords[goalId]) continue;
    ids.add(goalId);
    getGoalChildren(goalId, goalRecords).forEach((goal) =>
      pending.push(goal.id),
    );
  }
  return ids;
}

function relationPath(
  relation: Relation,
  nodePositions: Record<string, NodePosition>,
): string {
  const source = nodePositions[relation.sourceId];
  const target = nodePositions[relation.targetId];
  if (!source || !target) return "";

  if (relation.kind.includes("dependency")) {
    const sx = source.x + source.width;
    const sy = source.y + source.height / 2;
    const tx = target.x;
    const ty = target.y + target.height / 2;
    const routeX = (sx + tx) / 2;
    return `M ${sx} ${sy} H ${routeX} V ${ty} H ${tx}`;
  }

  const sx = source.x + source.width / 2;
  const sy = source.y + source.height;
  const tx = target.x + target.width / 2;
  const ty = target.y;
  const routeY = sy + Math.max(28, (ty - sy) / 2);
  return `M ${sx} ${sy} V ${routeY} H ${tx} V ${ty}`;
}

export function StepwiseWorkspace() {
  const [initialWorkspace] = useState(() =>
    loadWorkspaceSnapshot(
      typeof window === "undefined" ? undefined : window.localStorage,
    ),
  );
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(
    null,
  );
  const [selectedDecompositionGoalId, setSelectedDecompositionGoalId] =
    useState<string | null>(null);
  const [showActions, setShowActions] = useState(false);
  const [goalRecords, setGoalRecords] = useState<Record<string, Goal>>(
    initialWorkspace.goals,
  );
  const [actions, setActions] = useState<Action[]>(initialWorkspace.actions);
  const [relations, setRelations] = useState<Relation[]>(
    initialWorkspace.relations,
  );
  const [decompositionReviews, setDecompositionReviews] = useState<
    DecompositionReview[]
  >(initialWorkspace.decompositionReviews);
  const [activeRootGoalId, setActiveRootGoalId] = useState<string | null>(() => {
    const storedRootId =
      typeof window === "undefined"
        ? null
        : window.localStorage.getItem(activeRootStorageKey);
    if (storedRootId && initialWorkspace.goals[storedRootId]?.level === 0) {
      return storedRootId;
    }
    return (
      Object.values(initialWorkspace.goals).find((goal) => goal.level === 0)
        ?.id ?? null
    );
  });
  const [showCreateGoal, setShowCreateGoal] = useState(false);
  const [focusedGoalId, setFocusedGoalId] = useState<string | null>(null);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [workspaceSyncing, setWorkspaceSyncing] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);

  const selectedRelation = relations.find(
    (relation) => relation.id === selectedRelationId,
  );
  const selectedDecomposition = decompositionReviews.find(
    (review) => review.goalId === selectedDecompositionGoalId,
  );

  const applyWorkspaceSnapshot = useCallback(
    (workspace: ServerWorkspaceSnapshot) => {
      setGoalRecords(workspace.goals);
      setActions(workspace.actions);
      setRelations(workspace.relations);
      setDecompositionReviews(workspace.decompositionReviews);
      setActiveRootGoalId((current) => {
        const next =
          current && workspace.goals[current]?.level === 0
            ? current
            : (Object.values(workspace.goals).find((goal) => goal.level === 0)
                ?.id ?? null);
        if (next) window.localStorage.setItem(activeRootStorageKey, next);
        else window.localStorage.removeItem(activeRootStorageKey);
        return next;
      });
      saveWorkspaceSnapshot(window.localStorage, {
        goals: workspace.goals,
        actions: workspace.actions,
        relations: workspace.relations,
        decompositionReviews: workspace.decompositionReviews,
      });
    },
    [],
  );

  useEffect(() => {
    let active = true;
    const loadServerWorkspace = async () => {
      setWorkspaceSyncing(true);
      setWorkspaceError(null);
      try {
        let workspace = await fetchWorkspace();
        if (
          workspace.revision === 0 &&
          initialWorkspace.updatedAt !== new Date(0).toISOString()
        ) {
          workspace = await importWorkspace(initialWorkspace);
        }
        if (active) applyWorkspaceSnapshot(workspace);
      } catch (error) {
        if (active) {
          setWorkspaceError(
            error instanceof Error ? error.message : "Workspace 同步失败",
          );
        }
      } finally {
        if (active) setWorkspaceSyncing(false);
      }
    };
    void loadServerWorkspace();
    return () => {
      active = false;
    };
  }, [applyWorkspaceSnapshot, initialWorkspace]);

  useEffect(() => {
    if (!workspaceNotice) return;
    const timeout = window.setTimeout(() => setWorkspaceNotice(null), 5000);
    return () => window.clearTimeout(timeout);
  }, [workspaceNotice]);

  useEffect(() => {
    if (activeRootGoalId) {
      window.localStorage.setItem(activeRootStorageKey, activeRootGoalId);
    } else {
      window.localStorage.removeItem(activeRootStorageKey);
    }
  }, [activeRootGoalId]);

  const commitWorkspace = useCallback(
    async (operation: () => Promise<ServerWorkspaceSnapshot>) => {
      setWorkspaceSyncing(true);
      setWorkspaceError(null);
      try {
        const workspace = await operation();
        applyWorkspaceSnapshot(workspace);
        return workspace;
      } catch (error) {
        setWorkspaceError(
          error instanceof Error ? error.message : "Workspace 写入失败",
        );
        throw error;
      } finally {
        setWorkspaceSyncing(false);
      }
    },
    [applyWorkspaceSnapshot],
  );

  const activateProject = (rootGoalId: string) => {
    if (!goalRecords[rootGoalId] || goalRecords[rootGoalId].level !== 0) return;
    setActiveRootGoalId(rootGoalId);
    setFocusedGoalId(rootGoalId);
    setSelection(null);
    setSelectedDecompositionGoalId(null);
    setSelectedRelationId(null);
  };
  const openGoal = (id: string) => {
    const rootGoalId = getRootGoalId(id, goalRecords);
    if (rootGoalId) setActiveRootGoalId(rootGoalId);
    setFocusedGoalId(id);
    setSelection({ type: "goal", id });
  };
  const openAction = (id: string) => {
    const action = actions.find((item) => item.id === id);
    const rootGoalId = action
      ? getRootGoalId(action.goalId, goalRecords)
      : null;
    if (rootGoalId) setActiveRootGoalId(rootGoalId);
    setSelection({ type: "action", id });
  };

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm sm:min-h-[760px]">
      <WorkspaceHeader
        activeRootGoalId={activeRootGoalId}
        goalRecords={goalRecords}
        onCreateGoal={() => setShowCreateGoal(true)}
        onDocument={() => {
          if (!selection) {
            if (activeRootGoalId) openGoal(activeRootGoalId);
          }
        }}
        onMap={() => {
          setSelection(null);
          setSelectedDecompositionGoalId(null);
          setSelectedRelationId(null);
        }}
        onRefresh={() => void commitWorkspace(fetchWorkspace)}
        onSelectProject={activateProject}
        selection={selection}
        showActions={showActions}
        workspaceError={workspaceError}
        workspaceSyncing={workspaceSyncing}
        onToggleActions={() => setShowActions((current) => !current)}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-100">
        {workspaceNotice ? (
          <div
            aria-live="polite"
            className="absolute right-4 top-4 z-40 inline-flex items-center gap-2 rounded-md border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-800 shadow-lg"
            role="status"
          >
            <CheckCircle2 className="h-4 w-4" />
            {workspaceNotice}
          </div>
        ) : null}

        {selection ? (
          selection.type === "goal" ? (
            <GoalDetail
              actions={actions}
              decompositionReviews={decompositionReviews}
              goal={goalRecords[selection.id]}
              goalRecords={goalRecords}
              onAction={openAction}
              onBack={() => setSelection(null)}
              onDecomposition={(id) => {
                setSelectedRelationId(null);
                setSelectedDecompositionGoalId(id);
              }}
              onGoal={openGoal}
              onRelation={(id) => {
                setSelectedDecompositionGoalId(null);
                setSelectedRelationId(id);
              }}
              relations={relations}
            />
          ) : (
            <ActionDetail
              action={actions.find((item) => item.id === selection.id)!}
              goalRecords={goalRecords}
              onBack={() => setSelection(null)}
              onGoal={openGoal}
              onRelation={(id) => {
                setSelectedDecompositionGoalId(null);
                setSelectedRelationId(id);
              }}
              onUpdate={async (updated) => {
                await commitWorkspace(() => updateServerAction(updated));
              }}
              relations={relations}
            />
          )
        ) : (
          <WorkMap
            actions={actions}
            activeRootGoalId={activeRootGoalId}
            decompositionReviews={decompositionReviews}
            focusedGoalId={focusedGoalId}
            goalRecords={goalRecords}
            onAction={openAction}
            onCreateGoal={() => setShowCreateGoal(true)}
            onDecomposition={(id) => {
              setSelectedRelationId(null);
              setSelectedDecompositionGoalId(id);
            }}
            onGoal={openGoal}
            onRelation={(id) => {
              setSelectedDecompositionGoalId(null);
              setSelectedRelationId(id);
            }}
            relations={relations}
            showActions={showActions}
          />
        )}

        {selectedDecomposition ? (
          <DecompositionPanel
            goalRecords={goalRecords}
            onClose={() => setSelectedDecompositionGoalId(null)}
            onConfirm={async (review) => {
              await commitWorkspace(() =>
                confirmServerDecomposition(
                  review.id,
                  goalRecords[review.goalId].dri.id,
                ),
              );
            }}
            onGoal={(id) => {
              setSelectedDecompositionGoalId(null);
              openGoal(id);
            }}
            onUpdate={async (updated) => {
              await commitWorkspace(() =>
                updateServerDecomposition(updated),
              );
            }}
            review={selectedDecomposition}
          />
        ) : null}

        {selectedRelation ? (
          <RelationPanel
            goalRecords={goalRecords}
            onClose={() => setSelectedRelationId(null)}
            onNode={(id) => {
              setSelectedRelationId(null);
              if (goalRecords[id]) openGoal(id);
              else openAction(id);
            }}
            onUpdate={async (updated) => {
              await commitWorkspace(() => updateServerRelation(updated));
            }}
            relation={selectedRelation}
          />
        ) : null}

        {showCreateGoal ? (
          <CreateGoalDialog
            onClose={() => setShowCreateGoal(false)}
            onSubmit={async (input) => {
              const previousIds = new Set(Object.keys(goalRecords));
              const workspace = await commitWorkspace(() =>
                createServerGoal(input),
              );
              const created = Object.values(workspace.goals).find(
                (goal) => !previousIds.has(goal.id),
              );
              setShowCreateGoal(false);
              if (created) {
                setActiveRootGoalId(created.id);
                setWorkspaceNotice(`${created.id} 项目已创建`);
                openGoal(created.id);
              }
            }}
          />
        ) : null}
      </div>
    </main>
  );
}

function CreateGoalDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: CreateGoalInput) => Promise<void>;
}) {
  const now = new Date();
  const defaultDueAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const toLocalInput = (value: Date) => {
    const offset = value.getTimezoneOffset() * 60_000;
    return new Date(value.getTime() - offset).toISOString().slice(0, 16);
  };
  const [title, setTitle] = useState("");
  const [intent, setIntent] = useState("");
  const [driName, setDriName] = useState("");
  const [driRole, setDriRole] = useState("负责人");
  const [dueAt, setDueAt] = useState(toLocalInput(defaultDueAt));
  const [successCriteria, setSuccessCriteria] = useState("");
  const [constraints, setConstraints] = useState("");
  const [autonomy, setAutonomy] = useState(
    "Agent 可推进可逆工作；范围、高风险操作和最终验收由 Human DRI 决策。",
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        title,
        intent,
        driName,
        driRole,
        startsAt: new Date().toISOString(),
        dueAt: new Date(dueAt).toISOString(),
        timezone:
          Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai",
        successCriteria: successCriteria.split("\n"),
        constraints: constraints.split("\n"),
        autonomy,
      });
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "Goal 创建失败",
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="absolute inset-0 z-50 grid place-items-center overflow-auto bg-slate-950/45 p-4">
      <form
        aria-labelledby="create-goal-title"
        className="flex min-h-0 max-h-[calc(100%_-_2rem)] w-full max-w-2xl flex-col rounded-lg border border-slate-300 bg-white shadow-2xl"
        onSubmit={submit}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700">
              Human DRI
            </p>
            <h2
              className="mt-1 text-lg font-semibold text-slate-950"
              id="create-goal-title"
            >
              新建 Goal
            </h2>
          </div>
          <button
            aria-label="关闭新建 Goal"
            className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-900"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-auto px-5 py-5 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="text-[10px] font-semibold text-slate-500">
              标题
            </span>
            <input
              autoFocus
              className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              maxLength={160}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="要达成什么结果？"
              required
              value={title}
            />
          </label>

          <label className="sm:col-span-2">
            <span className="text-[10px] font-semibold text-slate-500">
              目标描述
            </span>
            <textarea
              className="mt-1.5 min-h-20 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-sm leading-6 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              maxLength={1000}
              onChange={(event) => setIntent(event.target.value)}
              placeholder="结果发生后，什么会变得不同？"
              required
              value={intent}
            />
          </label>

          <label>
            <span className="text-[10px] font-semibold text-slate-500">
              Human DRI
            </span>
            <input
              className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              maxLength={120}
              onChange={(event) => setDriName(event.target.value)}
              placeholder="姓名"
              required
              value={driName}
            />
          </label>

          <label>
            <span className="text-[10px] font-semibold text-slate-500">
              角色
            </span>
            <input
              className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              maxLength={120}
              onChange={(event) => setDriRole(event.target.value)}
              value={driRole}
            />
          </label>

          <label>
            <span className="text-[10px] font-semibold text-slate-500">
              Deadline
            </span>
            <input
              className="mt-1.5 h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              min={toLocalInput(now)}
              onChange={(event) => setDueAt(event.target.value)}
              required
              type="datetime-local"
              value={dueAt}
            />
          </label>

          <label>
            <span className="text-[10px] font-semibold text-slate-500">
              成功标准
            </span>
            <textarea
              className="mt-1.5 min-h-24 w-full resize-y rounded-md border border-slate-300 px-3 py-2 text-xs leading-5 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              onChange={(event) => setSuccessCriteria(event.target.value)}
              placeholder={"每行一条\n可观察、可验收"}
              required
              value={successCriteria}
            />
          </label>

          <details className="sm:col-span-2 rounded-md border border-slate-200 bg-slate-50">
            <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-slate-600">
              更多设置
            </summary>
            <div className="grid gap-4 border-t border-slate-200 px-3 py-4 sm:grid-cols-2">
              <label>
                <span className="text-[10px] font-semibold text-slate-500">
                  约束（可选）
                </span>
                <textarea
                  className="mt-1.5 min-h-24 w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-xs leading-5 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                  onChange={(event) => setConstraints(event.target.value)}
                  placeholder={"例如：不产生外部费用\n不修改生产数据"}
                  value={constraints}
                />
              </label>

              <label>
                <span className="text-[10px] font-semibold text-slate-500">
                  Agent 权限
                </span>
                <select
                  className="mt-1.5 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-xs outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                  onChange={(event) => setAutonomy(event.target.value)}
                  value={autonomy}
                >
                  <option value="Agent 可推进可逆工作；范围、高风险操作和最终验收由 Human DRI 决策。">
                    标准｜推进可逆工作
                  </option>
                  <option value="Agent 仅提出方案，不执行任何操作；所有 Action 均由 Human DRI 确认。">
                    仅建议｜不执行
                  </option>
                  <option value="Agent 可在明确约束内自主推进并记录证据；范围变更、高风险操作和最终验收由 Human DRI 决策。">
                    高自主｜约束内推进
                  </option>
                </select>
              </label>
            </div>
          </details>

          {error ? (
            <p
              aria-live="polite"
              className="sm:col-span-2 text-xs font-medium text-rose-700"
            >
              {error}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button
            className="h-9 rounded-md px-3 text-xs font-semibold text-slate-600 hover:bg-slate-200"
            disabled={submitting}
            onClick={onClose}
            type="button"
          >
            取消
          </button>
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-4 text-xs font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
            disabled={submitting}
            type="submit"
          >
            {submitting ? (
              <Activity className="h-3.5 w-3.5 animate-pulse" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            创建 Goal
          </button>
        </footer>
      </form>
    </div>
  );
}

function WorkspaceHeader({
  activeRootGoalId,
  goalRecords,
  onCreateGoal,
  onDocument,
  onMap,
  onRefresh,
  onSelectProject,
  onToggleActions,
  selection,
  showActions,
  workspaceError,
  workspaceSyncing,
}: {
  activeRootGoalId: string | null;
  goalRecords: Record<string, Goal>;
  onCreateGoal: () => void;
  onDocument: () => void;
  onMap: () => void;
  onRefresh: () => void;
  onSelectProject: (rootGoalId: string) => void;
  onToggleActions: () => void;
  selection: Selection | null;
  showActions: boolean;
  workspaceError: string | null;
  workspaceSyncing: boolean;
}) {
  const rootGoals = Object.values(goalRecords).filter(
    (goal) => goal.level === 0,
  );
  const selectedLabel = selection
    ? selection.type === "goal"
      ? goalRecords[selection.id]?.title
      : `Action ${selection.id}`
    : null;

  return (
    <header className="border-b border-slate-200 bg-white px-4 py-3">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-950 text-cyan-300">
            <Network className="h-4 w-4" />
          </span>
          <label className="min-w-0 flex-1">
            <span className="sr-only">当前项目</span>
            <select
              aria-label="切换项目"
              className="h-9 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-950 outline-none focus:border-cyan-600 lg:max-w-[420px]"
              onChange={(event) => onSelectProject(event.target.value)}
              value={activeRootGoalId ?? ""}
            >
              {rootGoals.length === 0 ? (
                <option value="">暂无项目</option>
              ) : null}
              {rootGoals.map((goal) => (
                <option key={goal.id} value={goal.id}>
                  {goal.title}
                </option>
              ))}
            </select>
          </label>
          {selectedLabel &&
          selection?.type === "goal" &&
          selection.id !== activeRootGoalId ? (
            <span className="hidden min-w-0 truncate text-xs text-slate-500 lg:block">
              / {selectedLabel}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="inline-flex h-9 items-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-cyan-800"
            onClick={onCreateGoal}
            title="新建独立项目 Goal"
            type="button"
          >
            <Plus className="h-3.5 w-3.5" />
            Goal
          </button>
          {workspaceSyncing ? (
            <span
              aria-live="polite"
              className="inline-flex h-9 items-center gap-2 text-[10px] font-semibold text-cyan-700"
            >
              <Activity className="h-3.5 w-3.5 animate-pulse" />
              同步中
            </span>
          ) : null}
          {workspaceError ? (
            <button
              aria-label={`重新同步 Workspace：${workspaceError}`}
              className="grid h-9 w-9 place-items-center rounded-md border border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100"
              onClick={onRefresh}
              title={workspaceError}
              type="button"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          ) : null}
          <div className="flex h-9 items-center rounded-md border border-slate-300 bg-slate-50 p-0.5">
            <button
              aria-pressed={!selection}
              className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[10px] font-semibold ${
                !selection
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
              onClick={onMap}
              type="button"
            >
              <Map className="h-3.5 w-3.5" />
              Map
            </button>
            <button
              aria-pressed={Boolean(selection)}
              className={`inline-flex h-7 items-center gap-1.5 rounded px-2.5 text-[10px] font-semibold ${
                selection
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
              onClick={onDocument}
              type="button"
            >
              <FileCheck2 className="h-3.5 w-3.5" />
              Doc
            </button>
          </div>
          {!selection ? (
            <button
              aria-label={showActions ? "隐藏 Action" : "显示 Action"}
              aria-pressed={showActions}
              className={`inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold ${
                showActions
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-300 bg-white text-slate-600"
              }`}
              onClick={onToggleActions}
              type="button"
            >
              <Activity className="h-3.5 w-3.5" />
              <span className="sm:hidden">Action</span>
              <span className="hidden sm:inline">
                {showActions ? "隐藏 Action" : "显示 Action"}
              </span>
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function WorkMap({
  actions,
  activeRootGoalId,
  decompositionReviews,
  focusedGoalId,
  goalRecords,
  onAction,
  onCreateGoal,
  onDecomposition,
  onGoal,
  onRelation,
  relations,
  showActions,
}: {
  actions: Action[];
  activeRootGoalId: string | null;
  decompositionReviews: DecompositionReview[];
  focusedGoalId: string | null;
  goalRecords: Record<string, Goal>;
  onAction: (id: string) => void;
  onCreateGoal: () => void;
  onDecomposition: (goalId: string) => void;
  onGoal: (id: string) => void;
  onRelation: (id: string) => void;
  relations: Relation[];
  showActions: boolean;
}) {
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const projectGoalIds = activeRootGoalId
    ? getProjectGoalIds(activeRootGoalId, goalRecords)
    : new Set<string>();
  const visibleGoals = Object.values(goalRecords)
    .filter((goal) => projectGoalIds.has(goal.id))
    .sort((left, right) => left.level - right.level || left.id.localeCompare(right.id));
  const visibleActions = actions.filter((action) =>
    projectGoalIds.has(action.goalId),
  );
  const levelGroups = new globalThis.Map<number, Goal[]>();
  visibleGoals.forEach((goal) => {
    const level = goal.level;
    levelGroups.set(level, [...(levelGroups.get(level) ?? []), goal]);
  });
  const levels = [...levelGroups.keys()].sort((left, right) => left - right);
  const maxGoalCount = Math.max(
    1,
    ...[...levelGroups.values()].map((goalsAtLevel) => goalsAtLevel.length),
  );
  const actionColumns = Math.min(Math.max(visibleActions.length, 1), 5);
  const canvasWidth = Math.max(
    1200,
    80 + maxGoalCount * 290,
    80 + actionColumns * 230,
  );
  const useDemoLayout = activeRootGoalId === "G0";
  const computedGoalPositions = Object.fromEntries(
    visibleGoals.map((goal) => {
      if (useDemoLayout && goalPositions[goal.id]) {
        return [goal.id, goalPositions[goal.id]];
      }
      const goalsAtLevel = levelGroups.get(goal.level) ?? [];
      const width = goal.level === 0 ? 340 : 250;
      const gap = 40;
      const rowWidth = goalsAtLevel.length * width + (goalsAtLevel.length - 1) * gap;
      const index = goalsAtLevel.findIndex((item) => item.id === goal.id);
      const relativeLevel = levels.indexOf(goal.level);
      return [
        goal.id,
        {
          x: (canvasWidth - rowWidth) / 2 + index * (width + gap),
          y: 44 + relativeLevel * 274,
          width,
          height: goal.level === 0 ? 148 : 158,
        },
      ];
    }),
  ) as Record<string, NodePosition>;
  const deepestGoalBottom = Math.max(
    192,
    ...Object.values(computedGoalPositions).map(
      (position) => position.y + position.height,
    ),
  );
  const actionStartY = useDemoLayout ? 860 : deepestGoalBottom + 138;
  const computedActionPositions = Object.fromEntries(
    visibleActions.map((action, index) => [
      action.id,
      useDemoLayout && actionPositions[action.id]
        ? actionPositions[action.id]
        : {
            x: 40 + (index % 5) * 230,
            y: actionStartY + Math.floor(index / 5) * 140,
            width: 200,
            height: 112,
          },
    ]),
  ) as Record<string, NodePosition>;
  const nodePositions = {
    ...computedGoalPositions,
    ...(showActions ? computedActionPositions : {}),
  };
  const visibleNodeIds = new Set(Object.keys(nodePositions));
  const visibleRelations = relations.filter(
    (relation) =>
      visibleNodeIds.has(relation.sourceId) &&
      visibleNodeIds.has(relation.targetId),
  );
  const actionRows = Math.ceil(visibleActions.length / 5);
  const canvasHeight = showActions && visibleActions.length
    ? actionStartY + actionRows * 140 + 24
    : deepestGoalBottom + 80;
  const visibleReviews = decompositionReviews.filter((review) =>
    projectGoalIds.has(review.goalId),
  );
  const focusPosition = focusedGoalId
    ? computedGoalPositions[focusedGoalId]
    : activeRootGoalId
      ? computedGoalPositions[activeRootGoalId]
      : null;
  const focusCenterX = focusPosition
    ? focusPosition.x + focusPosition.width / 2
    : null;
  const focusCenterY = focusPosition
    ? focusPosition.y + focusPosition.height / 2
    : null;

  useEffect(() => {
    let frame = 0;
    const centerGoal = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const viewport = mapViewportRef.current;
        if (!viewport || focusCenterX === null || focusCenterY === null) return;
        viewport.scrollLeft = Math.max(
          0,
          focusCenterX - viewport.clientWidth / 2,
        );
        viewport.scrollTop = Math.max(
          0,
          focusCenterY - viewport.clientHeight / 2,
        );
      });
    };
    centerGoal();
    const observer = new ResizeObserver(() => {
      centerGoal();
    });
    if (mapViewportRef.current) observer.observe(mapViewportRef.current);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [focusCenterX, focusCenterY, showActions]);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-11 items-center justify-end border-b border-slate-200 bg-white px-5 py-2">
        <MapLegend showActions={showActions} />
      </header>

      {!activeRootGoalId || visibleGoals.length === 0 ? (
        <div className="grid min-h-0 flex-1 place-items-center bg-white px-6 text-center">
          <div className="max-w-sm">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-md border border-cyan-300 bg-cyan-50 text-cyan-800">
              <CircleDot className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-lg font-semibold text-slate-950">
              从第一个 Goal 开始
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              先定义结果、DRI、期限和成功标准。
            </p>
            <button
              className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-cyan-800"
              onClick={onCreateGoal}
              type="button"
            >
              <Plus className="h-4 w-4" />
              新建 Goal
            </button>
          </div>
        </div>
      ) : (
      <div
        className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4"
        ref={mapViewportRef}
      >
        <div
          className="relative mx-auto overflow-hidden rounded-md border border-slate-300 bg-white"
          style={{ height: canvasHeight, width: canvasWidth }}
        >
          {levels.map((level, index) => {
            const goalsAtLevel = levelGroups.get(level) ?? [];
            const y = Math.min(
              ...goalsAtLevel.map((goal) => computedGoalPositions[goal.id].y),
            );
            return (
              <div
                className={`absolute inset-x-0 border-b border-slate-200 ${
                  index % 2 ? "bg-slate-50/80" : "bg-white"
                }`}
                key={level}
                style={{ height: 274, top: Math.max(0, y - 44) }}
              />
            );
          })}
          {showActions && visibleActions.length ? (
            <div
              className="absolute inset-x-0 border-t border-slate-200 bg-slate-50/80"
              style={{ bottom: 0, top: actionStartY - 58 }}
            />
          ) : null}

          <svg
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 ${canvasWidth} ${canvasHeight}`}
          >
            <defs>
              <marker
                id="arrow-slate"
                markerHeight="8"
                markerUnits="userSpaceOnUse"
                markerWidth="8"
                orient="auto"
                refX="7"
                refY="4"
                viewBox="0 0 8 8"
              >
                <path d="M1 1 L7 4 L1 7 Z" fill="#94a3b8" />
              </marker>
              <marker
                id="arrow-cyan"
                markerHeight="8"
                markerUnits="userSpaceOnUse"
                markerWidth="8"
                orient="auto"
                refX="7"
                refY="4"
                viewBox="0 0 8 8"
              >
                <path d="M1 1 L7 4 L1 7 Z" fill="#0891b2" />
              </marker>
              <marker
                id="arrow-violet"
                markerHeight="8"
                markerUnits="userSpaceOnUse"
                markerWidth="8"
                orient="auto"
                refX="7"
                refY="4"
                viewBox="0 0 8 8"
              >
                <path d="M1 1 L7 4 L1 7 Z" fill="#8b5cf6" />
              </marker>
              <marker
                id="arrow-amber"
                markerHeight="8"
                markerUnits="userSpaceOnUse"
                markerWidth="8"
                orient="auto"
                refX="7"
                refY="4"
                viewBox="0 0 8 8"
              >
                <path d="M1 1 L7 4 L1 7 Z" fill="#f59e0b" />
              </marker>
            </defs>
            {visibleRelations.map((relation) => {
              const dependency = relation.kind.includes("dependency");
              const marker =
                relation.kind === "executes"
                  ? "url(#arrow-cyan)"
                  : relation.kind === "goal-dependency"
                    ? "url(#arrow-violet)"
                    : relation.kind === "action-dependency"
                      ? "url(#arrow-amber)"
                      : "url(#arrow-slate)";
              return (
                <path
                  className={`${relationMeta[relation.kind].line} ${
                    dependency ? "stroke-dasharray-[7_6]" : ""
                  }`}
                  d={relationPath(relation, nodePositions)}
                  fill="none"
                  key={relation.id}
                  markerEnd={marker}
                  strokeWidth={dependency ? 2 : 1.5}
                />
              );
            })}
          </svg>

          {levels.map((level) => {
            const firstGoal = levelGroups.get(level)?.[0];
            return firstGoal ? (
              <MapLane
                key={level}
                label={`L${level - (goalRecords[activeRootGoalId]?.level ?? 0)}`}
                y={computedGoalPositions[firstGoal.id].y - 6}
              />
            ) : null;
          })}
          {showActions && visibleActions.length ? (
            <MapLane label="ACTION" y={actionStartY - 34} />
          ) : null}

          {visibleReviews.map((review) => {
            const goalPosition = computedGoalPositions[review.goalId];
            if (!goalPosition) return null;
            return (
              <button
                aria-label={`查看 ${goalRecords[review.goalId].title} 的 WISESTEP 拆解讨论`}
                className={`absolute z-30 grid h-9 w-9 -translate-x-1/2 place-items-center rounded-md border shadow-sm transition hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
                  review.status === "confirmed"
                    ? "border-cyan-300 bg-white hover:border-cyan-600 focus-visible:outline-cyan-600"
                    : "border-amber-300 bg-amber-50 hover:border-amber-600 focus-visible:outline-amber-600"
                }`}
                key={review.id}
                onClick={() => onDecomposition(review.goalId)}
                style={{
                  left: goalPosition.x + goalPosition.width / 2,
                  top: goalPosition.y + goalPosition.height - 18,
                }}
                title="查看 WISESTEP 拆解讨论"
                type="button"
              >
                <WiseStepMark pending={review.status === "proposed"} />
              </button>
            );
          })}

          {visibleGoals.map((goal) => (
            <GoalMapNode
              goal={goal}
              goalRecords={goalRecords}
              focused={focusedGoalId === goal.id}
              key={goal.id}
              onClick={() => onGoal(goal.id)}
              position={computedGoalPositions[goal.id]}
            />
          ))}

          {showActions
            ? visibleActions.map((action) => (
                <ActionMapNode
                  action={action}
                  key={action.id}
                  onClick={() => onAction(action.id)}
                  position={computedActionPositions[action.id]}
                />
              ))
            : null}

          {visibleRelations.map((relation) => {
            if (relation.kind === "decomposes") return null;
            const source = nodePositions[relation.sourceId];
            const target = nodePositions[relation.targetId];
            const position =
              useDemoLayout && relationLabels[relation.id]
                ? relationLabels[relation.id]
                : relation.kind.includes("dependency")
                  ? {
                      x: (source.x + source.width + target.x) / 2 - 28,
                      y:
                        (source.y +
                          source.height / 2 +
                          target.y +
                          target.height / 2) /
                          2 -
                        12,
                    }
                  : {
                      x:
                        (source.x +
                          source.width / 2 +
                          target.x +
                          target.width / 2) /
                          2 -
                        28,
                      y: (source.y + source.height + target.y) / 2 - 12,
                    };
            return (
              <button
                aria-label={`${relation.sourceId} 到 ${relation.targetId}：${relation.label}`}
                className={`absolute z-20 rounded border px-2 py-1 text-[9px] font-semibold transition hover:border-slate-600 ${relationMeta[relation.kind].tone}`}
                key={relation.id}
                onClick={() => onRelation(relation.id)}
                style={{ left: position.x, top: position.y }}
                title="查看连接的推理过程"
                type="button"
              >
                {relation.label}
              </button>
            );
          })}
        </div>
      </div>
      )}
    </section>
  );
}

function WiseStepMark({ pending = false }: { pending?: boolean }) {
  return (
    <span className="relative grid h-7 w-7 place-items-center rounded bg-slate-950">
      <svg
        aria-hidden="true"
        className="h-[19px] w-[19px]"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle cx="5.5" cy="5.5" fill="#fff" r="2" />
        <circle cx="18.5" cy="5.5" fill="#fff" r="2" />
        <path
          d="M5.5 8v2.25H12m6.5-2.25v2.25H12v2.4"
          stroke="#67e8f9"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
        />
        <path
          d="m12 12.25 3.25 3.25L12 18.75 8.75 15.5 12 12.25Z"
          fill="#67e8f9"
        />
        <circle cx="12" cy="15.5" fill="#0f172a" r="1.15" />
      </svg>
      {pending ? (
        <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border-2 border-amber-50 bg-amber-500" />
      ) : null}
    </span>
  );
}

function MapLane({ label, y }: { label: string; y: number }) {
  return (
    <div
      className="absolute left-4 z-20 border-l-2 border-slate-300 pl-2"
      style={{ top: y }}
    >
      <p className="font-mono text-[10px] font-bold text-slate-700">{label}</p>
    </div>
  );
}

function MapLegend({ showActions }: { showActions: boolean }) {
  const items: Array<{ label: string; className: string }> = [
    { label: "层级", className: "bg-slate-400" },
    { label: "依赖", className: "bg-violet-500" },
  ];
  if (showActions) {
    items.push(
      { label: "执行", className: "bg-cyan-600" },
      { label: "Action 前置", className: "bg-amber-500" },
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
      {items.map((item) => (
        <span className="inline-flex items-center gap-1.5" key={item.label}>
          <span className={`h-0.5 w-5 ${item.className}`} />
          {item.label}
        </span>
      ))}
    </div>
  );
}

function GoalMapNode({
  focused,
  goal,
  goalRecords,
  onClick,
  position,
}: {
  focused: boolean;
  goal: Goal;
  goalRecords: Record<string, Goal>;
  onClick: () => void;
  position: NodePosition;
}) {
  const children = getGoalChildren(goal.id, goalRecords);
  const root = goal.level === 0;
  return (
    <button
      className={`absolute z-10 overflow-hidden rounded-md border bg-white text-left transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 ${
        focused
          ? "border-cyan-700 shadow-[0_0_0_4px_rgba(8,145,178,.18)]"
          : root
          ? "border-cyan-600 shadow-[0_0_0_3px_rgba(8,145,178,.10)]"
          : "border-slate-300 hover:border-slate-500 hover:shadow-sm"
      }`}
      onClick={onClick}
      style={{
        height: position.height,
        left: position.x,
        top: position.y,
        width: position.width,
      }}
      type="button"
    >
      <span className="block px-4 pb-3 pt-3">
        <span className="flex items-center justify-between gap-2">
          <span className="font-mono text-[9px] font-bold text-cyan-700">
            {goal.id}
          </span>
          <StatusBadge meta={goalStatusMeta[goal.status]} />
        </span>
        <span
          className={`mt-2 block font-semibold leading-5 text-slate-950 ${
            root ? "text-base" : "text-sm"
          }`}
        >
          {goal.title}
        </span>
        <span className="mt-1.5 line-clamp-2 block text-[10px] leading-4 text-slate-500">
          {goal.intent}
        </span>
      </span>
      <span className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 border-t border-slate-100 px-4 py-2 text-[9px] text-slate-500">
        <span className="truncate">{actorLabel(goal.dri)}</span>
        <span className="shrink-0 font-semibold text-slate-700">
          {children.length ? `${children.length} 个下级 Goal` : "叶子 Goal"}
        </span>
      </span>
    </button>
  );
}

function ActionMapNode({
  action,
  onClick,
  position,
}: {
  action: Action;
  onClick: () => void;
  position: NodePosition;
}) {
  return (
    <button
      className="absolute z-10 overflow-hidden rounded-md border border-slate-300 bg-white text-left transition hover:border-cyan-600 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
      onClick={onClick}
      style={{
        height: position.height,
        left: position.x,
        top: position.y,
        width: position.width,
      }}
      type="button"
    >
      <span className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <span className="inline-flex items-center gap-1.5 font-mono text-[9px] font-bold text-cyan-700">
          <Play className="h-3 w-3" />
          {action.id}
        </span>
        <StatusBadge meta={getActionStatusMeta(action)} />
      </span>
      <span className="block px-3 py-2">
        <span className="line-clamp-2 block text-[11px] font-semibold leading-4 text-slate-900">
          {action.title}
        </span>
        <span className="mt-1 block truncate text-[9px] text-slate-400">
          {actorLabel(action.executor)}
        </span>
      </span>
    </button>
  );
}

function StatusBadge({
  meta,
}: {
  meta: { label: string; tone: string };
}) {
  return (
    <span className={`rounded px-1.5 py-0.5 text-[8px] font-semibold ${meta.tone}`}>
      {meta.label}
    </span>
  );
}

function GoalDetail({
  actions,
  decompositionReviews,
  goal,
  goalRecords,
  onAction,
  onBack,
  onDecomposition,
  onGoal,
  onRelation,
  relations,
}: {
  actions: Action[];
  decompositionReviews: DecompositionReview[];
  goal: Goal;
  goalRecords: Record<string, Goal>;
  onAction: (id: string) => void;
  onBack: () => void;
  onDecomposition: (goalId: string) => void;
  onGoal: (id: string) => void;
  onRelation: (id: string) => void;
  relations: Relation[];
}) {
  const children = getGoalChildren(goal.id, goalRecords);
  const goalActions = actions.filter((action) => action.goalId === goal.id);
  const connected = relations.filter(
    (relation) =>
      relation.kind !== "decomposes" &&
      (relation.sourceId === goal.id || relation.targetId === goal.id),
  );
  const isComposite = children.length > 0;
  const hasDecompositionReview = decompositionReviews.some(
    (review) => review.goalId === goal.id,
  );

  return (
    <article className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <DocumentBreadcrumb
          currentId={goal.id}
          goalId={goal.id}
          goalRecords={goalRecords}
          onGoal={onGoal}
          onMap={onBack}
        />
        <header className="mt-4 border-b border-slate-300 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700">
                <CircleDot className="h-3.5 w-3.5" />
                Goal · {isComposite ? "组合目标" : "叶子目标"}
              </div>
              <h1 className="mt-2 max-w-3xl text-2xl font-semibold leading-8 text-slate-950">
                {goal.title}
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {goal.intent}
              </p>
            </div>
            <StatusBadge meta={goalStatusMeta[goal.status]} />
          </div>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" />
              DRI · {actorLabel(goal.dri)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-3.5 w-3.5" />
              {formatDate(goal.timebox.startsAt, goal.timebox.timezone)}
              {" → "}
              {formatDate(goal.timebox.dueAt, goal.timebox.timezone)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ListTree className="h-3.5 w-3.5" />
              {isComposite
                ? `${children.length} 个下级 Goal · 不直接执行`
                : `${goalActions.length} 个 Action`}
            </span>
          </div>
        </header>

        <div className="grid min-w-0 gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            <GoalReasoningChain
              decompositionReviews={decompositionReviews}
              goal={goal}
              onOpen={onDecomposition}
              relations={relations}
            />

            <DetailSection icon={CheckCircle2} title="成功标准">
              <ol className="divide-y divide-slate-200 border-y border-slate-200">
                {goal.successCriteria.map((criterion, index) => (
                  <li
                    className="grid grid-cols-[36px_1fr] gap-3 py-3 text-sm leading-6 text-slate-700"
                    key={criterion}
                  >
                    <span className="font-mono text-[10px] font-bold text-cyan-700">
                      S{index + 1}
                    </span>
                    {criterion}
                  </li>
                ))}
              </ol>
            </DetailSection>

            <DetailSection
              icon={isComposite ? ListTree : Play}
              title={isComposite ? "下级 Goal" : "Actions"}
            >
              {isComposite ? (
                <>
                  <button
                    className="mb-4 flex w-full items-center justify-between gap-4 rounded-md border border-cyan-200 bg-cyan-50/60 px-4 py-3 text-left hover:border-cyan-500"
                    onClick={() => onDecomposition(goal.id)}
                    type="button"
                  >
                    <span>
                      <span className="block text-xs font-semibold text-cyan-950">
                        审查这一组拆解
                      </span>
                      <span className="mt-1 block text-[10px] leading-5 text-cyan-800">
                        为什么是 {children.length} 个 Goal？检查覆盖、边界和遗漏候选。
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-cyan-600" />
                  </button>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {children.map((child) => (
                      <NodeLink
                        key={child.id}
                        meta={`${child.id} · ${goalStatusMeta[child.status].label}`}
                        onClick={() => onGoal(child.id)}
                        title={child.title}
                      />
                    ))}
                  </div>
                </>
              ) : goalActions.length > 0 ? (
                <div className="divide-y divide-slate-200 border-y border-slate-200">
                  {goalActions.map((action) => (
                    <button
                      className="flex w-full items-center justify-between gap-4 py-3 text-left hover:text-cyan-800"
                      key={action.id}
                      onClick={() => onAction(action.id)}
                      type="button"
                    >
                      <span>
                        <span className="block text-sm font-semibold">
                          {action.title}
                        </span>
                        <span className="mt-1 block text-[10px] text-slate-400">
                          {action.id} · {actorLabel(action.executor)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        <StatusBadge meta={getActionStatusMeta(action)} />
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <>
                  {hasDecompositionReview ? (
                    <button
                      className="mb-3 flex w-full items-center justify-between gap-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-left hover:border-amber-600"
                      onClick={() => onDecomposition(goal.id)}
                      type="button"
                    >
                      <span>
                        <span className="flex items-center gap-2 text-xs font-semibold text-amber-950">
                          <Bot className="h-3.5 w-3.5" />
                          审查官方 Reasoning Agent 提案
                        </span>
                        <span className="mt-1 block text-[10px] leading-5 text-amber-800">
                          提案尚未写入正式 Goal，需由 {actorLabel(goal.dri)} 确认。
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-amber-700" />
                    </button>
                  ) : null}
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-center text-xs text-slate-500">
                    这是叶子 Goal，尚未创建 Action。
                  </div>
                </>
              )}
              <p className="mt-3 text-[10px] leading-5 text-slate-400">
                {isComposite
                  ? "组合 Goal 通过下级 Goal 推进，本层不能直接创建 Action。"
                  : "叶子 Goal 可以有多次 Action；失败或重做会保留为独立执行记录。"}
              </p>
            </DetailSection>

            <DetailSection icon={GitBranch} title="连接与推理">
              <RelationList
                onOpen={onRelation}
                relations={connected}
              />
            </DetailSection>
          </div>

          <aside className="min-w-0 space-y-4">
            <DetailAside title="治理">
              <Fact label="Goal ID" value={goal.id} />
              <Fact label="Human DRI" value={actorLabel(goal.dri)} />
              <Fact label="授权边界" value={goal.autonomy} />
            </DetailAside>
            <DetailAside title="时间">
              <Fact
                label="开始"
                value={new Date(goal.timebox.startsAt).toLocaleString("zh-CN", {
                  timeZone: goal.timebox.timezone,
                })}
              />
              <Fact
                label="Deadline"
                value={new Date(goal.timebox.dueAt).toLocaleString("zh-CN", {
                  timeZone: goal.timebox.timezone,
                })}
              />
              <Fact label="时区" value={goal.timebox.timezone} />
            </DetailAside>
            <DetailAside title="约束">
              <ul className="space-y-2">
                {goal.constraints.map((constraint) => (
                  <li
                    className="flex gap-2 text-xs leading-5 text-slate-600"
                    key={constraint}
                  >
                    <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-700" />
                    {constraint}
                  </li>
                ))}
              </ul>
            </DetailAside>
          </aside>
        </div>
      </div>
    </article>
  );
}

function ActionDetail({
  action,
  goalRecords,
  onBack,
  onGoal,
  onRelation,
  onUpdate,
  relations,
}: {
  action: Action;
  goalRecords: Record<string, Goal>;
  onBack: () => void;
  onGoal: (id: string) => void;
  onRelation: (id: string) => void;
  onUpdate: (action: Action) => Promise<void>;
  relations: Relation[];
}) {
  const goal = goalRecords[action.goalId];
  const [running, setRunning] = useState(false);
  const connected = relations.filter(
    (relation) =>
      relation.sourceId === action.id || relation.targetId === action.id,
  );

  const execute = async () => {
    setRunning(true);
    try {
      await onUpdate({
        ...action,
        status: "running",
        startedAt: new Date().toISOString(),
      });
      const response = await requestExecutionAgent({
        goal: {
          id: goal.id,
          title: goal.title,
          problem: goal.intent,
          objective: goal.intent,
          acceptance: goal.successCriteria
            .map((criterion, index) => `S${index + 1}: ${criterion}`)
            .join("\n"),
          dri: actorLabel(goal.dri),
          reasoningAgent: `${actors.reasoning.name} ${actors.reasoning.version}`,
          executionAgents: [actorLabel(action.executor)],
          autonomy: goal.autonomy,
          parent: goal.parentId
            ? `${goal.parentId} ${goalRecords[goal.parentId].title}`
            : undefined,
          children: getGoalChildren(goal.id, goalRecords).map((child) => ({
            id: child.id,
            title: child.title,
            relation: "拆解为",
          })),
        },
        action: action.title,
        agent: actorLabel(action.executor),
        riskLevel: action.risk,
        approvedBy: actorLabel(action.approvedBy),
        context: [
          `Input: ${action.input}`,
          `Expected output: ${action.expectedOutput}`,
          `Authorization: ${action.authorization}`,
        ].join("\n"),
      });
      await onUpdate({
        ...action,
        status: "review",
        startedAt: action.startedAt ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),
        outcome: response.outcome,
        evidence: response.evidence.map((item, index) => ({
          ...item,
          id: `${action.id}-E${index + 1}`,
        })),
      });
    } catch (error) {
      try {
        await onUpdate({
          ...action,
          status: "failed",
          completedAt: new Date().toISOString(),
          outcome: error instanceof Error ? error.message : "Action 执行失败",
        });
      } catch {
        // The workspace-level retry control retains the server error.
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <article className="h-full overflow-auto">
      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6">
        <DocumentBreadcrumb
          currentId={action.id}
          goalId={goal.id}
          goalRecords={goalRecords}
          onGoal={onGoal}
          onMap={onBack}
        />
        <header className="mt-4 border-b border-slate-300 pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-700">
                <Play className="h-3.5 w-3.5" />
                Action · {action.id}
              </div>
              <h1 className="mt-2 text-2xl font-semibold leading-8 text-slate-950">
                {action.title}
              </h1>
              <button
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-cyan-800 hover:text-cyan-950"
                onClick={() => onGoal(goal.id)}
                type="button"
              >
                属于 {goal.id} · {goal.title}
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <StatusBadge meta={getActionStatusMeta(action)} />
          </div>
        </header>

        <div className="grid min-w-0 gap-6 py-6 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-6">
            <ActionReasoningChain action={action} />

            <DetailSection icon={Play} title="执行定义">
              <div className="grid gap-4 sm:grid-cols-2">
                <Fact label="输入" value={action.input} />
                <Fact label="预期输出" value={action.expectedOutput} />
              </div>
              {["ready", "redo", "failed"].includes(action.status) &&
              action.authorization ? (
                <button
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-xs font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
                  disabled={running}
                  onClick={() => void execute()}
                  type="button"
                >
                  {running ? (
                    <Activity className="h-4 w-4 animate-pulse" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {running ? "执行中" : "执行 Action"}
                </button>
              ) : null}
            </DetailSection>

            <DetailSection icon={FileCheck2} title="结果与证据">
              <Fact
                label="Outcome"
                value={action.outcome ?? "尚未产生实际结果。"}
              />
              {action.evidence.length > 0 ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {action.evidence.map((evidence) => (
                    <div
                      className="rounded-md border border-slate-200 bg-white p-3"
                      key={evidence.id}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900">
                          {evidence.label}
                        </span>
                        <span className="font-mono text-[8px] uppercase text-slate-400">
                          {evidence.kind}
                        </span>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-slate-600">
                        {evidence.detail}
                      </p>
                      {evidence.source ? (
                        <p className="mt-2 break-all font-mono text-[9px] text-cyan-700">
                          {evidence.source}
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {action.status === "review" ? (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                  <button
                    className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:border-violet-400 hover:text-violet-700"
                    onClick={() => {
                      void onUpdate({
                        ...action,
                        status: "redo",
                        decision: `${actorLabel(goal.dri)} 要求重做，当前证据保留为历史记录。`,
                      }).catch(() => undefined);
                    }}
                    type="button"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    要求重做
                  </button>
                  <button
                    className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
                    onClick={() => {
                      void onUpdate({
                        ...action,
                        status: "accepted",
                        decision: `${actorLabel(goal.dri)} 已接受本次结果。`,
                      }).catch(() => undefined);
                    }}
                    type="button"
                  >
                    <Check className="h-3.5 w-3.5" />
                    接受结果
                  </button>
                </div>
              ) : null}
              {action.decision ? (
                <p className="mt-4 border-l-2 border-emerald-600 pl-3 text-xs leading-5 text-slate-700">
                  {action.decision}
                </p>
              ) : null}
            </DetailSection>

            <DetailSection icon={GitBranch} title="连接与推理">
              <RelationList onOpen={onRelation} relations={connected} />
            </DetailSection>
          </div>

          <aside className="min-w-0 space-y-4">
            <DetailAside title="执行主体">
              <Fact label="Executor" value={actorLabel(action.executor)} />
              <Fact
                label="Approved by"
                value={
                  action.authorization
                    ? actorLabel(action.approvedBy)
                    : "尚未授权"
                }
              />
              <Fact
                label="风险"
                value={
                  action.risk === "low"
                    ? "低风险"
                    : action.risk === "medium"
                      ? "中风险"
                      : "高风险"
                }
              />
            </DetailAside>
            <DetailAside title="授权边界">
              <p className="text-xs leading-5 text-slate-600">
                {action.authorization}
              </p>
            </DetailAside>
          </aside>
        </div>
      </div>
    </article>
  );
}

function DocumentBreadcrumb({
  currentId,
  goalId,
  goalRecords,
  onGoal,
  onMap,
}: {
  currentId: string;
  goalId: string;
  goalRecords: Record<string, Goal>;
  onGoal: (id: string) => void;
  onMap: () => void;
}) {
  const path = getGoalPath(goalId, goalRecords);

  return (
    <nav
      aria-label="文档路径"
      className="flex min-w-0 items-center gap-1 overflow-x-auto pb-1 text-[10px] font-semibold text-slate-500"
    >
      <button
        className="shrink-0 hover:text-cyan-800"
        onClick={onMap}
        type="button"
      >
        Map
      </button>
      {path.map((item) => (
        <span className="flex shrink-0 items-center gap-1" key={item.id}>
          <ChevronRight className="h-3 w-3 text-slate-300" />
          {item.id === currentId ? (
            <span className="text-slate-950" title={item.title}>
              {item.id}
            </span>
          ) : (
            <button
              className="hover:text-cyan-800"
              onClick={() => onGoal(item.id)}
              title={item.title}
              type="button"
            >
              {item.id}
            </button>
          )}
        </span>
      ))}
      {currentId !== goalId ? (
        <span className="flex shrink-0 items-center gap-1">
          <ChevronRight className="h-3 w-3 text-slate-300" />
          <span className="text-slate-950">{currentId}</span>
        </span>
      ) : null}
    </nav>
  );
}

type WiseStepItem = {
  id: string;
  actor: string;
  stage: string;
  content: string;
};

function WiseStepChain({
  items,
  onOpen,
}: {
  items: WiseStepItem[];
  onOpen?: () => void;
}) {
  return (
    <DetailSection icon={GitBranch} title="WISESTEP 推理链">
      <div className="border-y border-slate-200">
        {items.map((item, index) => (
          <div
            className="grid grid-cols-[24px_minmax(0,1fr)] gap-3 border-b border-slate-100 py-3 last:border-b-0"
            key={item.id}
          >
            <span className="grid h-6 w-6 place-items-center rounded border border-cyan-200 bg-cyan-50 font-mono text-[9px] font-bold text-cyan-800">
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[9px] font-semibold text-cyan-800">
                  {item.stage}
                </span>
                <span className="text-[9px] text-slate-400">{item.actor}</span>
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-700">
                {item.content}
              </span>
            </span>
          </div>
        ))}
      </div>
      {onOpen ? (
        <button
          className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-800 hover:text-cyan-950"
          onClick={onOpen}
          type="button"
        >
          查看完整推演
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </DetailSection>
  );
}

function GoalReasoningChain({
  decompositionReviews,
  goal,
  onOpen,
  relations,
}: {
  decompositionReviews: DecompositionReview[];
  goal: Goal;
  onOpen: (goalId: string) => void;
  relations: Relation[];
}) {
  const ownReview = decompositionReviews.find(
    (review) => review.goalId === goal.id,
  );
  const parentReview = goal.parentId
    ? decompositionReviews.find((review) => review.goalId === goal.parentId)
    : undefined;
  const review = ownReview ?? parentReview;
  const origin = goal.parentId
    ? relations.find(
        (relation) =>
          relation.kind === "decomposes" &&
          relation.sourceId === goal.parentId &&
          relation.targetId === goal.id,
      )
    : undefined;

  const sourceItems: WiseStepItem[] = [];
  if (!ownReview && origin) {
    sourceItems.push({
      id: `${origin.id}-rationale`,
      actor: origin.createdBy,
      stage: "目标来源",
      content: origin.rationale,
    });
  }
  if (review) {
    sourceItems.push(
      ...review.events.map((event) => ({
        id: event.id,
        actor: event.actor,
        stage:
          event.type === "decision"
            ? "DRI 决策"
            : event.type === "proposal"
              ? "提案"
              : "分析",
        content: event.content,
      })),
    );
  }
  const items = sourceItems.slice(-3);
  if (items.length === 0) {
    items.push({
      id: `${goal.id}-intent`,
      actor: actorLabel(goal.dri),
      stage: "当前结论",
      content: goal.intent,
    });
  }

  return (
    <WiseStepChain
      items={items}
      onOpen={review ? () => onOpen(review.goalId) : undefined}
    />
  );
}

function ActionReasoningChain({ action }: { action: Action }) {
  const items: WiseStepItem[] = [
    {
      id: `${action.id}-authorization`,
      actor: actorLabel(action.approvedBy),
      stage: "授权",
      content: action.authorization || "等待 Human DRI 授权。",
    },
  ];
  if (action.outcome) {
    items.push({
      id: `${action.id}-outcome`,
      actor: actorLabel(action.executor),
      stage: "执行结果",
      content: action.outcome,
    });
  }
  if (action.decision) {
    items.push({
      id: `${action.id}-decision`,
      actor: actorLabel(action.approvedBy),
      stage: "DRI 决策",
      content: action.decision,
    });
  }
  return <WiseStepChain items={items} />;
}

function DetailSection({
  children,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  icon: typeof CircleDot;
  title: string;
}) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
        <Icon className="h-4 w-4 text-cyan-700" />
        {title}
      </h2>
      {children}
    </section>
  );
}

function DetailAside({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-xs leading-5 text-slate-700">{value}</p>
    </div>
  );
}

function NodeLink({
  meta,
  onClick,
  title,
}: {
  meta: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      className="rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-cyan-500 hover:shadow-sm"
      onClick={onClick}
      type="button"
    >
      <span className="text-[9px] font-semibold uppercase text-slate-400">
        {meta}
      </span>
      <span className="mt-1 block text-sm font-semibold text-slate-900">
        {title}
      </span>
    </button>
  );
}

function RelationList({
  onOpen,
  relations,
}: {
  onOpen: (id: string) => void;
  relations: Relation[];
}) {
  if (relations.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-xs text-slate-400">
        暂无连接。
      </p>
    );
  }
  return (
    <div className="divide-y divide-slate-200 border-y border-slate-200">
      {relations.map((relation) => (
        <button
          className="flex w-full items-center justify-between gap-4 py-3 text-left hover:text-cyan-800"
          key={relation.id}
          onClick={() => onOpen(relation.id)}
          type="button"
        >
          <span className="flex min-w-0 items-center gap-3">
            <Link2 className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="min-w-0">
              <span className="block text-xs font-semibold">
                {relation.sourceId} → {relation.targetId}
              </span>
              <span className="mt-1 block truncate text-[10px] text-slate-400">
                {relation.rationale}
              </span>
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span
              className={`rounded border px-2 py-1 text-[9px] font-semibold ${relationMeta[relation.kind].tone}`}
            >
              {relationMeta[relation.kind].label}
            </span>
            <ChevronRight className="h-4 w-4 text-slate-300" />
          </span>
        </button>
      ))}
    </div>
  );
}

function DecompositionPanel({
  goalRecords,
  onClose,
  onConfirm,
  onGoal,
  onUpdate,
  review,
}: {
  goalRecords: Record<string, Goal>;
  onClose: () => void;
  onConfirm: (review: DecompositionReview) => Promise<void>;
  onGoal: (id: string) => void;
  onUpdate: (review: DecompositionReview) => Promise<void>;
  review: DecompositionReview;
}) {
  const [message, setMessage] = useState("");
  const parent = goalRecords[review.goalId];
  const decompositionCount =
    review.status === "proposed"
      ? review.proposedGoals.length
      : review.childGoalIds.length;

  const submitMessage = async () => {
    if (!message.trim()) return;
    await onUpdate({
      ...review,
      events: [
        ...review.events,
        {
          id: `${review.id}-${Date.now()}`,
          actor: "Human DRI",
          type: "proposal",
          content: message.trim(),
          createdAt: new Date().toISOString(),
        },
      ],
    });
    setMessage("");
  };

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-xl flex-col border-l border-slate-300 bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <WiseStepMark pending={review.status === "proposed"} />
            <span className="text-[10px] font-semibold tracking-[0.12em] text-cyan-800">
              WISESTEP
            </span>
            <span className="font-mono text-[9px] text-slate-400">
              {review.id}
            </span>
          </div>
          <h2 className="mt-2 text-base font-semibold text-slate-950">
            {review.question}
          </h2>
        </div>
        <button
          aria-label="关闭拆解方案推演"
          className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-900"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        <button
          className="w-full rounded-md border border-slate-300 bg-slate-50 p-3 text-left hover:border-cyan-500"
          onClick={() => onGoal(parent.id)}
          type="button"
        >
          <span className="font-mono text-[9px] font-bold text-cyan-700">
            {parent.id} · 父 Goal
          </span>
          <span className="mt-1 block text-sm font-semibold text-slate-900">
            {parent.title}
          </span>
        </button>

        <div className="mt-3 flex items-center gap-3 border-l-2 border-cyan-600 bg-cyan-50/60 px-3 py-2.5">
          <span className="font-mono text-[10px] font-bold text-cyan-800">
            1 → {decompositionCount}
          </span>
          <p className="text-xs leading-5 text-slate-700">
            从这个上级 Goal 拆成 {decompositionCount} 个职责清晰、可分别验收的下级 Goal。
          </p>
        </div>

        <section className="mt-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            从上级到下级
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {review.logic}
          </p>
        </section>

        <section className="mt-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            为什么拆成这 {decompositionCount} 个
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {review.completeness}
          </p>
        </section>

        <section className="mt-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            每个下级 Goal 负责什么
          </h3>
          <div className="mt-2 grid gap-2">
            {review.status === "proposed"
              ? review.proposedGoals.map((proposal, index) => (
                  <div
                    className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-md border border-amber-300 bg-amber-50/60 p-3"
                    key={proposal.proposedId}
                  >
                    <span className="grid h-8 w-8 place-items-center rounded bg-amber-100 font-mono text-[10px] font-bold text-amber-800">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[9px] font-bold text-amber-800">
                          {proposal.proposedId} · PROPOSED
                        </span>
                        <Bot className="h-3.5 w-3.5 text-amber-700" />
                      </div>
                      <span className="mt-1 block text-xs font-semibold text-slate-900">
                        {proposal.title}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-600">
                        {proposal.intent}
                      </span>
                      <span className="mt-2 block text-[10px] leading-4 text-slate-500">
                        DRI · {actorLabel(proposal.dri)} · Deadline{" "}
                        {formatDate(
                          proposal.timebox.dueAt,
                          proposal.timebox.timezone,
                        )}
                      </span>
                    </div>
                  </div>
                ))
              : review.childGoalIds.map((goalId, index) => (
                  <button
                    className="grid grid-cols-[32px_minmax(0,1fr)] gap-3 rounded-md border border-slate-200 bg-white p-3 text-left hover:border-cyan-500"
                    key={goalId}
                    onClick={() => onGoal(goalId)}
                    type="button"
                  >
                    <span className="grid h-8 w-8 place-items-center rounded bg-cyan-50 font-mono text-[10px] font-bold text-cyan-800">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="font-mono text-[9px] font-bold text-cyan-700">
                        {goalId}
                      </span>
                      <span className="mt-1 block text-xs font-semibold text-slate-900">
                        {goalRecords[goalId].title}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-slate-600">
                        {goalRecords[goalId].intent}
                      </span>
                    </span>
                  </button>
                ))}
          </div>
        </section>

        <section className="mt-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            边界规则
          </h3>
          <ul className="mt-2 space-y-2">
            {review.boundaryRules.map((rule) => (
              <li
                className="flex gap-2 text-xs leading-5 text-slate-600"
                key={rule}
              >
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-700" />
                {rule}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            考虑过但未单列的方案
          </h3>
          <div className="mt-2 divide-y divide-slate-200 border-y border-slate-200">
            {review.alternatives.map((alternative) => (
              <div className="py-3" key={alternative.title}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-slate-800">
                    {alternative.title}
                  </span>
                  <span className="shrink-0 rounded border border-slate-300 px-2 py-1 text-[9px] font-semibold text-slate-600">
                    {alternative.decision === "included"
                      ? "已纳入"
                      : alternative.decision === "merged"
                        ? "合并到现有 Goal"
                        : "不单列"}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {alternative.rationale}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            尚需复查
          </h3>
          <ul className="mt-2 space-y-2">
            {review.openQuestions.map((question) => (
              <li
                className="flex gap-2 text-xs leading-5 text-slate-600"
                key={question}
              >
                <CircleDot className="mt-1 h-3 w-3 shrink-0 text-amber-500" />
                {question}
              </li>
            ))}
          </ul>
        </section>

        <ReasoningHistory events={review.events} />

        <div className="mt-2 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 text-[10px]">
          <Fact label="提出者" value={review.createdBy} />
          <Fact
            label="方案状态"
            value={review.status === "confirmed" ? "已确认" : "待确认"}
          />
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-slate-50 p-4">
        {review.status === "proposed" ? (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-md border border-amber-300 bg-amber-50 p-3">
            <div>
              <p className="text-xs font-semibold text-amber-950">
                等待 Human DRI 确认
              </p>
              <p className="mt-1 text-[10px] leading-4 text-amber-800">
                确认后才会创建 {review.proposedGoals.length} 个正式 Goal 和对应 Relation。
              </p>
            </div>
            <button
              className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md bg-slate-950 px-3 text-xs font-semibold text-white hover:bg-cyan-800"
              onClick={() => {
                void onConfirm(review).catch(() => undefined);
              }}
              type="button"
            >
              <Check className="h-3.5 w-3.5" />
              确认写入
            </button>
          </div>
        ) : null}
        <label className="text-[9px] font-semibold uppercase text-slate-400">
          继续推演这组拆解
          <span className="mt-1.5 flex items-center gap-2">
            <textarea
              className="min-h-16 flex-1 resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-xs leading-5 text-slate-700 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              onChange={(event) => setMessage(event.target.value)}
              placeholder="补充遗漏候选、边界冲突或反例……"
              value={message}
            />
            <button
              aria-label="提交拆解方案推演"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cyan-700 text-white hover:bg-cyan-800 disabled:opacity-40"
              disabled={!message.trim()}
              onClick={() => void submitMessage().catch(() => undefined)}
              type="button"
            >
              <Send className="h-4 w-4" />
            </button>
          </span>
        </label>
      </footer>
    </aside>
  );
}

function ReasoningHistory({ events }: { events: Relation["events"] }) {
  return (
    <section className="mt-6">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          历史推演
        </h3>
        <span className="font-mono text-[9px] text-slate-400">
          {events.length} EVENTS
        </span>
      </div>
      <div className="mt-3 border-l border-slate-200 pl-4">
        {events.length ? (
          events.map((event) => (
            <div className="relative pb-5" key={event.id}>
              <span className="absolute -left-[19px] top-1 h-2 w-2 rounded-full bg-cyan-600" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold text-slate-700">
                  {event.actor}
                </span>
                <span className="font-mono text-[8px] text-slate-400">
                  {new Date(event.createdAt).toLocaleString("zh-CN")}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-600">
                {event.content}
              </p>
            </div>
          ))
        ) : (
          <p className="pb-4 text-xs text-slate-400">尚无追加推演。</p>
        )}
      </div>
    </section>
  );
}

function RelationPanel({
  goalRecords,
  onClose,
  onNode,
  onUpdate,
  relation,
}: {
  goalRecords: Record<string, Goal>;
  onClose: () => void;
  onNode: (id: string) => void;
  onUpdate: (relation: Relation) => Promise<void>;
  relation: Relation;
}) {
  const [message, setMessage] = useState("");
  const sourceTitle = goalRecords[relation.sourceId]?.title ??
    initialActions.find((action) => action.id === relation.sourceId)?.title;
  const targetTitle = goalRecords[relation.targetId]?.title ??
    initialActions.find((action) => action.id === relation.targetId)?.title;

  const submitMessage = async () => {
    if (!message.trim()) return;
    await onUpdate({
      ...relation,
      events: [
        ...relation.events,
        {
          id: `${relation.id}-${Date.now()}`,
          actor: "Human DRI",
          type: "proposal",
          content: message.trim(),
          createdAt: new Date().toISOString(),
        },
      ],
    });
    setMessage("");
  };

  return (
    <aside className="absolute inset-y-0 right-0 z-40 flex w-full max-w-lg flex-col border-l border-slate-300 bg-white shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded border px-2 py-1 text-[9px] font-semibold ${relationMeta[relation.kind].tone}`}
            >
              {relationMeta[relation.kind].label}
            </span>
            <span className="font-mono text-[9px] text-slate-400">
              {relation.id}
            </span>
          </div>
          <h2 className="mt-2 text-base font-semibold text-slate-950">
            连接的推理过程
          </h2>
        </div>
        <button
          aria-label="关闭连接详情"
          className="grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-900"
          onClick={onClose}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
        <div className="grid grid-cols-[1fr_32px_1fr] items-center gap-2">
          <button
            className="rounded-md border border-slate-200 bg-slate-50 p-3 text-left hover:border-cyan-500"
            onClick={() => onNode(relation.sourceId)}
            type="button"
          >
            <span className="font-mono text-[9px] font-bold text-cyan-700">
              {relation.sourceId}
            </span>
            <span className="mt-1 line-clamp-2 block text-xs font-semibold text-slate-800">
              {sourceTitle}
            </span>
          </button>
          <ArrowRight className="mx-auto h-4 w-4 text-slate-400" />
          <button
            className="rounded-md border border-slate-200 bg-slate-50 p-3 text-left hover:border-cyan-500"
            onClick={() => onNode(relation.targetId)}
            type="button"
          >
            <span className="font-mono text-[9px] font-bold text-cyan-700">
              {relation.targetId}
            </span>
            <span className="mt-1 line-clamp-2 block text-xs font-semibold text-slate-800">
              {targetTitle}
            </span>
          </button>
        </div>

        <section className="mt-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            为什么存在这条连接
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {relation.rationale}
          </p>
        </section>

        <section className="mt-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            依赖假设
          </h3>
          <ul className="mt-2 space-y-2">
            {relation.assumptions.map((assumption) => (
              <li
                className="flex gap-2 text-xs leading-5 text-slate-600"
                key={assumption}
              >
                <CircleDot className="mt-1 h-3 w-3 shrink-0 text-violet-500" />
                {assumption}
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              历史推演
            </h3>
            <span className="font-mono text-[9px] text-slate-400">
              {relation.events.length} EVENTS
            </span>
          </div>
          <div className="mt-3 border-l border-slate-200 pl-4">
            {relation.events.length ? (
              relation.events.map((event) => (
                <div className="relative pb-5" key={event.id}>
                  <span className="absolute -left-[19px] top-1 h-2 w-2 rounded-full bg-cyan-600" />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-slate-700">
                      {event.actor}
                    </span>
                    <span className="font-mono text-[8px] text-slate-400">
                      {new Date(event.createdAt).toLocaleString("zh-CN")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {event.content}
                  </p>
                </div>
              ))
            ) : (
              <p className="pb-4 text-xs text-slate-400">
                当前连接由确认记录直接建立，尚无追加讨论。
              </p>
            )}
          </div>
        </section>

        <div className="mt-2 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 text-[10px]">
          <Fact label="提出者" value={relation.createdBy} />
          <Fact
            label="关系状态"
            value={relation.status === "confirmed" ? "已确认" : "待确认"}
          />
        </div>
      </div>

      <footer className="border-t border-slate-200 bg-slate-50 p-4">
        <label className="text-[9px] font-semibold uppercase text-slate-400">
          继续推演这条连接
          <span className="mt-1.5 flex items-center gap-2">
            <textarea
              className="min-h-16 flex-1 resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-xs leading-5 text-slate-700 outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
              onChange={(event) => setMessage(event.target.value)}
              placeholder="补充依据、反例或修改建议……"
              value={message}
            />
            <button
              aria-label="提交连接推演"
              className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-cyan-700 text-white hover:bg-cyan-800 disabled:opacity-40"
              disabled={!message.trim()}
              onClick={() => void submitMessage().catch(() => undefined)}
              type="button"
            >
              <Send className="h-4 w-4" />
            </button>
          </span>
        </label>
      </footer>
    </aside>
  );
}
