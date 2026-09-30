git: error: couldn't create cache file '/var/folders/zz/zyxvpxvq6csfxvn_n00001yr0000gp/T/xcrun_db-YSHRHFvM' (errno=Operation not permitted)
git: error: couldn't create cache file '/var/folders/zz/zyxvpxvq6csfxvn_n00001yr0000gp/T/xcrun_db-kA6nV16t' (errno=Operation not permitted)
"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Ban, Check, CheckCircle2, ChevronRight, Code2, Database, Gauge, GitBranch, LoaderCircle, LockKeyhole, MessageSquareText, RotateCcw, ShieldCheck, Sparkles, UserCheck, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

type ActionCase = {
  id: string; agent: string; task: string; tool: string; args: Record<string, unknown>; proposedAt: string;
  sessionContext: string[]; reversible: boolean; externalEffect: boolean;
  demo: { actionClass: string; classConfidence: number; probabilities: Record<string, number>; riskScore: number; riskConfidence: number; authorized: number; needsHuman: number; elapsedMs: number; inputTokens: number };
};

type Decision = {
  verdict: "ALLOW" | "ASK" | "BLOCK"; reason: string; policyHits: string[]; source: "jev" | "demo";
  model: string; elapsedMs: number; inputTokens: number; outputTokens: number;
  answers: { actionClass: { choice: string; confidence: number; probabilities: Record<string, number> }; risk: { score: number; confidence: number }; authorized: number; needsHuman: number };
  benchmark: {
    mode: "live" | "mixed" | "demo";
    jev: EngineResult;
    baseline: EngineResult;
    speedup: number;
    costSaving: number;
    latencyDeltaMs: number;
    costDeltaUsd: number;
    pricing: { jev: string; baseline: string; note: string };
  };
};

type EngineResult = {
  source: "live" | "demo"; model: string; elapsedMs: number;
  usage: { inputTokens: number; outputTokens: number }; costUsd: number;
  raw: unknown; normalized: { actionClass: string; riskScore: number; authorized: number; needsHuman: number };
  schemaValid: boolean;
};

const actions: ActionCase[] = [
  {
    id: "ACT-0318", agent: "Research Agent", proposedAt: "10:42", tool: "read_workspace_file", task: "总结项目的架构与依赖",
    args: { path: "src/architecture.md", max_lines: 240 }, reversible: true, externalEffect: false,
    sessionContext: ["用户明确要求总结当前项目", "目标文件位于工作区内", "工具只读且不访问网络"],
    demo: { actionClass: "read_only", classConfidence: 0.99, probabilities: { read_only: 0.99, reversible_write: 0.01, external_side_effect: 0, destructive: 0, other: 0 }, riskScore: 0.08, riskConfidence: 0.98, authorized: 0.99, needsHuman: 0.02, elapsedMs: 74, inputTokens: 286 },
  },
  {
    id: "ACT-0319", agent: "Support Agent", proposedAt: "10:44", tool: "issue_refund", task: "处理客户重复扣款投诉",
    args: { order_id: "ORD-88421", amount_cny: 699, reason: "duplicate_charge" }, reversible: false, externalEffect: true,
    sessionContext: ["用户要求调查重复扣款", "订单存在两笔相同金额交易", "用户未明确授权立即退款"],
    demo: { actionClass: "external_side_effect", classConfidence: 0.97, probabilities: { external_side_effect: 0.96, reversible_write: 0.03, destructive: 0.01, read_only: 0, other: 0 }, riskScore: 2.16, riskConfidence: 0.91, authorized: 0.42, needsHuman: 0.89, elapsedMs: 81, inputTokens: 318 },
  },
  {
    id: "ACT-0320", agent: "Ops Agent", proposedAt: "10:46", tool: "delete_customer_records", task: "清理测试环境的过期数据",
    args: { customer_id: "CUS-1093", include_backups: true }, reversible: false, externalEffect: true,
    sessionContext: ["用户只要求清理测试环境日志", "目标 customer_id 来自生产环境", "参数包含永久删除备份"],
    demo: { actionClass: "destructive", classConfidence: 0.99, probabilities: { destructive: 0.99, external_side_effect: 0.01, reversible_write: 0, read_only: 0, other: 0 }, riskScore: 2.97, riskConfidence: 0.99, authorized: 0.04, needsHuman: 0.98, elapsedMs: 77, inputTokens: 301 },
  },
];

const classLabels: Record<string, string> = { read_only: "只读操作", reversible_write: "可逆写入", external_side_effect: "外部副作用", destructive: "破坏性操作", other: "未知类型" };
const verdictMeta = {
  ALLOW: { label: "允许执行", icon: CheckCircle2, color: "emerald" },
  ASK: { label: "请求确认", icon: UserCheck, color: "amber" },
  BLOCK: { label: "阻止执行", icon: Ban, color: "rose" },
};

const pct = (value: number) => `${Math.round(value * 100)}%`;

export default function Home() {
  const [selectedId, setSelectedId] = useState(actions[0].id);
  const [askThreshold, setAskThreshold] = useState(1.5);
  const [blockThreshold, setBlockThreshold] = useState(2.5);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reviewed, setReviewed] = useState<"confirmed" | "overridden" | null>(null);
  const selected = useMemo(() => actions.find((item) => item.id === selectedId)!, [selectedId]);

  useEffect(() => {
    type ToolDefinition = {
      name: string; title: string; description: string; inputSchema: object;
      annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
      execute: (input: unknown) => unknown | Promise<unknown>;
    };
    type ModelContext = { registerTool: (tool: ToolDefinition, options?: { signal?: AbortSignal }) => void | Promise<void> };
    const context = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const findAction = (input: unknown) => {
      if (!input || typeof input !== "object" || !("action_id" in input) || typeof input.action_id !== "string") throw new Error("action_id must be a valid string");
      const target = actions.find((item) => item.id === input.action_id);
      if (!target) throw new Error("Unknown action_id");
      return target;
    };
    const register = async () => {
      await context.registerTool({
        name: "select_agent_action", title: "Select agent action",
        description: "Select one of the visible proposed agent actions in the JevGate review workspace.",
        inputSchema: { type: "object", properties: { action_id: { type: "string", enum: actions.map((item) => item.id) } }, required: ["action_id"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute(input) { const target = findAction(input); setSelectedId(target.id); setDecision(null); setReviewed(null); setError(""); return { selected_action_id: target.id, tool: target.tool }; },
      }, { signal: lifecycle.signal });
      await context.registerTool({
        name: "evaluate_agent_action", title: "Evaluate agent action",
        description: "Run the same JevGate decision used by the visible UI for a proposed action and return its ALLOW, ASK, or BLOCK route.",
        inputSchema: { type: "object", properties: { action_id: { type: "string", enum: actions.map((item) => item.id) } }, required: ["action_id"], additionalProperties: false },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        async execute(input) {
          const target = findAction(input); setSelectedId(target.id); setLoading(true); setError(""); setReviewed(null);
          try {
            const response = await fetch("/api/decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: target, thresholds: { ask: askThreshold, block: blockThreshold } }) });
            const payload = await response.json() as Decision & { error?: string };
            if (!response.ok) throw new Error(payload.error || "Decision service unavailable");
            setDecision(payload); return { action_id: target.id, verdict: payload.verdict, elapsed_ms: payload.elapsedMs, source: payload.source };
          } finally { setLoading(false); }
        },
      }, { signal: lifecycle.signal });
    };
    void register().catch((caught) => setError(caught instanceof Error ? caught.message : "WebMCP registration failed"));
    return () => lifecycle.abort();
  }, [askThreshold, blockThreshold]);

  async function runDecision() {
    setLoading(true); setError(""); setDecision(null); setReviewed(null);
    try {
      const response = await fetch("/api/decide", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: selected, thresholds: { ask: askThreshold, block: blockThreshold } }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "决策服务暂时不可用");
      setDecision(payload);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "决策服务暂时不可用"); }
    finally { setLoading(false); }
  }

  function chooseAction(id: string) { setSelectedId(id); setDecision(null); setReviewed(null); setError(""); }
  const verdict = decision ? verdictMeta[decision.verdict] : null;

  return (
    <main className="min-h-screen bg-[#07110f] text-[#ecf7f1]">
      <header className="border-b border-white/10 bg-[#081512]/90 px-5 py-4 backdrop-blur-xl lg:px-8">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl border border-emerald-300/25 bg-emerald-300/10 text-emerald-300"><ShieldCheck className="size-5" /></div>
            <div><div className="flex items-center gap-2"><h1 className="text-base font-semibold tracking-tight">JevGate</h1><span className="rounded-full border border-emerald-300/20 bg-emerald-300/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200">Agent Action Firewall</span></div><p className="text-xs text-white/45">每次工具调用前，做一次快速、类型安全的判断</p></div>
          </div>
          <div className="hidden items-center gap-5 text-sm text-white/55 sm:flex"><span className="flex items-center gap-2"><Zap className="size-4 text-emerald-300" />单请求并行判断</span><span className="h-5 w-px bg-white/10" /><span className="font-mono text-xs text-white/40">policy v1.0.0</span></div>
        </div>
      </header>

      <section className="mx-auto grid max-w-[1600px] gap-px bg-white/10 lg:grid-cols-[290px_minmax(0,1fr)_400px]">
        <aside className="min-h-[calc(100vh-73px)] bg-[#091713] p-4 lg:p-5">
          <div className="mb-4 flex items-center justify-between"><div><p className="text-sm font-medium">待判断动作</p><p className="mt-0.5 text-xs text-white/40">来自不同 Agent 的工具调用</p></div><span className="rounded-lg bg-white/5 px-2.5 py-1 font-mono text-xs text-white/60">3</span></div>
          <div className="space-y-2">
            {actions.map((item, index) => (
              <button key={item.id} onClick={() => chooseAction(item.id)} className={`w-full rounded-xl border p-3 text-left transition ${selectedId === item.id ? "border-emerald-300/35 bg-emerald-300/[0.09] shadow-[inset_3px_0_0_#6ee7b7]" : "border-white/[0.07] bg-white/[0.025] hover:border-white/15 hover:bg-white/[0.05]"}`}>
                <div className="flex items-center justify-between gap-2"><span className="font-mono text-[11px] text-white/38">{item.id}</span><span className="text-[11px] text-white/35">{item.proposedAt}</span></div>
                <p className="mt-2 text-sm font-medium text-white/90">{item.agent}</p><p className="mt-1 truncate font-mono text-xs text-white/45">{item.tool}()</p>
                <div className="mt-2.5 flex items-center justify-between"><span className={`rounded-md px-2 py-1 text-[11px] ${index === 0 ? "bg-emerald-300/10 text-emerald-200" : index === 1 ? "bg-amber-300/10 text-amber-200" : "bg-rose-400/10 text-rose-300"}`}>{index === 0 ? "只读" : index === 1 ? "资金操作" : "删除数据"}</span><ChevronRight className="size-4 text-white/25" /></div>
              </button>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-dashed border-white/10 p-3.5 text-xs leading-relaxed text-white/38"><div className="mb-1.5 flex items-center gap-2 text-white/60"><Gauge className="size-4" />Demo 重点</div>固定输出空间 · 并行问题 · 概率阈值 · 代码执行策略</div>
        </aside>

        <section className="min-w-0 bg-[#0b1a16] px-5 py-6 sm:px-7 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="flex flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-end sm:justify-between">
              <div><div className="mb-2 flex items-center gap-2 text-xs text-emerald-200/70"><span className="font-mono">{selected.id}</span><span>·</span><span>{selected.proposedAt} 提议</span></div><h2 className="text-2xl font-semibold tracking-tight">{selected.agent}</h2><p className="mt-1 text-sm text-white/45">{selected.task}</p></div>
              <div className="flex gap-2"><span className={`rounded-lg border px-3 py-2 text-xs ${selected.reversible ? "border-emerald-300/15 bg-emerald-300/[0.05] text-emerald-100" : "border-rose-300/15 bg-rose-300/[0.05] text-rose-100"}`}>{selected.reversible ? "可逆" : "不可逆"}</span><span className="rounded-lg border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-white/55">{selected.externalEffect ? "影响外部系统" : "本地操作"}</span></div>
            </div>

            <div className="mt-6 grid gap-5 xl:grid-cols-[1fr_250px]">
              <article className="rounded-2xl border border-white/10 bg-[#0d201b] p-5"><div className="mb-3 flex items-center gap-2 text-sm font-medium"><Code2 className="size-4 text-emerald-300" />拟执行工具</div><p className="font-mono text-[15px] text-emerald-100">{selected.tool}</p><pre className="mt-4 overflow-auto rounded-xl border border-white/[0.07] bg-black/20 p-4 text-xs leading-6 text-white/55">{JSON.stringify(selected.args, null, 2)}</pre></article>
              <article className="rounded-2xl border border-white/10 bg-[#0d201b] p-5"><div className="mb-4 flex items-center gap-2 text-sm font-medium"><LockKeyhole className="size-4 text-emerald-300" />执行边界</div><dl className="space-y-3 text-sm"><div className="flex justify-between"><dt className="text-white/42">可撤销</dt><dd className={selected.reversible ? "text-emerald-200" : "text-rose-300"}>{selected.reversible ? "是" : "否"}</dd></div><div className="flex justify-between"><dt className="text-white/42">外部副作用</dt><dd>{selected.externalEffect ? "有" : "无"}</dd></div><div className="flex justify-between"><dt className="text-white/42">策略版本</dt><dd className="font-mono text-xs">v1.0.0</dd></div></dl></article>
            </div>

            <div className="mt-5"><div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-medium">会话上下文</h3><span className="text-xs text-white/35">只发送判断所需状态</span></div><div className="space-y-2">{selected.sessionContext.map((item, index) => <div key={item} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5"><span className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] ${index === 2 && selected.id === "ACT-0320" ? "bg-rose-400/12 text-rose-300" : "bg-emerald-300/10 text-emerald-200"}`}>{index === 2 && selected.id === "ACT-0320" ? <AlertTriangle className="size-3" /> : <Check className="size-3" />}</span><p className="text-sm text-white/68">{item}</p></div>)}</div></div>

            <div className="mt-6 rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.035] p-5"><div className="flex items-center justify-between gap-4"><div><div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="size-4 text-emerald-300" />运行 Jev vs DeepSeek 对照</div><p className="mt-1 text-xs leading-5 text-white/42">向两种 API 发送同一动作状态，对比原始结构、端到端耗时、Token 与估算价格。</p></div><Button onClick={runDecision} disabled={loading} className="h-11 rounded-xl bg-emerald-300 px-5 text-[#062019] hover:bg-emerald-200">{loading ? <LoaderCircle className="size-4 animate-spin" /> : <GitBranch className="size-4" />}{loading ? "对比中" : "运行 A/B"}</Button></div>{error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}</div>
          </div>
        </section>

        <aside className="bg-[#091713] p-5 lg:min-h-[calc(100vh-73px)] lg:p-6">
          <div className="flex items-center justify-between"><div><p className="text-sm font-medium">Decision Gate</p><p className="mt-0.5 text-xs text-white/40">Jev 信号 × 策略代码</p></div>{decision && <span className={`rounded-full px-2.5 py-1 text-[11px] ${decision.source === "jev" ? "bg-emerald-300/10 text-emerald-200" : "bg-sky-300/10 text-sky-200"}`}>{decision.source === "jev" ? "LIVE JEV" : "DEMO MODE"}</span>}</div>
          {!decision ? <div className="mt-5 rounded-2xl border border-dashed border-white/12 bg-white/[0.02] px-5 py-10 text-center"><div className="mx-auto grid size-12 place-items-center rounded-2xl bg-white/5 text-white/30"><GitBranch className="size-6" /></div><p className="mt-4 text-sm font-medium text-white/65">等待判断</p><p className="mx-auto mt-2 max-w-[260px] text-xs leading-5 text-white/35">选择动作并运行 Jev，这里会显示类型化结果、概率与最终策略路由。</p></div> : verdict ? (
            <div className="mt-5">
              <div className={`decision-card ${verdict.color}`}><div className="flex items-start justify-between"><div className="grid size-11 place-items-center rounded-xl bg-white/10"><verdict.icon className="size-5" /></div><span className="font-mono text-[11px] opacity-60">{decision.elapsedMs} ms</span></div><p className="mt-5 text-xs uppercase tracking-[0.12em] opacity-55">Policy route</p><p className="mt-1 text-2xl font-semibold tracking-tight">{verdict.label}</p><p className="mt-3 text-sm leading-6 opacity-70">{decision.reason}</p></div>

              <div className="mt-4 grid grid-cols-3 gap-2"><Metric icon={Zap} label="Jev 延时" value={`${decision.elapsedMs}ms`} /><Metric icon={Database} label="Jev 输入" value={`${decision.inputTokens} tok`} /><Metric icon={MessageSquareText} label="自由文本" value="0" /></div>
              <div className="mt-4 space-y-2.5"><Signal label="动作类型" value={classLabels[decision.answers.actionClass.choice] || decision.answers.actionClass.choice} score={decision.answers.actionClass.confidence} /><Signal label="风险分" value={`${decision.answers.risk.score.toFixed(2)} / 3`} score={decision.answers.risk.confidence} /><Signal label="用户已授权" value={pct(decision.answers.authorized)} score={decision.answers.authorized} /><Signal label="需要确认" value={pct(decision.answers.needsHuman)} score={decision.answers.needsHuman} warn /></div>
              <div className="mt-5 rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><p className="text-xs font-medium text-white/55">策略命中</p><ul className="mt-3 space-y-2">{decision.policyHits.map((hit) => <li key={hit} className="flex gap-2 text-xs leading-5 text-white/50"><ArrowRight className="mt-0.5 size-3.5 shrink-0 text-emerald-300" />{hit}</li>)}</ul></div>
              <div className="mt-5"><p className="mb-2 text-xs text-white/40">人工反馈可用于离线校准</p>{reviewed ? <div className="flex items-center justify-between rounded-xl border border-emerald-300/15 bg-emerald-300/[0.06] p-3 text-sm text-emerald-100"><span className="flex items-center gap-2"><CheckCircle2 className="size-4" />{reviewed === "confirmed" ? "已确认判断" : "已记录人工覆盖"}</span><button onClick={() => setReviewed(null)} aria-label="撤销反馈"><RotateCcw className="size-4 opacity-55" /></button></div> : <div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => setReviewed("confirmed")} className="border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.07]">确认</Button><Button variant="outline" onClick={() => setReviewed("overridden")} className="border-white/10 bg-white/[0.03] text-white hover:bg-white/[0.07]">覆盖</Button></div>}</div>
            </div>
          ) : null}

          <div className="mt-7 border-t border-white/10 pt-5"><div className="mb-5 flex items-center justify-between"><p className="text-sm font-medium">请求确认阈值</p><span className="font-mono text-xs text-amber-200">{askThreshold.toFixed(2)}</span></div><Slider min={0.5} max={2.4} step={0.05} value={[askThreshold]} onValueChange={(value) => setAskThreshold(value[0])} aria-label="请求确认风险阈值" className="[&_[data-slot=slider-range]]:bg-amber-300 [&_[data-slot=slider-thumb]]:border-amber-300" /><div className="mb-5 mt-6 flex items-center justify-between"><p className="text-sm font-medium">自动阻止阈值</p><span className="font-mono text-xs text-rose-200">{blockThreshold.toFixed(2)}</span></div><Slider min={1.8} max={3} step={0.05} value={[blockThreshold]} onValueChange={(value) => setBlockThreshold(value[0])} aria-label="自动阻止风险阈值" className="[&_[data-slot=slider-range]]:bg-rose-300 [&_[data-slot=slider-thumb]]:border-rose-300" /></div>
        </aside>
      </section>
      {decision && <BenchmarkPanel benchmark={decision.benchmark} />}
      <footer className="border-t border-white/10 bg-[#07110f] px-6 py-4 text-xs text-white/32"><div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3"><span>Jev 不生成自由文本，因此没有 JSON 解析失败或编造字段；语义判断仍通过概率阈值与人工确认兜底。</span><span className="font-mono">typed · fast · bounded · auditable</span></div></footer>
    </main>
  );
}

function Metric({ icon: Icon, label, value }: { icon: typeof Zap; label: string; value: string }) { return <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3"><Icon className="size-3.5 text-emerald-300" /><p className="mt-2 font-mono text-sm text-white/80">{value}</p><p className="mt-0.5 text-[10px] text-white/32">{label}</p></div>; }
function Signal({ label, value, score, warn = false }: { label: string; value: string; score: number; warn?: boolean }) { const fill = Math.max(3, Math.round(score * 100)); return <div className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5"><div className="flex items-center justify-between gap-3 text-xs"><span className="text-white/38">{label}</span><span className="font-medium text-white/80">{value}</span></div><div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[0.07]"><div className={`h-full rounded-full ${warn && score > 0.7 ? "bg-amber-300" : "bg-emerald-300"}`} style={{ width: `${fill}%` }} /></div></div>; }

function BenchmarkPanel({ benchmark }: { benchmark: Decision["benchmark"] }) {
  const modeLabel = benchmark.mode === "live" ? "LIVE × LIVE" : benchmark.mode === "mixed" ? "MIXED · 非公平实测" : "DEMO × DEMO";
  return (
    <section className="border-t border-white/10 bg-[#081512] px-5 py-10 lg:px-8">
      <div className="mx-auto max-w-[1310px]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-300/70">API benchmark</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">同一输入，两种决策路径</h2><p className="mt-2 text-sm text-white/42">Jev 原生类型化概率 vs DeepSeek 生成 JSON 后再解析校验</p></div>
          <span className={`w-fit rounded-full px-3 py-1.5 text-xs ${benchmark.mode === "live" ? "bg-emerald-300/10 text-emerald-200" : benchmark.mode === "mixed" ? "bg-amber-300/10 text-amber-200" : "bg-sky-300/10 text-sky-200"}`}>{modeLabel}</span>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CompareMetric label="端到端耗时" left={`${benchmark.jev.elapsedMs} ms`} right={`${benchmark.baseline.elapsedMs} ms`} summary={`Jev ${benchmark.speedup}× faster`} />
          <CompareMetric label="单次估算价格" left={usd(benchmark.jev.costUsd)} right={usd(benchmark.baseline.costUsd)} summary={`Jev ${benchmark.costSaving}× cheaper`} />
          <CompareMetric label="Token 用量" left={`${benchmark.jev.usage.inputTokens} in / ${benchmark.jev.usage.outputTokens} out`} right={`${benchmark.baseline.usage.inputTokens} in / ${benchmark.baseline.usage.outputTokens} out`} summary="Jev 输出不按 Token 计费" />
          <CompareMetric label="输出约束" left="类型 + 概率分布" right="生成 JSON + Schema 校验" summary="两边都做代码门控" />
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <RawCard title="Jev · 原始 API 响应" engine={benchmark.jev} accent="emerald" />
          <RawCard title="DeepSeek · 原始 API 响应" engine={benchmark.baseline} accent="violet" />
        </div>

        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 py-3 text-xs leading-5 text-white/38">
          <span className="text-white/60">计价口径：</span>Jev {benchmark.pricing.jev}；DeepSeek {benchmark.pricing.baseline}。{benchmark.pricing.note}
        </div>
      </div>
    </section>
  );
}

function CompareMetric({ label, left, right, summary }: { label: string; left: string; right: string; summary: string }) {
  return <div className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><p className="text-xs text-white/38">{label}</p><div className="mt-3 grid grid-cols-2 gap-3"><div><span className="text-[10px] text-emerald-300/60">JEV</span><p className="mt-1 font-mono text-sm text-emerald-100">{left}</p></div><div><span className="text-[10px] text-violet-300/60">DEEPSEEK</span><p className="mt-1 font-mono text-sm text-violet-100">{right}</p></div></div><p className="mt-3 border-t border-white/[0.06] pt-3 text-xs text-white/48">{summary}</p></div>;
}

function RawCard({ title, engine, accent }: { title: string; engine: EngineResult; accent: "emerald" | "violet" }) {
  const tone = accent === "emerald" ? "text-emerald-200 bg-emerald-300/10" : "text-violet-200 bg-violet-300/10";
  return <article className="min-w-0 overflow-hidden rounded-2xl border border-white/[0.09] bg-[#07110f]"><div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3"><div><p className="text-sm font-medium">{title}</p><p className="mt-0.5 font-mono text-[11px] text-white/32">{engine.model}</p></div><span className={`rounded-full px-2.5 py-1 text-[10px] ${tone}`}>{engine.source.toUpperCase()}</span></div><pre className="max-h-[390px] overflow-auto p-4 text-xs leading-5 text-white/58">{JSON.stringify(engine.raw, null, 2)}</pre></article>;
}

function usd(value: number) { return value < 0.0001 ? `$${value.toFixed(7)}` : `$${value.toFixed(6)}`; }
