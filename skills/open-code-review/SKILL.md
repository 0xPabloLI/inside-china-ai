---
name: open-code-review
description: |
  代码审查工具，通过 ocr CLI 调用 open-code-review（阿里开源）。
  触发场景：用户要求代码审查、review PR、review commit、审查代码质量、找 bug。
  两种模式：B（Delegation，日常小 PR，不调 LLM）和 A（本地 Ollama，核心/安全 PR）。
metadata:
  version: "1.12.6"
  source: https://github.com/alibaba/open-code-review
---

# open-code-review Skill

> OCR v1.12.6 已全局安装（npm i -g @alibaba-group/open-code-review），Ollama provider 已配。

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

**耗时参考**（ornith:9b on M2 Pro）：10 行 3m55s（含模型加载），13.9K tokens。
典型 PR（~300 行）≈ 18 分钟。用完关 Ollama：`pkill -f "ollama serve"`。

## 配置（已完成）

```
provider: ollama (custom)
url: http://localhost:11434/v1
protocol: openai
api_key: ollama-dummy（Ollama 不需要认证但 OCR 强制要求）
model: ornith:9b
```

换模型：`ocr config set model qwen3.8:27b-mlx`（SWE-Bench Pro 61.7，更强但 18GB 慢，需 `ollama pull`）

## 规则覆盖度

内置规则覆盖 React/TS：Hooks、useEffect、memo、XSS、innerHTML、eval、any、strict equality。
缺：SQL injection、Supabase RLS（靠 security_audit 工具补）。

## 完成标准

- B 模式：OCR 输出文件列表 + 规则，我逐文件审查并输出行级评论
- A 模式：`ocr review` 返回 JSON，解析 comments 数组，每条有 file/line/severity/message