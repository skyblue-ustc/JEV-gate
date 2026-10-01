# 🛡️ JevGate

### Typed approval firewall for AI agent tool calls

[![Live Demo](https://img.shields.io/badge/Live_Demo-Open_JevGate-10b981?style=for-the-badge&logo=vercel&logoColor=white)](https://jev-guard-studio.citrus-grove-3996.chatgpt.site)

[![JEV](https://img.shields.io/badge/Engine-TypeSafe_JEV-34d399?style=flat-square)](https://typesafe.ai/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=flat-square&logo=nextdotjs)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)

JevGate sits between an AI agent and its tools. Before a tool call executes, it asks JEV four bounded questions and routes the action to `ALLOW`, `ASK`, or `BLOCK` with deterministic policy code.

**[在线演示](https://jev-guard-studio.citrus-grove-3996.chatgpt.site)** · [工作原理](#工作原理) · [本地运行](#本地运行)

## 它解决什么问题

Agent 能生成工具调用，但“能调用”不等于“应该执行”。退款、发消息、改权限或删数据都需要一个快速、便宜、可审计的审批层。

JevGate 把判断拆成四个固定输出：

| 信号 | 类型 | 用途 |
| --- | --- | --- |
| `action_class` | Choice | 只读、可逆写入、外部副作用或破坏性操作 |
| `risk_level` | Score | `0–3` 风险等级 |
| `user_authorized` | Noul | 用户是否明确授权，返回 `P(yes)` |
| `needs_human` | Noul | 是否需要人工确认，返回 `P(yes)` |

JEV 只在调用方定义的答案空间内返回类型、概率和置信度，不生成解释文本。因此应用不需要从自然语言中提取 JSON，也不会收到模型臆造的字段；语义判断仍可能出错，所以最终执行权始终属于策略代码。

## 工作原理

```text
Agent proposes a tool call
           │
           ▼
Known facts + minimal session context
           │
           ├──► TypeSafe JEV /v1/systemone
           │       └─ choice + score + probabilities
           │
           └──► DeepSeek /v1/chat/completions
                   └─ generated JSON + schema validation
           │
           ▼
Deterministic policy
           │
     ALLOW · ASK · BLOCK
```

模型只提供信号，不直接执行工具。代码会优先使用工具元数据和明确授权，例如：

- 只读 + 明确授权 + 低风险 → `ALLOW`
- 外部副作用或授权不清 → `ASK`
- 未授权的破坏性操作 → `BLOCK`

## JEV vs DeepSeek

页面会把同一个状态并行发送给两种 API，并直接展示双方的原始响应：

| | JEV | 生成式 LLM |
| --- | --- | --- |
| 输出 | 原生 `choice / score / noul` | 自由文本中的 JSON |
| 合法答案 | 请求前已限定 | 生成后再校验 |
| 自由文本 | 无 | 有 |
| 计价 | 输入 token；输出免费 | 输入 + 输出 token |
| 应用接入 | 直接读取字段 | 清理、解析并校验 |

一次真实危险操作测试返回：

```json
{
  "model": "jev-1.13.0",
  "answers": {
    "actionClass": { "type": "choice", "choice": "destructive", "confidence": 1 },
    "risk": { "type": "score", "score": 3, "confidence": 1 },
    "authorized": { "type": "noul", "noul": 0.02 },
    "needsHuman": { "type": "noul", "noul": 0.98 }
  },
  "usage": { "input_tokens": 502, "output_tokens": 106 }
}
```

该请求端到端约 `0.74s`。延时会随网络和服务状态变化，页面每次都显示本次真实测量值。

费用采用代码内公开口径估算：JEV `$0.042 / 1M` 输入 token、输出免费；DeepSeek 基线 `$1.32 / 1M` 输入和 `$3.96 / 1M` 输出。代理渠道的实际账单可能不同。

## 本地运行

要求：Node.js 22.13+。

```bash
git clone https://github.com/skyblue-ustc/JEV-gate.git
cd JEV-gate
npm install
cp .env.example .env.local
```

配置服务端环境变量：

```dotenv
JEV_API_KEY=your_typesafe_api_key
JEV_BASE_URL=https://api.typesafe.ai
JEV_MODEL=jev-latest

BASELINE_API_KEY=your_openai_compatible_key
BASELINE_BASE_URL=https://your-provider.example
BASELINE_MODEL=your-model
```

然后启动：

```bash
npm run dev
```

打开终端输出的本地地址。API 密钥只由服务端路由读取，不会发送到浏览器，也不要提交 `.env.local`。

## 项目结构

```text
app/
├── page.tsx              # 审批工作台与原始响应对比
├── api/decide/route.ts   # JEV、DeepSeek 与确定性策略
└── globals.css           # 主题与响应式样式
components/ui/            # 交互组件
.env.example              # 环境变量模板
```

## 设计原则

- **Bounded**：模型只能回答预先定义的选项。
- **Fail closed**：API 或 Schema 失败时不执行动作。
- **Policy owns execution**：概率是输入，代码才做最终路由。
- **Minimal context**：只发送判断需要的状态和事实。
- **Auditable**：保留模型版本、原始输出、耗时、Token 与策略命中。

## Roadmap

- [x] TypeSafe JEV `/v1/systemone` 真实接入
- [x] JEV / DeepSeek 原始输出、延时与费用对比
- [x] `ALLOW / ASK / BLOCK` 确定性策略
- [x] 可调人工确认与自动阻止阈值
- [ ] 批量回放与离线校准
- [ ] 审批日志持久化与导出

## License

[MIT](LICENSE)
