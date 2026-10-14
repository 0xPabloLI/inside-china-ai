---
name: open-code-review
description: |
  代码审查工具，通过 ocr CLI 调用 open-code-review（阿里开源）。
  触发场景：用户要求代码审查、review PR、review commit、审查代码质量、找 bug；
  或实施流程的审查循环里改动落在安全边界（认证/RLS/发布路径/命令构造）时。
  两种模式：B（Delegation，日常小 PR，不调 LLM）和 A（本地 Ollama，核心/安全 PR）。
metadata:
  version: "1.13.0"
  source: https://github.com/alibaba/open-code-review
---

# open-code-review Skill

> OCR v1.13.0 已全局安装（npm i -g @alibaba-group/open-code-review），Ollama provider 已配。

## 何时跑（Agent 主动步骤）

OCR **不在 push 路径上**——#406 裁决不恢复 pre-push 门禁（push 路径上 18 分钟阻塞收益不明，且必然带静默跳过）。原 `.git/hooks/pre-push` 里的 OCR 段已逐字归档在 #406 的裁决评论（那份文件已删除，归档是它唯一的留存）。OCR 是审查循环里 Agent 主动发起的一步，触发条件：

- **A 模式**：改动落在安全边界——认证 / 管理员 gating / RLS / 发布路径 / shell 或命令构造——在 `code-review` 两轴审查之前跑一次。成本实测：典型 PR ~18 分钟（含模型加载），故不用于日常小改动。
- **B 模式**：日常 PR 想补一层行级定位时用，不调 LLM，成本近乎为零。
- **不跑**：纯文档、纯测试、依赖 bump。

跑 A 模式前确认 Ollama 在跑（`ollama ps` 为空是正常的——模型按需加载，空闲 5 分钟自动卸载，常驻仅约 13MB）；跑完**不需要**特意停 Ollama，它是 VLM/tools 后端共用的服务。

## 模式选择

| 场景 | 模式 | 命令 |
|---|---|---|
| 日常小 PR（<50 行） | **B** Delegation | `ocr delegate preview` + 我审查 |
| 核心/安全 PR | **A** 本地 LLM | `ocr review`（需 Ollama 运行） |
| 全量审计 | 缩范围到 `src/` | `ocr scan --path src/`（排除 scripts/） |

**不用 `ocr scan` 全量**——实测 6h45m 未完成，431 超时。

## B 模式（Delegation，推荐日常用）

不调任何 LLM，OCR 只做文件选择 + 规则解析，我做审查。

```bash
ocr delegate preview                    # 看选哪些文件、套哪些规则
ocr delegate rule src/foo.ts src/bar.ts # 拿规则文本，我据此审查
ocr rules check src/foo.tsx             # 看单个文件适用哪条规则
```

完成后我根据 OCR 的规则文本做审查，输出行级评论。

## A 模式（本地 LLM，核心 PR 用）

需先启动 Ollama：

```bash
ollama serve > /tmp/ollama.log 2>&1 &   # 启动
ocr review                              # 审查工作树改动
ocr review --from main --to feature     # 审查 PR（merge-base）
ocr review --commit abc123              # 审查单个 commit
ocr review --format json --output result.json  # JSON 输出给我解析
```

**耗时参考**（ornith:1.5-9b on M2 Pro）：10 行 3m55s（含模型加载），13.9K tokens。
典型 PR（~300 行）≈ 18 分钟。跑完不停 Ollama（见「何时跑」）。

**本机负载敏感（2026-10-14 实测）**：默认 `--concurrency 8` 把 8 个请求排到同一个 Ollama 实例上，每个请求的 300s 预算耗在排队 → 逐条 `timeout`、整体报 `all N file review(s) failed`。多文件 PR 用 `--concurrency 1` 配 `OCR_LLM_TIMEOUT=600`；机器本身负载高（12 核 load ~14，另有他人在跑重活）时仍会超时，那时按「A 模式未完成」记档，不要当成审查通过。零 finding 的运行也可能报 `status: failed`——OCR 1.13.0 把「无发现」的 `code_comment {"comments":[]}` 判成工具错误；判读看 `coverage.completed` 与 `tool_calls.failure_details`，别只看 status。

## 配置（已完成）

```
provider: ollama (custom)
url: http://localhost:11434/v1
protocol: openai
api_key: ollama-dummy（Ollama 不需要认证但 OCR 强制要求）
model: ornith:1.5-9b
```

换模型：不建议——ornith:1.5-9b（Q8_0）已是本地最佳纯文本+tools 模型

## 规则覆盖度

内置规则覆盖 React/TS：Hooks、useEffect、memo、XSS、innerHTML、eval、any、strict equality。
缺：SQL injection、Supabase RLS（靠 security_audit 工具补）。

## 完成标准

- B 模式：OCR 输出文件列表 + 规则，我逐文件审查并输出行级评论
- A 模式：`ocr review` 返回 JSON，解析 comments 数组，每条有 file/line/severity/message