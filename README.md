/opt/homebrew/Library/Homebrew/cmd/shellenv.sh: line 18: /bin/ps: Operation not permitted
git: error: couldn't create cache file '/var/folders/zz/zyxvpxvq6csfxvn_n00001yr0000gp/T/xcrun_db-woc8OPpo' (errno=Operation not permitted)
git: error: couldn't create cache file '/var/folders/zz/zyxvpxvq6csfxvn_n00001yr0000gp/T/xcrun_db-dowvH7BF' (errno=Operation not permitted)
# JevGate — Agent Action Firewall

一个面向 AI Agent 工具调用的实时审批网关。Agent 每次准备读文件、发送消息、退款或删除数据前，JevGate 用 Jev 做一次快速、类型安全的判断，再由确定性策略路由到 **ALLOW / ASK / BLOCK**。项目还内置 Jev vs DeepSeek A/B 面板，直接展示两种 API 的原始结构化输出、耗时、Token 与价格差。

> 这是公开作品集项目，所有案例均为合成数据。没有 API Key 时可完整运行 Demo Mode；配置 TypeSafe API Key 后自动切换为真实 Jev 调用。

## 30 秒理解

通用 LLM 擅长规划和生成，但把每个细小动作都交给生成式模型复核，会产生额外延时、输出成本和 JSON 解析风险。JevGate 把“是否允许执行”拆成四个原子判断，并在一次请求中并行完成：

- `Choice`：动作属于只读、可逆写入、外部副作用还是破坏性操作？
- `Score`：当前动作的风险位于 0–3 的哪个区间？
- `Noul`：用户是否明确授权了这个具体动作？
- `Noul`：谨慎的操作者是否应该先确认？

Jev 只返回类型化值和概率，不生成解释文本。最终动作始终由策略代码决定。

## 为什么这个 Demo 能突出 Jev

### 快

四个问题共享同一份状态、一次并行返回。界面直接展示端到端耗时，适合放在高频 Agent loop 中。

### 省

只传与动作判断有关的紧凑状态，不要求模型生成分析过程或审批文案。界面展示输入规模和“自由文本输出 = 0”。

### 没有结构性幻觉

这里的准确说法不是“模型永远不会判断错”，而是：**Jev 不生成自由文本，因此消除了 JSON 解析失败、字段名漂移和编造额外动作等结构性幻觉。** 语义判断仍可能出错，所以系统保留概率阈值、确定性规则和人工确认。

## A/B 对照如何运行

同一份动作状态会并行发送到两条路径：

| 对照项 | Jev | 普通生成式 LLM |
| --- | --- | --- |
| API | TypeSafe `POST /v1/systemone` | OpenAI-compatible `POST /v1/chat/completions` |
| 模型 | `jev-latest` | `DeepSeek-V4-Pro-0813` |
| 输出 | 原生 Choice / Score / Noul、概率分布与置信度 | Prompt 约束的 JSON 文本，再解析和 Schema 校验 |
| 计费 | 输入 $0.042 / 1M Token，输出免费 | 输入、输出 Token 分别计费 |
| 展示 | 原始响应、规范化信号、端到端耗时、Token、单次估算价格 | 同左 |

只有两边都配置真实 Key 时，页面才标记 `LIVE × LIVE`。一边缺 Key 会明确显示 `MIXED · 非公平实测`，两边都缺 Key 则显示 `DEMO × DEMO`。

## 三个演示案例

| Agent 动作 | 关键信号 | 预期路由 |
| --- | --- | --- |
| 读取工作区架构文档 | 只读、用户明确要求、本地范围 | `ALLOW` |
| 向客户退款 699 元 | 外部资金副作用、未明确授权 | `ASK` |
| 删除生产客户数据与备份 | 破坏性、越出用户目标、未授权 | `BLOCK` |

拖动右侧阈值后重新判断，可以直观看到业务方如何在自动化率与风险之间做取舍。

## 架构

```text
User goal + session context + proposed tool call
                         │
                         ▼
                 Jev typed questions
           Choice · Score · Noul · Noul
                         │
                         ▼
           typed values + probability signals
                         │
                         ▼
              deterministic policy gate
                 ┌───────┼───────┐
                 ▼       ▼       ▼
               ALLOW    ASK    BLOCK
                         │
                         ▼
               human feedback / eval set
```

关键实现：

- `app/api/decide/route.ts`：Jev 问题、服务端调用、失败关闭和路由策略
- `app/page.tsx`：交互式审批工作台、阈值实验与人工反馈
- `.env.example`：真实 Jev 调用的服务端配置

## 本地运行

要求 Node.js 22.13+。

```bash
npm install
cp .env.example .env.local
npm run dev
```

不填写 Key 即进入稳定的 Demo Mode。真实调用请配置：

```dotenv
TYPESAFE_API_KEY=your_server_side_key
JEV_MODEL=jev-latest
BASELINE_API_KEY=your_openai_compatible_key
BASELINE_BASE_URL=https://lightingtheword.com
BASELINE_MODEL=DeepSeek-V4-Pro-0813
```

访问 `http://localhost:5173`。

## 安全与工程边界

1. API Key 只存在服务端，不发送到浏览器。
2. 破坏性且未授权的动作由代码直接阻止。
3. 资金、消息、账户变更等副作用默认要求确认。
4. API 超时、缺字段或异常响应时 fail closed，不静默放行。
5. Jev 负责判断，不拥有工具执行权限。
6. Demo Mode 的数据明确标识，避免把预置结果伪装成线上测量。
7. 价格使用真实 Token 用量计算；DeepSeek 采用官方峰值牌价估算，代理站实际扣费可能不同。

## 面试讲法

> 我的设计不是用 Jev 替换负责规划的强 LLM，而是在 Agent 和工具之间增加一个 System One 决策层。强 LLM 负责“想做什么”，Jev 用一次类型化调用快速判断动作类别、风险、授权和确认需求，普通代码再做 ALLOW、ASK、BLOCK 路由。这样高频动作不必每次触发长文本生成，也没有 JSON 格式漂移。对于破坏性和低置信动作，系统仍然交给人，而不是把概率误当事实。

可以继续深挖四个点：

- 为什么问题要拆成四个原子判断，而不是问“这个动作安全吗”？
- 为什么阈值属于业务策略，不应该写在 Prompt 里？
- “无自由文本幻觉”和“语义判断永远正确”有什么区别？
- 如何用人工确认/覆盖样本做阈值校准和回放评测？

## 下一步

- 接入真实 Agent hooks，在工具执行前调用 JevGate
- 增加 JSONL Trace 回放与 coverage-risk 曲线
- 记录 P50/P95 延时、每千次决策成本、误放率与打扰率
- 增加 prompt injection / tool-result injection 的独立判断

## 技术栈

Next.js / React / TypeScript / Tailwind CSS / TypeSafe Jev API / Cloudflare Workers compatible runtime

## 价格与接口来源

- [TypeSafe Jev models & pricing](https://docs.typesafe.ai/models)：Jev 1.13 输入 $0.042 / 1M Token，输出 Token 免费。
- [TypeSafe API reference](https://docs.typesafe.ai/api)：`POST /v1/systemone` 请求与类型化响应格式。
- [DeepSeek models & pricing](https://api-docs.deepseek.com/quick_start/pricing)：DeepSeek V4 Pro 官方 Token 价格；第三方代理的实际计费可能不同。

## License

MIT
