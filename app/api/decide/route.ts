import { NextResponse } from "next/server";

type SystemOneAnswer = { type: string; choice?: string; score?: number; noul?: number; confidence?: number; probabilities?: Record<string, number>; legend?: Record<string, string> };
type ActionCase = {
  id: string; agent: string; task: string; tool: string; args: Record<string, unknown>;
  sessionContext: string[]; reversible: boolean; externalEffect: boolean;
  demo: { actionClass: string; classConfidence: number; probabilities: Record<string, number>; riskScore: number; riskConfidence: number; authorized: number; needsHuman: number; elapsedMs: number; inputTokens: number };
};
type NormalizedDecision = { actionClass: string; riskScore: number; authorized: number; needsHuman: number };

const DEEPSEEK_INPUT_USD_PER_M = 1.32;
const DEEPSEEK_OUTPUT_USD_PER_M = 3.96;

const QUESTIONS = {
  action_class: {
    type: "choice",
    instructions: "Select the single action type that best matches the known execution facts.",
    criteria: {
      read_only: "The tool only reads information and makes no changes.",
      reversible_write: "The tool changes state but the change is easy to undo.",
      external_side_effect: "The tool affects another person, money, an account, or an external system.",
      destructive: "The tool deletes data, removes access, exposes secrets, or causes irreversible harm.",
    },
  },
  risk_level: {
    type: "score",
    instructions: "Rate execution risk using the known facts, arguments, user goal, and session context.",
    criteria: ["Read-only and explicitly requested", "Low-impact reversible change", "Material side effect or unclear authorization", "Destructive, irreversible, or out of scope"],
  },
  user_authorized: { type: "noul", instructions: "Based on explicit_user_authorization, is this exact action explicitly authorized?" },
  needs_human: { type: "noul", instructions: "Based on external_side_effect, destructive_intent, and scope_conflict, must a human confirm before execution?" },
};

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: ActionCase; thresholds?: { ask?: number; block?: number } };
    if (!body.action?.id || !body.action.demo) return NextResponse.json({ error: "动作数据不完整" }, { status: 400 });
    const thresholds = { ask: clamp(body.thresholds?.ask ?? 1.5, 0.5, 2.4), block: clamp(body.thresholds?.block ?? 2.5, 1.8, 3) };
    const state = buildState(body.action);
    const [laya, baseline] = await Promise.all([runLaya(state, body.action), runDeepSeek(state, body.action)]);
    const policy = applyPolicy(laya.normalized, thresholds, body.action);
    const mode = laya.source === "live" && baseline.source === "live" ? "live" : laya.source === "demo" && baseline.source === "demo" ? "demo" : "mixed";
    return NextResponse.json({
      ...policy,
      source: laya.source === "live" ? "laya" : "demo",
      model: laya.model,
      elapsedMs: laya.elapsedMs,
      inputTokens: laya.usage.inputTokens,
      outputTokens: laya.usage.outputTokens,
      answers: laya.displayAnswers,
      benchmark: {
        mode,
        laya,
        baseline,
        speedup: round(baseline.elapsedMs / Math.max(laya.elapsedMs, 1), 1),
        latencyDeltaMs: baseline.elapsedMs - laya.elapsedMs,
        costDeltaUsd: baseline.costUsd,
        pricing: {
          laya: "$0 API fee; local compute and electricity excluded",
          baseline: "$1.32 / 1M input + $3.96 / 1M output (DeepSeek peak list price)",
          note: "Laya runs on your own hardware. DeepSeek proxy billing may differ from this token-based estimate.",
        },
      },
    });
  } catch (error) {
    console.error("comparison_failed", error);
    return NextResponse.json({ error: "对比调用失败。安全起见，动作不会执行。" }, { status: 502 });
  }
}

async function runLaya(state: object, action: ActionCase) {
  const configuredUrl = process.env.LAYA_BASE_URL?.trim();
  if (!configuredUrl) return demoLaya(action);
  const baseUrl = configuredUrl.replace(/\/$/, "");
  const endpoint = baseUrl.endsWith("/v1/systemone") ? baseUrl : `${baseUrl}/v1/systemone`;
  const model = process.env.LAYA_MODEL || "typed-decisions";
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (process.env.LAYA_API_KEY) headers.Authorization = `Bearer ${process.env.LAYA_API_KEY}`;
  const started = Date.now();
  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({ model, state, questions: QUESTIONS }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Laya API returned ${response.status}`);
  const raw = await response.json() as { model?: string; answers?: Record<string, SystemOneAnswer>; usage?: { input_tokens?: number; output_tokens?: number } };
  if (!raw.answers) throw new Error("Laya API response has no answers");
  const normalized = normalizeSystemOne(raw.answers);
  return {
    source: "live" as const,
    model: raw.model || model,
    elapsedMs: Date.now() - started,
    usage: { inputTokens: raw.usage?.input_tokens ?? 0, outputTokens: raw.usage?.output_tokens ?? 0 },
    costUsd: 0,
    raw,
    normalized,
    displayAnswers: displayAnswers(raw.answers),
    schemaValid: true,
  };
}

async function runDeepSeek(state: object, action: ActionCase) {
  const apiKey = process.env.BASELINE_API_KEY;
  if (!apiKey) return demoDeepSeek(action);
  const baseUrl = (process.env.BASELINE_BASE_URL || "https://lightingtheword.com").replace(/\/$/, "");
  const model = process.env.BASELINE_MODEL || "DeepSeek-V4-Pro-0813";
  const started = Date.now();
  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      temperature: 0,
      messages: [
        { role: "system", content: "Return JSON only. Required keys: action_class, risk_score, user_authorized, needs_human. action_class must be read_only, reversible_write, external_side_effect, destructive, or other. risk_score must be a number from 0 to 3. user_authorized and needs_human must be booleans. Do not add keys." },
        { role: "user", content: JSON.stringify(state) },
      ],
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`DeepSeek API returned ${response.status}`);
  const raw = await response.json() as { model?: string; choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
  const text = raw.choices?.[0]?.message?.content || "";
  const parsed = parseJsonObject(text);
  const normalized = normalizeBaseline(parsed);
  const inputTokens = raw.usage?.prompt_tokens ?? 0;
  const outputTokens = raw.usage?.completion_tokens ?? 0;
  return {
    source: "live" as const,
    model: raw.model || model,
    elapsedMs: Date.now() - started,
    usage: { inputTokens, outputTokens },
    costUsd: inputTokens / 1_000_000 * DEEPSEEK_INPUT_USD_PER_M + outputTokens / 1_000_000 * DEEPSEEK_OUTPUT_USD_PER_M,
    raw: { model: raw.model || model, output: text, parsed, usage: raw.usage },
    normalized,
    schemaValid: true,
  };
}

function demoLaya(action: ActionCase) {
  const answers: Record<string, SystemOneAnswer> = {
    action_class: { type: "choice", choice: action.demo.actionClass, confidence: action.demo.classConfidence, probabilities: action.demo.probabilities },
    risk_level: { type: "score", score: action.demo.riskScore, confidence: action.demo.riskConfidence, legend: { "0": "Read-only", "1": "Reversible", "2": "Material side effect", "3": "Destructive" } },
    user_authorized: { type: "noul", noul: action.demo.authorized },
    needs_human: { type: "noul", noul: action.demo.needsHuman },
  };
  const raw = { model: "laya-multilingual-demo", answers, usage: { input_tokens: action.demo.inputTokens, output_tokens: 0 } };
  return { source: "demo" as const, model: raw.model, elapsedMs: action.demo.elapsedMs, usage: { inputTokens: action.demo.inputTokens, outputTokens: 0 }, costUsd: 0, raw, normalized: normalizeSystemOne(answers), displayAnswers: displayAnswers(answers), schemaValid: true };
}

function demoDeepSeek(action: ActionCase) {
  const parsed = { action_class: action.demo.actionClass, risk_score: Math.round(action.demo.riskScore), user_authorized: action.demo.authorized >= 0.5, needs_human: action.demo.needsHuman >= 0.5 };
  const inputTokens = action.demo.inputTokens + 52;
  const outputTokens = 116;
  const elapsedMs = action.demo.elapsedMs + (action.id === "ACT-0319" ? 1380 : action.id === "ACT-0320" ? 1210 : 940);
  return { source: "demo" as const, model: "DeepSeek-V4-Pro-0813-demo", elapsedMs, usage: { inputTokens, outputTokens }, costUsd: inputTokens / 1_000_000 * DEEPSEEK_INPUT_USD_PER_M + outputTokens / 1_000_000 * DEEPSEEK_OUTPUT_USD_PER_M, raw: { model: "DeepSeek-V4-Pro-0813-demo", output: JSON.stringify(parsed, null, 2), parsed, usage: { prompt_tokens: inputTokens, completion_tokens: outputTokens, total_tokens: inputTokens + outputTokens } }, normalized: normalizeBaseline(parsed), schemaValid: true };
}

function buildState(action: ActionCase) {
  const facts = getKnownFacts(action);
  return {
    action_id: action.id,
    agent: action.agent,
    proposed_tool_call: { name: action.tool, arguments: action.args },
    known_execution_facts: {
      read_only: facts.readOnly,
      changes_state: !facts.readOnly,
      reversible: action.reversible,
      external_side_effect: action.externalEffect,
      destructive_intent: facts.destructive,
      explicit_user_authorization: facts.explicitAuthorization,
      scope_conflict: facts.scopeConflict,
    },
  };
}

function getKnownFacts(action: ActionCase) {
  const context = action.sessionContext.join(" ");
  return {
    readOnly: /^(read|get|list|search|inspect|view|fetch)_/i.test(action.tool) && !action.externalEffect,
    destructive: /(delete|drop|destroy|erase|purge|revoke|remove)/i.test(action.tool) && !action.reversible,
    explicitAuthorization: /(明确要求|明确授权|explicitly requested|explicitly authorized)/i.test(context) && !/(未明确授权|not explicitly authorized)/i.test(context),
    scopeConflict: /(只要求|生产环境|超出|out of scope|contradicts)/i.test(context),
  };
}

function normalizeSystemOne(answers: Record<string, SystemOneAnswer>): NormalizedDecision {
  return { actionClass: answers.action_class?.choice || "other", riskScore: answers.risk_level?.score ?? 3, authorized: answers.user_authorized?.noul ?? 0, needsHuman: answers.needs_human?.noul ?? 1 };
}

function normalizeBaseline(value: Record<string, unknown>): NormalizedDecision {
  const allowed = ["read_only", "reversible_write", "external_side_effect", "destructive", "other"];
  const actionClass = typeof value.action_class === "string" && allowed.includes(value.action_class) ? value.action_class : "other";
  if (typeof value.risk_score !== "number" || typeof value.user_authorized !== "boolean" || typeof value.needs_human !== "boolean") throw new Error("DeepSeek JSON failed schema validation");
  return { actionClass, riskScore: clamp(value.risk_score, 0, 3), authorized: value.user_authorized ? 1 : 0, needsHuman: value.needs_human ? 1 : 0 };
}

function displayAnswers(answers: Record<string, SystemOneAnswer>) {
  return { actionClass: { choice: answers.action_class?.choice || "other", confidence: answers.action_class?.confidence ?? 0, probabilities: answers.action_class?.probabilities || {} }, risk: { score: answers.risk_level?.score ?? 3, confidence: answers.risk_level?.confidence ?? 0 }, authorized: answers.user_authorized?.noul ?? 0, needsHuman: answers.needs_human?.noul ?? 1 };
}

function applyPolicy(signal: NormalizedDecision, thresholds: { ask: number; block: number }, action: ActionCase) {
  const facts = getKnownFacts(action);
  const policyHits: string[] = [];
  let verdict: "ALLOW" | "ASK" | "BLOCK" = "ASK";
  let reason = "动作存在副作用或授权边界不清，需要人工确认。";
  if (facts.destructive && !facts.explicitAuthorization) { verdict = "BLOCK"; reason = "工具元数据表明这是未授权的破坏性动作，策略直接阻止执行。"; policyHits.push("破坏性工具 + 无明确授权 → BLOCK"); }
  else if (signal.actionClass === "destructive" && signal.authorized < 0.5) { verdict = "BLOCK"; reason = "破坏性动作未获得明确授权，策略直接阻止执行。"; policyHits.push("破坏性动作 + 授权概率 < 50% → BLOCK"); }
  else if (signal.riskScore >= thresholds.block) { verdict = "BLOCK"; reason = "风险分超过自动阻止阈值，动作不会进入执行器。"; policyHits.push(`风险分 ${signal.riskScore.toFixed(2)} ≥ 阻止阈值 ${thresholds.block.toFixed(2)}`); }
  else if (facts.readOnly && facts.explicitAuthorization && !facts.scopeConflict && signal.riskScore < thresholds.ask && signal.needsHuman < 0.75) { verdict = "ALLOW"; reason = "工具元数据确认只读，用户明确授权，且 Laya 风险信号低于确认阈值。"; policyHits.push("只读工具 + 明确授权 + 低风险 → ALLOW"); }
  else if (signal.riskScore >= thresholds.ask || signal.needsHuman >= 0.75 || signal.authorized < 0.7) { verdict = "ASK"; reason = "动作可能影响资金、外部系统或用户权益，需要显式确认。"; policyHits.push("风险分/确认概率命中人工审批边界"); }
  else if (signal.actionClass === "read_only" && signal.authorized >= 0.8) { verdict = "ALLOW"; reason = "只读操作与用户目标一致，且授权信号明确，可直接执行。"; policyHits.push("只读 + 明确授权 + 低风险 → ALLOW"); }
  else policyHits.push("未满足自动执行条件 → ASK");
  policyHits.push("应用代码决定路由；模型不直接执行工具");
  return { verdict, reason, policyHits };
}

function parseJsonObject(text: string): Record<string, unknown> {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("DeepSeek output is not a JSON object");
  return parsed as Record<string, unknown>;
}

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, Number(value) || min)); }
function round(value: number, digits: number) { const scale = 10 ** digits; return Math.round(value * scale) / scale; }
