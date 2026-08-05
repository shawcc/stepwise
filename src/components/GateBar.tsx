import { Bot, FileInput, GitBranch, ShieldCheck } from "lucide-react";

const steps = [
  { label: "材料已导入", icon: FileInput, active: true },
  { label: "候选图谱", icon: GitBranch, active: true },
  { label: "Agent 协作", icon: Bot, active: false },
  { label: "风险治理", icon: ShieldCheck, active: false },
];

export function GateBar() {
  return (
    <section className="border-b border-slate-200 bg-white px-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Current graph</p>
          <h2 className="text-sm font-semibold text-slate-800">材料结构化 · 候选确认阶段</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition ${
                  step.active ? "border-slate-300 bg-slate-100 text-slate-700" : "border-slate-200 bg-white text-slate-400"
                }`}
                key={step.label}
              >
                <Icon className="h-3.5 w-3.5" />
                {step.label}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
