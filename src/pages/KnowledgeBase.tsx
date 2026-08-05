import { BookOpen, LockKeyhole, Search } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";

const knowledgeItems = [
  { title: "工信部揭榜挂帅通知", scope: "公开", type: "原始材料", summary: "候选 Goal、Policy、Action 和 Inference 的来源材料。" },
  { title: "候选图谱 v0.2", scope: "团队可见", type: "图谱快照", summary: "包含已确认对象、系统推断、驳回记录和风险治理建议。" },
  { title: "受限申报材料", scope: "无权限", type: "Evidence", summary: "当前账号不可见，仅展示权限边界，不生成内容摘要。" },
];

export default function KnowledgeBase() {
  return (
    <div>
      <PageHeader
        description="知识库展示与当前工作相关的材料、证据和背景，但所有内容都受到权限控制。"
        eyebrow="Tab 04 / Permissioned Knowledge"
        title="知识库"
      />

      <div className="mb-3 flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
        <Search className="h-4 w-4 text-slate-400" />
        <span className="text-sm text-slate-500">搜索权限内的材料、证据、图谱快照和复盘记录</span>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {knowledgeItems.map((item) => {
          const locked = item.scope === "无权限";
          return (
            <article
              className={`grid gap-3 border-b px-4 py-3 last:border-b-0 lg:grid-cols-[180px_1fr_1.3fr] ${
                locked ? "border-dashed border-slate-300 bg-slate-100" : "border-slate-100"
              }`}
              key={item.title}
            >
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700">
                  {locked ? <LockKeyhole className="h-3.5 w-3.5" /> : <BookOpen className="h-3.5 w-3.5" />}
                  {item.scope}
                </span>
                <span className="text-[11px] text-slate-500">{item.type}</span>
              </div>
              <h2 className="text-sm font-semibold text-slate-950">{item.title}</h2>
              <p className="text-xs leading-5 text-slate-600">{item.summary}</p>
            </article>
          );
        })}
      </section>
    </div>
  );
}
