# Fact Verification Procedures（PSR 第 4 条操作程序）

> 规则本体在 `docs/agents/proposal-review.md`（§3 事实双源、§4 新工具准入）；本文件是其操作程序。加载时机：执行 proposal-review 的 §3/§4 检查时。

## 源码验证链（库/框架功能支持）

1. `pip show <package>` 确认版本
2. `grep` / `inspect.getsource` 读实现
3. 用正确 API 调用方式做 smoke test
4. 再查文档/网络讨论作为补充；冲突时以源码/实际调用为准（文档可能滞后于代码）

## CLI / 工具存在性

- `which` / `command -v` + 官方文档，双源确认

## 工具选择（搜索/抓取）

- 按 `docs/tools-catalog.md` → Tavily 小节的工具决策与 fallback 硬规则执行

## 网络讨论的解读边界

- 网络讨论反映的是**已报告的**问题，不代表**已修复的**状态

## 数值性事实（定价 / 费率 / 资源分配）

- 必须查官方定价页面（如 modal.com/pricing）或 CLI（如 `modal billing rates`）确认
- 不能以 agent 记忆为准——同一平台可能有多套定价（如 Modal 标准 compute vs Sandbox），容易混淆

## 新工具 / 框架 / 服务引入前维护状态检查

1. GitHub repo 的 `archived` 字段
2. 最近 commit 日期
3. open/closed issue 活跃度
4. 是否有新 release

已停止维护或超过 6 个月无新 commit 的项目，不得推荐引入——平台 API 变更后无人修复会导致生产故障。
