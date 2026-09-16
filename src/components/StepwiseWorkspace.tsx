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

function relationPath(relation: Relation): string {
  const source =
    goalPositions[relation.sourceId] ?? actionPositions[relation.sourceId];
  const target =
    goalPositions[relation.targetId] ?? actionPositions[relation.targetId];
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

  const commitWorkspace = useCallback(
    async (operation: () => Promise<ServerWorkspaceSnapshot>) => {
      setWorkspaceSyncing(true);
      setWorkspaceError(null);
      try {
        applyWorkspaceSnapshot(await operation());
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

  const openGoal = (id: string) => setSelection({ type: "goal", id });
  const openAction = (id: string) => setSelection({ type: "action", id });

  return (
    <main className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-slate-300 bg-white shadow-sm sm:min-h-[760px]">
      <WorkspaceHeader
        goalRecords={goalRecords}
        onDocument={() => {
          if (!selection) openGoal("G0");
        }}
        onMap={() => {
          setSelection(null);
          setSelectedDecompositionGoalId(null);
          setSelectedRelationId(null);
        }}
        onRefresh={() => void commitWorkspace(fetchWorkspace)}
        selection={selection}
        showActions={showActions}
        workspaceError={workspaceError}
        workspaceSyncing={workspaceSyncing}
        onToggleActions={() => setShowActions((current) => !current)}
      />

      <div className="relative min-h-0 flex-1 overflow-hidden bg-slate-100">
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
              onUpdate={(updated) =>
                commitWorkspace(() => updateServerAction(updated))
              }
              relations={relations}
            />
          )
        ) : (
          <WorkMap
            actions={actions}
            decompositionReviews={decompositionReviews}
            goalRecords={goalRecords}
            onAction={openAction}
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
            onConfirm={(review) =>
              commitWorkspace(() =>
                confirmServerDecomposition(
                  review.id,
                  goalRecords[review.goalId].dri.id,
                ),
              )
            }
            onGoal={(id) => {
              setSelectedDecompositionGoalId(null);
              openGoal(id);
            }}
            onUpdate={(updated) =>
              commitWorkspace(() => updateServerDecomposition(updated))
            }
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
            onUpdate={(updated) =>
              commitWorkspace(() => updateServerRelation(updated))
            }
            relation={selectedRelation}
          />
        ) : null}
      </div>
    </main>
  );
}

function WorkspaceHeader({
  goalRecords,
  onDocument,
  onMap,
  onRefresh,
  onToggleActions,
  selection,
  showActions,
  workspaceError,
  workspaceSyncing,
}: {
  goalRecords: Record<string, Goal>;
  onDocument: () => void;
  onMap: () => void;
  onRefresh: () => void;
  onToggleActions: () => void;
  selection: Selection | null;
  showActions: boolean;
  workspaceError: string | null;
  workspaceSyncing: boolean;
}) {
  const selectedLabel = selection
    ? selection.type === "goal"
      ? goalRecords[selection.id]?.title
      : `Action ${selection.id}`
    : null;

  return (
    <header className="border-b border-slate-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-950 text-cyan-300">
            <Network className="h-4 w-4" />
          </span>
          <span className="truncate text-sm font-semibold text-slate-950">
            {selectedLabel ?? "工作图谱"}
          </span>
        </div>

        <div className="flex items-center gap-2">
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
              {showActions ? "隐藏 Action" : "显示 Action"}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function WorkMap({
  actions,
  decompositionReviews,
  goalRecords,
  onAction,
  onDecomposition,
  onGoal,
  onRelation,
  relations,
  showActions,
}: {
  actions: Action[];
  decompositionReviews: DecompositionReview[];
  goalRecords: Record<string, Goal>;
  onAction: (id: string) => void;
  onDecomposition: (goalId: string) => void;
  onGoal: (id: string) => void;
  onRelation: (id: string) => void;
  relations: Relation[];
  showActions: boolean;
}) {
  const visibleRelations = relations.filter(
    (relation) =>
      showActions ||
      (goalRecords[relation.sourceId] && goalRecords[relation.targetId]),
  );
  const dynamicActionIds = actions
    .filter((action) => !actionPositions[action.id])
    .map((action) => action.id);
  const dynamicActionCount = dynamicActionIds.length;
  const canvasHeight = showActions
    ? 1040 + Math.ceil(dynamicActionCount / 5) * 140
    : 760;
  const submissionReview = decompositionReviews.find(
    (review) => review.goalId === "G4",
  );
  const mapViewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let frame = 0;
    const centerRootGoal = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const viewport = mapViewportRef.current;
        if (!viewport || viewport.scrollWidth <= viewport.clientWidth) return;
        viewport.scrollLeft = Math.max(
          0,
          goalPositions.G0.x +
            goalPositions.G0.width / 2 -
            viewport.clientWidth / 2,
        );
      });
    };
    centerRootGoal();
    const observer = new ResizeObserver(() => {
      centerRootGoal();
    });
    if (mapViewportRef.current) observer.observe(mapViewportRef.current);
    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(frame);
    };
  }, [showActions]);

  return (
    <section className="flex h-full min-h-0 flex-col">
      <header className="flex min-h-11 items-center justify-end border-b border-slate-200 bg-white px-5 py-2">
        <MapLegend showActions={showActions} />
      </header>

      <div
        className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4"
        ref={mapViewportRef}
      >
        <div
          className="relative mx-auto w-[1200px] overflow-hidden rounded-md border border-slate-300 bg-white"
          style={{ height: canvasHeight }}
        >
          <div className="absolute inset-x-0 top-0 h-[224px] border-b border-slate-200 bg-white" />
          <div className="absolute inset-x-0 top-[224px] h-[282px] border-b border-slate-200 bg-slate-50/80" />
          <div className="absolute inset-x-0 top-[506px] h-[252px] border-b border-slate-200 bg-white" />
          {showActions ? (
            <div className="absolute inset-x-0 top-[758px] h-[282px] bg-slate-50/80" />
          ) : null}

          <svg
            aria-hidden="true"
            className="absolute inset-0 h-full w-full"
            viewBox={`0 0 1200 ${canvasHeight}`}
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
                  d={relationPath(relation)}
                  fill="none"
                  key={relation.id}
                  markerEnd={marker}
                  strokeWidth={dependency ? 2 : 1.5}
                />
              );
            })}
          </svg>

          <MapLane label="L0" y={38} />
          <MapLane label="L1" y={246} />
          <MapLane label="L2" y={528} />
          {showActions ? (
            <MapLane label="ACTION" y={782} />
          ) : null}

          <button
            className="absolute left-1/2 top-[210px] z-30 flex -translate-x-1/2 items-center gap-2 rounded-md border border-cyan-300 bg-white px-3 py-2 text-[10px] font-semibold text-cyan-900 shadow-sm hover:border-cyan-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
            onClick={() => onDecomposition("G0")}
            type="button"
          >
            <GitBranch className="h-3.5 w-3.5" />
            WISESTEP
          </button>

          <button
            className="absolute left-[475px] top-[526px] z-30 flex items-center gap-2 rounded-md border border-cyan-300 bg-white px-3 py-2 text-[10px] font-semibold text-cyan-900 shadow-sm hover:border-cyan-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
            onClick={() => onDecomposition("G2")}
            type="button"
          >
            <GitBranch className="h-3.5 w-3.5" />
            WISESTEP
          </button>

          <button
            className="absolute left-[935px] top-[526px] z-30 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-[10px] font-semibold text-amber-950 shadow-sm hover:border-amber-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
            onClick={() => onDecomposition("G4")}
            type="button"
          >
            {submissionReview?.status === "confirmed" ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <Bot className="h-3.5 w-3.5" />
            )}
            {submissionReview?.status === "confirmed"
              ? "WISESTEP"
              : "WISESTEP · 待确认"}
          </button>

          {Object.values(goalRecords).map((goal) => (
            <GoalMapNode
              goal={goal}
              goalRecords={goalRecords}
              key={goal.id}
              onClick={() => onGoal(goal.id)}
              position={goalPositions[goal.id]}
            />
          ))}

          {showActions
            ? actions.map((action) => {
                const dynamicIndex = dynamicActionIds.indexOf(action.id);
                return (
                <ActionMapNode
                  action={action}
                  key={action.id}
                  onClick={() => onAction(action.id)}
                  position={
                    actionPositions[action.id] ?? {
                      x: 40 + (dynamicIndex % 5) * 230,
                      y: 1000 + Math.floor(dynamicIndex / 5) * 140,
                      width: 200,
                      height: 112,
                    }
                  }
                />
                );
              })
            : null}

          {visibleRelations.map((relation) => {
            const position = relationLabels[relation.id];
            if (!position) return null;
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
    </section>
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
  goal,
  goalRecords,
  onClick,
  position,
}: {
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
        root
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
      relation.sourceId === goal.id || relation.targetId === goal.id,
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
            <span className="rounded border border-cyan-300 bg-cyan-50 px-2 py-1 text-[9px] font-semibold text-cyan-800">
              拆解方案
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

        <section className="mt-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            拆解逻辑
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {review.logic}
          </p>
        </section>

        <section className="mt-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            为什么这组拆解是完整的
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-700">
            {review.completeness}
          </p>
        </section>

        <section className="mt-6">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            {review.status === "proposed" ? "提议的新 Goal" : "当前包含的 Goal"}
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {review.status === "proposed"
              ? review.proposedGoals.map((proposal) => (
                  <div
                    className="rounded-md border border-amber-300 bg-amber-50/60 p-3"
                    key={proposal.proposedId}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[9px] font-bold text-amber-800">
                        {proposal.proposedId} · PROPOSED
                      </span>
                      <Bot className="h-3.5 w-3.5 text-amber-700" />
                    </div>
                    <span className="mt-1 block text-xs font-semibold text-slate-900">
                      {proposal.title}
                    </span>
                    <span className="mt-2 block text-[10px] leading-4 text-slate-600">
                      DRI · {actorLabel(proposal.dri)}
                    </span>
                    <span className="mt-0.5 block text-[10px] leading-4 text-slate-600">
                      Deadline ·{" "}
                      {formatDate(
                        proposal.timebox.dueAt,
                        proposal.timebox.timezone,
                      )}
                    </span>
                  </div>
                ))
              : review.childGoalIds.map((goalId) => (
                  <button
                    className="rounded-md border border-slate-200 bg-white p-3 text-left hover:border-cyan-500"
                    key={goalId}
                    onClick={() => onGoal(goalId)}
                    type="button"
                  >
                    <span className="font-mono text-[9px] font-bold text-cyan-700">
                      {goalId}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs font-semibold text-slate-800">
                      {goalRecords[goalId].title}
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
