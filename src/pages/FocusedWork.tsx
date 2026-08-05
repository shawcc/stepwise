import { Bell, Eye, Pin } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

const focusedItems = [
  { title: "真实材料转候选图谱", type: "已关注", reason: "当前 MVP 的入口链路", update: "6 条明确表达已确认，1 条系统推断待审" },
  { title: "Agent 风险分级治理", type: "收藏", reason: "决定人类是否成为审批瓶颈", update: "已定义自动推进、Agent 互审、人类决策三档" },
  { title: "证据冲突触发 Review", type: "已关注", reason: "验证图谱是否能真实影响下游", update: "待补充前提失效后的影响传播演示" },
];

export default function FocusedWork() {
  return (
    <div>
      <PageHeader
        description="这里聚合我收藏、关注或被系统判断为重要的工作，不需要从整张图谱里反复查找。"
        eyebrow="Tab 02 / Focused Work"
        title="我关注的工作"
      />

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {focusedItems.map((item) => (
          <article className="grid gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 lg:grid-cols-[180px_1fr_1.2fr]" key={item.title}>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700">
                {item.type === "收藏" ? <Pin className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {item.type}
              </span>
              <Bell className="h-4 w-4 text-slate-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-950">{item.title}</h2>
              <p className="mt-1 text-xs text-slate-500">{item.reason}</p>
            </div>
            <div className="rounded-md border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs font-medium text-cyan-900">{item.update}</div>
          </article>
        ))}
      </section>
    </div>
  );
}
