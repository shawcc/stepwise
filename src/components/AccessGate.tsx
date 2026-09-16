import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, LoaderCircle, LockKeyhole, Network } from "lucide-react";

type AccessState = "checking" | "authorized" | "required" | "unconfigured";

type AccessResponse = {
  authenticated?: boolean;
  configured?: boolean;
  error?: string;
};

async function readAccessResponse(response: Response): Promise<AccessResponse> {
  return (await response.json().catch(() => ({}))) as AccessResponse;
}

export function AccessGate({ children }: { children: ReactNode }) {
  const development = import.meta.env.DEV;
  const [state, setState] = useState<AccessState>(
    development ? "authorized" : "checking",
  );
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (development) return;
    let active = true;
    void fetch("/api/access", {
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
      .then(async (response) => {
        const result = await readAccessResponse(response);
        if (!active) return;
        setState(
          result.authenticated
            ? "authorized"
            : result.configured
              ? "required"
              : "unconfigured",
        );
      })
      .catch(() => {
        if (active) {
          setError("访问状态检查失败，请稍后重试。");
          setState("required");
        }
      });
    return () => {
      active = false;
    };
  }, [development]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const result = await readAccessResponse(response);
      if (!response.ok || !result.authenticated) {
        throw new Error(result.error ?? "访问授权失败。");
      }
      setCode("");
      setState("authorized");
    } catch (submitError) {
      setError(
        submitError instanceof Error ? submitError.message : "访问授权失败。",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (state === "authorized") return children;

  return (
    <main className="grid min-h-screen place-items-center bg-slate-100 px-4 py-10 text-slate-950">
      <section className="w-full max-w-sm rounded-lg border border-slate-300 bg-white shadow-xl">
        <header className="border-b border-slate-200 px-6 py-5">
          <span className="grid h-10 w-10 place-items-center rounded-md bg-slate-950 text-cyan-300">
            {state === "checking" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Network className="h-4 w-4" />
            )}
          </span>
          <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-700">
            Stepwise
          </p>
          <h1 className="mt-1 text-xl font-semibold">私人工作区</h1>
        </header>

        <div className="px-6 py-6">
          {state === "checking" ? (
            <p className="text-sm text-slate-500">正在检查访问权限…</p>
          ) : state === "unconfigured" ? (
            <div className="flex gap-3">
              <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p className="text-sm leading-6 text-slate-600">
                生产环境尚未配置私人访问码。
              </p>
            </div>
          ) : (
            <form onSubmit={submit}>
              <label>
                <span className="text-[10px] font-semibold text-slate-500">
                  访问码
                </span>
                <input
                  autoComplete="current-password"
                  autoFocus
                  className="mt-1.5 h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-cyan-600 focus:ring-2 focus:ring-cyan-100"
                  onChange={(event) => setCode(event.target.value)}
                  required
                  type="password"
                  value={code}
                />
              </label>
              {error ? (
                <p
                  aria-live="polite"
                  className="mt-3 text-xs font-medium text-rose-700"
                >
                  {error}
                </p>
              ) : null}
              <button
                className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
                disabled={submitting || !code.trim()}
                type="submit"
              >
                {submitting ? (
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowRight className="h-4 w-4" />
                )}
                进入
              </button>
            </form>
          )}
        </div>
      </section>
    </main>
  );
}
