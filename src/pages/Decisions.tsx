import { AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";

const decisions = [
  {
    title: "确定最终入围名单",
    level: "高影响 · 不可逆",
    owner: "评审负责人",
    source: "Action / 第三方测评结果",
    icon: CheckCircle2,
  },
  {
    title: "是否允许评审 Agent 读取受限申报材料",
    level: "越权授权",
    owner: "材料管理员",
    source: "Policy / 访问权限",
    icon: HelpCircle,
  },
  {
    title: "测评证据冲突，是否重新执行评审",
    level: "重大偏差",
    owner: "项目负责人",
    source: "Review / Evidence conflict",
    icon: AlertTriangle,
  },
];

export default function Decisions() {
  return (
    <div>
      <PageHeader
        description="这里只有高影响、不可逆、越权或涉及价值取舍的事项。低风险工作由 Agent 自动推进，中风险工作先由 Agent 互审。"
        eyebrow="Tab 03 / Decision Inbox"
        title="我的决策待办"
      />

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        {decisions.map((decision) => {
          const Icon = decision.icon;
          return (
            <article className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0" key={decision.title}>
              <div className="flex items-start gap-3">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-slate-100 text-slate-500">
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">{decision.source}</p>
                  <h2 className="mt-1 text-sm font-semibold text-slate-950">{decision.title}</h2>
                  <p className="mt-1 text-xs text-slate-500">负责人：{decision.owner} · 类型：{decision.level}</p>
                </div>
              </div>
              <Link className="rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800" to="/">
                打开来源卡片
              </Link>
            </article>
          );
        })}
      </section>
    </div>
  );
}
