# Deep Research: 安全扫描层去闭源 — mimosa 开源替代工具链

> Issue: #197 · 调查日期: 2026-09-05 · 方法: web-deep-research（Standard tier）
> 基线: issue 正文已实测的 mimosa 功能清单（audit / agent-check / llm-check / pii-check / git-secrets / supply-chain / license-check / CI 消费 / hooks）

## Executive Summary

mimosa 的每项在用功能在 2026 年都有活跃维护、许可证可接受的开源等价物，**无不可替代的缺口**。核心替代组合：**Semgrep CE**（SAST，LGPL-2.1 引擎，mimosa 自身深扫引擎就是 semgrep 1.136.0，规则行为天然对齐）+ **Cisco mcp-scanner**（Agent/MCP 配置扫描，Apache-2.0，YARA 分析器纯本地、零 API key）+ **osv-scanner**（依赖漏洞 + 许可证，Apache-2.0，Google 官方）+ **gitleaks**（秘密泄露，已在 pre-commit，与 mimosa git-secrets 完全重复）。

Bearer CLI（ELv2，源码可见非 OSI）是 PII/敏感数据流分析的最佳候选，许可证限制仅"不得作为托管服务转售"，内部仓库扫描无任何限制——按验收标准走"经用户豁免的 source-available"路径，**建议作为可选层引入而非必选**（本仓库为新闻内容管线，PII 敏感度低）。

两个明确放弃项：mimosa 的写入前拦截 hooks / session 基线 / finding ledger（上次评估已判 don't migrate，且在本仓库堆了 504MB 状态目录）；llm-check 的静态提示注入流分析只能部分覆盖（Semgrep registry 有 LLM 相关社区规则，但 mimosa 的专项检测深度无精确等价——对本仓库 `src/` 零发现的基线而言，该差距无实际影响）。

## Key Findings

### 1. SAST：Semgrep CE（推荐）vs Opengrep（备选）

两者引擎均 LGPL-2.1，官方 FAQ（docs.semgrep.dev，2026-09-03 更新）确认：同规则语法、同单文件扫描范围、按需/单 CI job 扫描免费。关键差异：

| 维度 | Semgrep CE | Opengrep |
|---|---|---|
| 引擎许可 | LGPL-2.1 | LGPL-2.1 |
| 规则 | 自带 Semgrep Registry 社区规则 | 不自带，BYO（兼容 Semgrep 规则语法） |
| 规则许可 | Semgrep Rules License v1.0（**非开源**，但允许内部使用） | 第三方规则保留各自许可 |
| 分发 | Python（brew/pip） | 自包含二进制 + Cosign 签名，无 Python 依赖 |
| taint 分析 | 单函数 | 跨函数（`--taint-intrafile`） |
| 维护 | v1.176.0，pushed 2026-09-04 | v1.29.0，pushed 2026-09-05，Aikido/Endor Labs 等联盟支持 |

**推荐 Semgrep CE**：规则即装即用、pre-commit 官方支持、与 mimosa 行为对齐（其引擎即 semgrep）。Semgrep Rules License 明确允许内部扫描使用；若未来需要"规则也全开源"的纯度，Opengrep 是现成退路（v1.29.0 有 `osx_arm64`/`osx_aarch64` 产物，M 系列原生）。两仓均无 archived、近 48h 内有提交（gh api 实测）。

### 2. Agent/MCP 配置扫描：Cisco mcp-scanner（推荐）vs Snyk Agent Scan（备选）

| 维度 | cisco-ai-defense/mcp-scanner | snyk/agent-scan |
|---|---|---|
| 许可 | Apache-2.0 | Apache-2.0（客户端开源） |
| 分析位置 | **YARA 分析器纯本地，零 API key**；LLM/API 分析器可选 | 本地检查 + Snyk 云 API（**必须 SNYK_TOKEN**） |
| 扫描目标 | MCP tools/prompts/resources/instructions、配置文件、静态离线模式 | MCP 配置 + agent skills（更广的自动发现） |
| 输出稳定性 | 稳定 | 官方明示 experimental、字段可能变 |
| 维护 | v0.x 活跃，pushed 2026-09-04 | v0.6+，pushed 2026-09-04 |
| 安装 | `uv tool install cisco-ai-mcp-scanner`（Python 3.11+） | `uvx snyk-agent-scan` 或 standalone binary |

**推荐 mcp-scanner**：`mcp-scanner --config-path .mcp.json --analyzers yara,prompt_defense` 纯本地运行。两个候选都覆盖 mimosa agent-check 实测发现的问题类别（npx 未固定版本的 supply-chain 风险）。

**共有的安全注意事项**（官方 README 明示）：扫描 MCP 配置会执行配置中定义的 stdio 服务器命令。对本仓库 `.mcp.json`（context7 等 `npx` 拉取的公开包）风险可接受，但 CI 化时需注意。

### 3. 依赖漏洞 + 许可证：osv-scanner

Apache-2.0（Google 官方），v2.5.1，pushed 2026-09-04，`osv-scanner_darwin_arm64` Go 单二进制。覆盖 mimosa 的 supply-chain-check（漏洞数据库为 OSV，Google/NVD 联合维护）与 license-check（`--licenses` 标志输出依赖许可证）。Trivy（Apache-2.0，v0.74.0，macOS-ARM64）功能更全（含 IaC/容器/secret）但重量级——本仓库只需 lockfile 扫描，osv-scanner 更贴合。

### 4. 秘密泄露：gitleaks（已有，无需动作)

mimosa git-secrets 与现有 `.githooks/pre-commit` 中的 gitleaks（MIT）完全重复（issue 实测结论一致）。mimosa 退役后此功能零回退。

### 5. PII / 敏感数据流：Bearer CLI（可选，source-available）

ELv2 实文核验（LICENSE.txt，2026-09-05 fetch）：限制仅两条——不得作为托管/托管服务提供给第三方、不得绕过 license key。**内部扫描、修改、分发修改版均允许**，源码完全可见可审计。v2.1.1，pushed 2026-09-03，`bearer_2.1.1_darwin_arm64` 官方产物。473 规则、7 语言、GDPR/CCPA 报告。

**建议**：可选层。本仓库内容管线 PII 敏感度低，mimosa pii-check 在 `src/` 也是零发现基线。引入与否不阻塞 mimosa 退役。

### 6. LLM 应用安全：部分覆盖，接受差异

mimosa llm-check 是静态提示注入→危险 sink 的流向分析。开源等价现状：

- Semgrep Registry 社区规则含 LLM 框架（langchain/openai SDK）注入与数据外流规则，可覆盖常见模式。
- 运行时探针工具（NVIDIA garak，Apache-2.0，pushed 2026-09-04；promptfoo，MIT，pushed 2026-09-05）是**不同类别**——红队测试框架而非静态扫描，需要配置模型端点，对本仓库的静态扫描需求过重。

**结论**：静态部分由 Semgrep CE 社区规则承接（部分覆盖）；专项深度接受放弃。本仓库 `src/` llm-check 零发现基线下无实际回退。

### 7. 明确放弃项

- **写入前拦截 hooks / session 基线 / finding ledger**：上次评估已判 don't migrate；504MB `.mimosa/hook-state/` 状态目录是负资产。退役时一并清理。
- **llm-check 专项深度**：见第 6 节。

## 功能覆盖对比表（验收标准第 1 项）

| mimosa 功能 | 开源替代 | 覆盖判定 | 备注 |
|---|---|---|---|
| `audit`（项目静态审计） | Semgrep CE | ✅ 可覆盖 | 引擎同源（semgrep），规则即装即用 |
| `agent-check`（Agent/MCP 配置） | Cisco mcp-scanner | ✅ 可覆盖 | YARA 本地分析，零 API key；agent-scan 备选（需 SNYK_TOKEN） |
| `llm-check`（LLM 应用安全） | Semgrep CE 社区规则 | ⚠️ 部分覆盖 | 静态常见模式可覆盖；专项深度放弃；本仓库零发现基线无回退 |
| `pii-check` | Bearer CLI（可选） | ✅ 可覆盖 / 可选 | ELv2 source-available，内部使用无限制 |
| `git-secrets` | gitleaks | ✅ 已覆盖 | 现有 pre-commit 已有，功能重复 |
| `supply-chain-check` | osv-scanner | ✅ 可覆盖 | OSV 数据库，lockfile 扫描 |
| `license-check` | osv-scanner `--licenses` | ✅ 可覆盖 | 同一二进制 |
| CI 消费（json/sarif/fail-on） | 全部替代工具 | ✅ 可覆盖 | Semgrep/Opengrep/mcp-scanner/osv-scanner 均有 JSON/SARIF |
| 写入前 hooks / ledger | — | ❌ 明确放弃 | 上次评估已判 don't migrate；504MB 状态目录为负资产 |

## Contrarian Views & Risks

1. **Semgrep 规则许可非开源**：Semgrep Rules License 允许内部使用，但"规则不可审计"与 mimosa 的"不可审计"有形式相似性——区别在于规则是明文 YAML、社区可读，只是再分发受限。若此区别不可接受，切 Opengrep + 第三方规则（退路已验证存在）。
2. **mcp-scanner 扫描执行 MCP 命令**：stdio 服务器会被真实启动。`.mcp.json` 中均为公开 npm 包，风险可控；CI 化时考虑 static 子命令（离线 JSON 模式）。
3. **工具数量 vs mimosa 单体**：4 个工具替代 1 个，维护面变大。缓解：全部走 npm scripts 单一入口，工具更新由各 upstream release 节奏决定（均活跃）。
4. **osv-scanner 对 npm lockfile 的覆盖**：OSV 数据库对 npm 生态覆盖良好（GitHub Advisory 数据同源），但深度不如 Snyk 的可达性分析——本项目接受（mimosa 也无可达性分析）。

## Open Questions

- Bearer CLI 是否引入由实施时用户偏好决定（不阻塞）。
- mcp-scanner 的 YARA 规则集更新频率未深查（upstream 活跃度已确认，风险低）。

## 工具准入提案（proposal-review.md §4/§6）

**已验证事实**：见上方 Key Findings（全部 Tier-1 源；9 候选仓 license/pushed_at/archived/release 产物经 gh api 2026-09-05 实测）。

**仍属假设**：Semgrep CE 对本仓 `src/` 的误报率需实测（mimosa 基线为 0 高危）；mcp-scanner YARA 对 `.mcp.json` 的实际判定需 smoke。

**推荐方案**：Semgrep CE（SAST）+ Cisco mcp-scanner（MCP 配置，YARA+prompt_defense 本地分析）+ osv-scanner（supply-chain + license）+ gitleaks（已在）。Bearer CLI 为可选层，默认不引入（PII 敏感度低，需要时再加）。

**被否决替代**：Opengrep（引擎更纯 OSS 但无自带规则，维护规则成本转移给本仓；保留为 Semgrep 规则许可不可接受时的退路）；snyk/agent-scan（分析走云 API + 必需账号 token，可审计性不达标，输出字段明示不稳定）；Trivy（功能重叠且重，本仓只需 lockfile 扫描）；garak/promptfoo（运行时红队框架，非静态扫描，类别不匹配）。

**修改影响面**：`package.json`（新增 scan scripts）、`.githooks/pre-commit`（可选加 osv-scanner 快检）或 `scripts/` 新增扫描入口脚本；不触碰管线代码；`.mcp.json` 固定 context7 版本（附带修复）；删除 `.mimosa/`（504MB，untracked 状态目录）。下游消费者：无（纯新增检查层）。

**验证计划**：① 各工具对本仓 `src/` 最小 smoke（记录误报率 vs mimosa 基线）；② mcp-scanner 对 `.mcp.json` smoke（应复现 npx 未固定版本类发现或确认 YARA 规则集判定口径）；③ 一键命令接入 npm scripts 后跑通；④ mimosa 退役后对比扫描结论无回退。

**未解决风险**：工具间规则口径差异导致的增量发现需人工 triage（预期少量）；osv-scanner 首次扫描可能报出既有依赖的历史漏洞（属真实发现，非回归）。

## 实施记录（2026-09-06 smoke 证据）

- **安装**：`uv tool install semgrep`（pysemgrep/semgrep）、`uv tool install --python 3.13 cisco-ai-mcp-scanner`、`brew install osv-scanner`（2.5.1 arm64 bottle）。gitleaks 8.30.1 已有。
- **`.mcp.json` 附带修复**：`@upstash/context7-mcp` 固定到 `4.0.5`（当时 npm latest）。
- **osv-scanner**：package-lock 688 包 → **5 真实漏洞**（brace-expansion 1.1.16×2 / 5.0.8、js-yaml 4.3.0、nanoid 3.3.16，全部 High、全部有修复版）——新检查层首扫即产生真实发现，均来自 dev 依赖传递。
- **semgrep CE**（p/default，213 规则）：`src/` 185 文件 → 3 findings，全部为 `path-join-resolve-traversal` audit 规则命中测试文件的 fixture 读取（已知高误报模式，triage 为 FP，非阻塞——semgrep 默认 findings 不改变 exit code）。`scripts/` 管线代码 231 findings（506 规则/675 文件）噪声大 → 单列 advisory `scan:code:all`，不进默认入口。
- **mcp-scanner**：stdio 直连模式验证成功（2 tools 扫描、YARA+prompt_defense 判定 HIGH——对 docs 类工具描述的已知激进启发式，参考 appsecsanta MCP 审计「pattern matching catches standard MCP instructions」）；**`config --config-path` 模式在本环境连接超时**（上游 CLI 另有 `--stdio-timeout` 标志触发 `UnboundLocalError` 的 bug，绕行用 `MCP_SCANNER_STDIO_TIMEOUT` 环境变量）。故 `scan` 聚合入口只含 code+deps，`scan:mcp` 独立运行。
- **hooks 决策**：不把扫描加进 pre-commit/pre-push 阻塞路径——当前存在 5 个未修依赖漏洞，push 即 block 会破坏既有工作流；npm scripts 为一键入口，CI 消费（SARIF）N/A（仓库无 CI workflow）。
- **退役清理**：`.mimosa/`（504MB）与 `~/.mimosa/`（24KB）均已删除。mimosa 本体为 ZCode harness 插件，不在 repo 管控范围，插件卸载在 harness 侧完成。

## Sources

1. https://docs.semgrep.dev/faq/comparisons/opengrep — Semgrep 官方 CE vs Opengrep 对比（许可、能力、规则许可条款）— Tier 1
2. https://raw.githubusercontent.com/opengrep/opengrep/main/README.md — Opengrep 官方 README（fork 出处、规则兼容、分发方式）— Tier 1
3. https://raw.githubusercontent.com/Bearer/bearer/main/LICENSE.txt — Bearer ELv2 实文 — Tier 1
4. https://raw.githubusercontent.com/snyk/agent-scan/main/README.md — Snyk Agent Scan 官方 README（SNYK_TOKEN 要求、执行警告、输出稳定性声明）— Tier 1
5. https://raw.githubusercontent.com/cisco-ai-defense/mcp-scanner/main/README.md — Cisco mcp-scanner 官方 README（YARA 本地分析、零 key 模式、static 离线模式）— Tier 1
6. gh api repos/{opengrep/opengrep, semgrep/semgrep, Bearer/bearer, snyk/agent-scan, cisco-ai-defense/mcp-scanner, google/osv-scanner, aquasecurity/trivy, promptfoo/promptfoo, NVIDIA/garak} — license/pushed_at/archived/releases 元数据（2026-09-05 实测，Apple Silicon 产物核对）— Tier 1（本地 CLI）
7. https://docs.bearer.com/ — Bearer CLI 官方文档 — Tier 1
8. https://appsecsanta.com/sast-tools/opengrep-vs-semgrep 等对比文 — 背景参考 — Tier 3（未作为任何承重声明唯一来源）
