<div align="center">

# 🛡️ JevGate

### Open, local System One decisions for AI agent actions

在 Agent 调用工具前，用本地 Laya 快速判断：**ALLOW / ASK / BLOCK**

[![Live Demo](https://img.shields.io/badge/Live_Demo-Open_JevGate-10b981?style=for-the-badge&logo=vercel&logoColor=white)](https://jev-guard-studio.citrus-grove-3996.chatgpt.site)
[![Laya](https://img.shields.io/badge/Engine-Laya_Local-34d399?style=flat-square)](https://github.com/NandhaKishorM/laya)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=nextdotjs)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-f5c542?style=flat-square)](LICENSE)

[在线演示](https://jev-guard-studio.citrus-grove-3996.chatgpt.site) · [工作原理](#-工作原理) · [本地运行](#-本地运行)

</div>

---

## 💡 这是什么？

Agent 很擅长规划任务，但它准备执行的动作不一定都应该立即放行：

- 读取工作区文档，可以直接执行吗？
- 给客户退款，需要用户再次确认吗？
- 删除生产数据，是否已经越权？

JevGate 是 Agent 与工具之间的决策防火墙。项目使用开源的 [Laya](https://github.com/NandhaKishorM/laya) 在本地完成类型化判断，再由确定性策略路由到 `ALLOW`、`ASK` 或 `BLOCK`。

```text
Agent proposes a tool call
            │
            ▼
  Local Laya typed decisions
  Choice · Score · Noul · Noul
            │
            ▼
    Deterministic policy
      ┌─────┼─────┐
      ▼     ▼     ▼
    ALLOW  ASK  BLOCK
```

Laya 没有工具执行权限。最终动作始终由应用代码决定。

## 🎮 三个演示案例

| Agent 动作 | 关键风险 | 预期结果 |
| --- | --- | :---: |
| 📄 读取工作区文档 | 只读、范围明确 | `ALLOW` |
| 💳 向客户退款 ¥699 | 资金副作用、授权不清 | `ASK` |
| 🗑️ 删除生产数据与备份 | 破坏性、超出用户目标 | `BLOCK` |

页面可以调整风险阈值，观察自动化率与安全边界如何变化。

## ⚡ 为什么使用 Laya？

Laya 是 Apache 2.0 开源的非自回归 System One 决策模型，支持 `choice`、`score` 和 `noul`，并提供与 `/v1/systemone` 兼容的本地 HTTP 服务。

| | Laya | 普通生成式 LLM |
| --- | --- | --- |
| 部署 | 本地、自托管 | 通常调用外部 API |
| 输出 | 类型化值与概率 | 生成 JSON 文本后解析 |
| 多个判断 | 同一请求内完成 | 通常生成完整回答 |
| API 费用 | `$0` | 输入、输出 Token 计费 |
| 数据边界 | 状态留在本地 | 状态发送给提供商 |
| 常见失败 | 语义判断可能错误 | 语义错误、格式漂移、解析失败 |

> [!IMPORTANT]
> 不生成自由文本可以避免 JSON 字段漂移、额外动作和解析失败等结构性问题，但不代表模型永远判断正确。项目仍保留概率阈值、确定性规则与人工确认。

## 📊 Laya vs DeepSeek

同一份动作状态会并行进入两条路径：

```text
                         ┌─ Local Laya /v1/systemone
Same action state ───────┤  → typed probabilities
                         │
                         └─ DeepSeek /v1/chat/completions
                            → generated JSON → parse → validate
```

页面直接展示：

- 两边的原始响应
- 规范化后的决策字段
- 端到端耗时
- 输入 / 输出 Token
- API 费用差异

| 状态 | 含义 |
| --- | --- |
| `LIVE × LIVE` | Laya 和 DeepSeek 都是真实调用 |
| `MIXED` | 一边真实、一边 Demo，不用于公平结论 |
| `DEMO × DEMO` | 可重复的演示数据 |

## 🏗️ 工作原理

一次 Laya 请求并行回答四个原子问题：

1. **Choice** — 动作属于只读、可逆写入、外部副作用还是破坏性操作？
2. **Score** — 当前动作风险位于 0–3 的哪个区间？
3. **Noul** — 用户是否明确授权了这个具体动作？
4. **Noul** — 谨慎的操作者是否应该先确认？

模型只返回信号，策略代码负责组合信号并执行安全边界。

## 🚀 本地运行

要求：Node.js 22.13+、Python 3.10+。首次启动 Laya 会从 Hugging Face 下载模型。

### 1. 启动 Laya

```bash
python3 -m venv .venv-laya
source .venv-laya/bin/activate
pip install -r requirements-laya.txt
LAYA_HOST=127.0.0.1 LAYA_PORT=8000 LAYA_MODELS=typed-decisions LAYA_MAX_LOADED=1 laya-serve
```

本项目默认使用针对类型化工作流优化的 `typed-decisions` checkpoint，并将工具注册表中的执行属性作为已知事实传入。服务启动后提供：

```text
POST http://127.0.0.1:8000/v1/systemone
```

### 2. 启动 JevGate

```bash
git clone https://github.com/skyblue-ustc/JEV-gate.git
cd JEV-gate
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`：

```dotenv
LAYA_BASE_URL=http://127.0.0.1:8000
LAYA_MODEL=typed-decisions

# Optional DeepSeek baseline
BASELINE_API_KEY=your_api_key
BASELINE_BASE_URL=https://your-provider.example.com
BASELINE_MODEL=DeepSeek-V4-Pro-0813
```

打开 `http://localhost:5173`。如果没有配置 Laya 地址，页面会明确显示 Demo Mode。

## 🔒 安全边界

- Laya 默认运行在本机，输入状态无需离开设备
- API 失败、超时或 Schema 校验失败时不会静默放行动作
- 破坏性且未授权的动作直接阻止
- 资金、消息和账户变更默认要求确认
- 模型负责判断，普通代码负责策略，执行器负责动作
- Demo 数据始终带有明确标记
- 本地推理的 `$0` 指无按次 API 费，不包含硬件与电力成本

## 📁 项目结构

```text
app/
├── page.tsx              # 审批工作台与 A/B 面板
└── api/decide/route.ts   # Laya、DeepSeek 调用与策略门控

requirements-laya.txt     # 本地 Laya 推理依赖
.env.example              # 服务端环境变量模板
README.md                 # 项目说明与设计文档
```

## 📚 参考资料

- [Laya GitHub](https://github.com/NandhaKishorM/laya)
- [Laya 模型卡](https://huggingface.co/convaiinnovations/laya)
- [TypeSafe System One Adapter](https://github.com/typesafe-ai/system-one-adapter-python)
- [DeepSeek Models & Pricing](https://api-docs.deepseek.com/quick_start/pricing)

## 🗺️ Roadmap

- [x] Agent 动作审批工作台
- [x] 本地 Laya `/v1/systemone` 接入
- [x] Laya / DeepSeek 原始输出对比
- [x] 延时、Token 与 API 费用对比
- [x] Demo / Mixed / Live 状态标记
- [ ] JSONL Trace 回放与批量评测
- [ ] Coverage–Risk 阈值曲线
- [ ] Prompt injection 独立检测

---

<div align="center">

Open · local · typed · auditable

**[Try the live demo →](https://jev-guard-studio.citrus-grove-3996.chatgpt.site)**

</div>
