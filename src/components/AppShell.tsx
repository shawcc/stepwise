import { NavLink, Outlet } from "react-router-dom";
import { Network } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/", label: "工作图谱", icon: Network },
];

export function AppShell() {
  return (
    <div className="min-h-screen overflow-hidden bg-slate-100 text-slate-900">
      <main className="grid h-screen grid-cols-1 gap-px bg-slate-200 md:grid-cols-[168px_minmax(0,1fr)]">
        <aside className="bg-white md:flex md:min-h-0 md:flex-col">
          <div className="border-b border-slate-200 px-4 py-3 max-md:hidden">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-700">WorkGraph</p>
            <h1 className="mt-1 truncate text-base font-semibold text-slate-950">Agent 原生工作系统</h1>
            <p className="mt-1 text-xs text-slate-500">工作事实源 · 权限内图谱</p>
          </div>

          <nav className="border-b border-slate-200 p-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  className={({ isActive }) =>
                    cn(
                      "flex items-center justify-center gap-2 rounded-md px-2.5 py-2 text-xs transition md:justify-start md:text-sm",
                      isActive ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950",
                    )
                  }
                  key={item.path}
                  to={item.path}
                >
                  <Icon className="h-4 w-4" />
                  <span className="max-sm:hidden">{item.label}</span>
                </NavLink>
              );
            })}
          </nav>

        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden bg-slate-50">
          <div className="min-h-0 flex-1 overflow-y-auto p-4 text-slate-950">
            <Outlet />
          </div>
        </section>

      </main>
    </div>
  );
}
