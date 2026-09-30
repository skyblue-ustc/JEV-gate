<div align="center">

# 🛡️ JevGate

### Fast, typed approval for AI agent actions

在 Agent 调用工具前，用 Jev 快速判断：**ALLOW / ASK / BLOCK**

[![Live Demo](https://img.shields.io/badge/Live_Demo-Open_JevGate-10b981?style=for-the-badge&logo=vercel&logoColor=white)](https://jev-guard-studio.citrus-grove-3996.chatgpt.site)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=nextdotjs)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Jev](https://img.shields.io/badge/Jev-System_One-34d399?style=flat-square)](https://docs.typesafe.ai/)
[![DeepSeek](https://img.shields.io/badge/Baseline-DeepSeek_V4-7c3aed?style=flat-square)](https://api-docs.deepseek.com/)
[![License](https://img.shields.io/badge/License-MIT-f5c542?style=flat-square)](LICENSE)

[在线演示](https://jev-guard-studio.citrus-grove-3996.chatgpt.site) · [快速开始](#-快速开始) · [面试讲法](#-60-秒面试讲法)

</div>

---

## 💡 这是什么？

Agent 很擅长规划任务，但它准备执行的动作不一定都应该被立即放行：

- 读取工作区文件，可以直接执行吗？
- 给客户退款，需要用户再次确认吗？
- 删除生产数据，是否已经越权？

**JevGate 是 Agent 与工具之间的决策防火墙。**

```text
Agent proposes a tool call
            │
            ▼
      Jev typed decisions
  Choice · Score · Noul · Noul
            │
            ▼
    Deterministic policy
      ┌─────┼─────┐
      ▼     ▼     ▼
    ALLOW  ASK  BLOCK
```

Jev 只提供类型化判断和概率，最终动作由应用代码决定。

## 🎮 三个演示案例

| Agent 动作 | 关键风险 | 预期结果 |
| --- | --- | :---: |
| 📄 读取工作区文档 | 只读、范围明确 | `ALLOW` |
| 💳 向客户退款 ¥699 | 资金副作用、授权不清 | `ASK` |
| 🗑️ 删除生产数据与备份 | 破坏性、超出用户目标 | `BLOCK` |

在演示页面中可以调整风险阈值，观察自动化率与安全边界如何变化。

## ⚡ 为什么用 Jev？

Jev 是面向软件决策的 System One 模型。它接收状态和类型化问题，直接返回代码可以消费的结果。

| | Jev | 普通生成式 LLM |
| --- | --- | --- |
| 输出 | 原生 `Choice / Score / Noul` | 生成 JSON 文本后再解析 |
| 多个判断 | 同一请求内并行完成 | 通常需要生成完整回答 |
| 置信信号 | 概率分布与 confidence | 需要额外设计或估计 |
| 输出费用 | 免费 | 按输出 Token 计费 |
| 常见失败 | 语义判断可能错误 | 语义错误 + 格式漂移 + 解析失败 |

> [!IMPORTANT]
> “没有幻觉”在这里准确指：Jev 不生成自由文本，因此避免 JSON 字段漂移、额外动作和解析失败等**结构性幻觉**。它的语义判断仍可能出错，所以必须保留阈值、规则和人工确认。

## 📊 Jev vs DeepSeek A/B

项目会把同一个动作状态并行发送到两条路径：

```text
                         ┌─ Jev /v1/systemone
Same action state ───────┤  → typed probabilities
                         │
                         └─ DeepSeek /v1/chat/completions
                            → generated JSON → parse → validate
```

页面直接展示：

- 两边的原始 API 响应
- 规范化后的决策字段
- 端到端耗时
- 输入 / 输出 Token
- 单次估算价格与倍率差

运行状态不会混淆：

| 标记 | 含义 |
| --- | --- |
| `LIVE × LIVE` | 两边都是真实 API 调用 |
| `MIXED` | 一边真实、一边 Demo，不用于公平结论 |
| `DEMO × DEMO` | 可重复的本地演示数据 |

## 🏗️ 核心设计

一次 Jev 请求并行回答四个原子问题：

1. **Choice** — 动作属于只读、可逆写入、外部副作用还是破坏性操作？
2. **Score** — 当前动作的风险位于 0–3 的哪个区间？
3. **Noul** — 用户是否明确授权了这个具体动作？
4. **Noul** — 谨慎的操作者是否应该先确认？

策略代码再将这些信号组合成最终路由。模型没有工具执行权限。

## 🚀 快速开始

要求 Node.js 22.13+。

```bash
git clone https://github.com/skyblue-ustc/JEV-gate.git
cd JEV-gate
npm install
cp .env.example .env.local
npm run dev
```

打开 `http://localhost:5173`。不配置 Key 时自动进入 Demo Mode。

### 配置真实 API

```dotenv
# TypeSafe Jev
TYPESAFE_API_KEY=your_typesafe_key
JEV_MODEL=jev-latest

# OpenAI-compatible DeepSeek baseline
BASELINE_API_KEY=your_api_key
BASELINE_BASE_URL=https://your-provider.example.com
BASELINE_MODEL=DeepSeek-V4-Pro-0813
```

所有 Key 只在服务端使用，不会进入浏览器代码或 Git 历史。

## 🔒 安全边界

- API 失败、超时或 Schema 校验失败时，动作不会被静默放行
- 破坏性且未授权的动作直接阻止
- 资金、消息和账户变更默认要求确认
- Jev 负责判断，普通代码负责策略，执行器负责动作
- Demo 数据始终带有明确标记
- 第三方代理的实际价格可能与官方牌价不同

## 🎤 60 秒面试讲法

> JevGate 是我为 AI Agent 做的动作审批层。强 LLM 负责规划“下一步做什么”，但每次工具调用前，我会把用户目标、工具参数和会话状态发送给 Jev。Jev 在一次请求里并行判断动作类型、风险、授权和人工确认需求，然后由确定性代码路由到 ALLOW、ASK 或 BLOCK。
>
> 我还做了 Jev 与 DeepSeek 的 A/B 面板，同屏展示原始输出、耗时、Token 和价格。它说明 Jev 的价值不是替代所有大模型，而是在高频、边界清楚的判断点上，减少自由文本生成、格式解析和输出成本。对于低置信或高影响动作，系统仍然交给人。

面试官可以继续追问：

- 为什么拆成四个原子问题，而不是直接问“安全吗”？
- 为什么阈值写在代码里，而不是 Prompt 里？
- 怎样用人工确认和覆盖样本做离线评测？
- “没有结构性幻觉”和“模型永远正确”有什么区别？

## 📁 项目结构

```text
app/
├── page.tsx              # 审批工作台与 A/B 面板
└── api/decide/route.ts   # Jev、DeepSeek 调用与策略门控

.env.example              # 服务端环境变量模板
README.md                 # 项目说明与面试叙事
```

## 📚 参考资料

- [TypeSafe Jev：模型与价格](https://docs.typesafe.ai/models)
- [TypeSafe：API Reference](https://docs.typesafe.ai/api)
- [TypeSafe：Parallel Questions](https://docs.typesafe.ai/cookbooks/parallel_questions)
- [DeepSeek：Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)

## 🗺️ Roadmap

- [x] Agent 动作审批工作台
- [x] Jev / DeepSeek 原始输出对比
- [x] 延时、Token 与价格对比
- [x] Demo / Mixed / Live 状态标记
- [ ] JSONL Trace 回放与批量评测
- [ ] Coverage–Risk 阈值曲线
- [ ] Prompt injection 独立检测

---

<div align="center">

Built for safe, fast and auditable agent execution.

**[Try the live demo →](https://jev-guard-studio.citrus-grove-3996.chatgpt.site)**

</div>
