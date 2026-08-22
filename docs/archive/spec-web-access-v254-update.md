# Spec: web-access skill 升级到 v2.5.4 + /extract 合并

## 背景

当前安装的 web-access skill 是基于上游 v2.5.0 之前的版本，且有本地 `/extract` 端点增强（commit c34c49f）。上游已发布到 v2.5.4（2026-08-19），包含 4 个版本的改进：

- v2.5.1: plugin.json 修复（对本项目无影响）
- v2.5.2: Microsoft Edge 支持 + browser-discovery 模块 + find-url 脚本
- v2.5.3: **Breaking change** — /new 和 /navigate 从 GET ?url= 改为 POST body
- v2.5.4: CDP 页面就绪稳定性修复 + 闲置 Tab 自动清理

## 目标

1. 更新 skills/web-access/ 所有文件到 v2.5.4
2. 保留本地 `/extract` 端点（上游无此功能）
3. 迁移 cdp-client.mjs 适配 POST /new（Breaking change）
4. 同步更新 ~/.agents/skills/web-access/ 全局版
5. 更新 docs/tools-catalog.md

## 非目标

- 不提 PR 给上游（后续可选）
- 不改 web-deep-research SKILL.md（已在 c34c49f + 4388581 中更新）
- 不改 search-sources.mjs / asset-sourcer.mjs（它们通过 cdp-client.mjs 间接调用 CDP，迁移后自动兼容）

## 实施方案

### 文件更新策略

| 文件 | 操作 | 来源 |
|------|------|------|
| `skills/web-access/scripts/cdp-proxy.mjs` | 整体替换为 v2.5.4 + 合并 /extract | 上游 v2.5.4 + 本地 EXTRACT_FN + /extract 路由 |
| `skills/web-access/scripts/check-deps.mjs` | 整体替换为 v2.5.4 | 上游 v2.5.4 |
| `skills/web-access/scripts/browser-discovery.mjs` | 新增 | 上游 v2.5.4 |
| `skills/web-access/scripts/find-url.mjs` | 新增 | 上游 v2.5.4 |
| `skills/web-access/scripts/match-site.mjs` | 不动 | 已一致 |
| `skills/web-access/SKILL.md` | 整体替换为 v2.5.4 + 合并 /extract "读" + 路径适配 | 上游 v2.5.4 + 本地修改 |
| `skills/web-access/references/cdp-api.md` | 整体替换为 v2.5.4 + 合并 /extract 文档 | 上游 v2.5.4 + 本地修改 |
| `skills/web-access/references/migration-2.5.3.md` | 新增 | 上游 v2.5.4 |
| `skills/web-access/templates/config.env.template` | 新增 | 上游 v2.5.4 |
| `scripts/short-video/lib/cdp-client.mjs` | cdpNewTab 从 GET 改为 POST | 迁移 |
| `scripts/short-video/__tests__/cdp-client.test.mjs` | 更新测试断言 | 迁移 |
| `~/.agents/skills/web-access/` | 同步更新（全局版） | 同上 |
| `docs/tools-catalog.md` | 更新 web-access 条目 | 文档 |

### SKILL.md 路径策略

上游 v2.5.4 用 `${CLAUDE_SKILL_DIR}/`，本项目不用 Claude Code 插件机制。保持 `~/.agents/skills/web-access/` 路径。

### cdp-client.mjs 迁移

`cdpNewTab()` 从：
```js
const resp = await fetch(`${CDP_BASE}/new?url=${encodeURIComponent(url)}`);
```
改为：
```js
const resp = await fetch(`${CDP_BASE}/new`, {
  method: "POST",
  body: url,
});
```

`/navigate` 也改为 POST，但 cdp-client.mjs 没有 cdpNavigate() 函数，无需迁移。

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `skills/web-access/scripts/cdp-proxy.mjs` | 整体替换为 v2.5.4 + 合并 /extract | Medium | 核心脚本。验证：/health、/targets、/new (POST)、/eval、/extract 全部功能测试 |
| `skills/web-access/scripts/check-deps.mjs` | 整体替换为 v2.5.4 | Low | 纯替换，新增 browser-discovery 依赖 |
| `skills/web-access/SKILL.md` | v2.5.4 + /extract "读" + 路径 | Low | 文档文件 |
| `skills/web-access/references/cdp-api.md` | v2.5.4 + /extract 文档 | Low | 文档文件 |
| `skills/web-access/scripts/browser-discovery.mjs` | 新增 | Low | 全新文件 |
| `skills/web-access/scripts/find-url.mjs` | 新增 | Low | 全新文件 |
| `skills/web-access/references/migration-2.5.3.md` | 新增 | Low | 全新文件 |
| `skills/web-access/templates/config.env.template` | 新增 | Low | 全新文件 |
| `scripts/short-video/lib/cdp-client.mjs` | cdpNewTab GET→POST | High | 多消费者公共接口。消费者：search-sources.mjs、asset-sourcer.mjs |
| `scripts/short-video/__tests__/cdp-client.test.mjs` | 更新测试断言 | Medium | 验证迁移正确性 |
| `~/.agents/skills/web-access/` (全局) | 同步更新 | Medium | 全局 skill |
| `docs/tools-catalog.md` | 更新 web-access 条目 | Low | 文档 |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | cdpNewTab 调用 POST /new，proxy 返回 {targetId} | 正常创建 tab，返回 targetId | Low | 单元测试 mock fetch 验证 POST 方法 + body |
| 2 | cdpNewTab 调用 POST /new，proxy 返回 400 | 抛出错误（Failed to create tab） | Medium | 测试覆盖错误路径 |
| 3 | cdpNewTab URL 含 query 参数（如 xsec_token） | URL 原样传输，不被切分 | High | POST body 无分隔符歧义。测试验证 URL 完整性 |
| 4 | cdpEval 调用 POST /eval | 不变 | Low | 现有测试覆盖 |
| 5 | /extract 端点正常工作 | 返回 clean Markdown | Medium | 手动验证 |
| 6 | /health 返回新字段 (browser, managedTabs) | check-deps.mjs 能正确解析 | Low | check-deps.mjs 同时更新 |
| 7 | browser-discovery 发现 Chrome | 正常发现 + 连接 | Medium | 手动验证 check-deps.mjs |
| 8 | 全局版和项目版一致 | diff 为空 | Low | 更新后做 diff 验证 |
| 9 | search-sources.mjs 调用 cdpNewTab | 正常工作 | High | 通过 cdp-client.mjs 间接调用，迁移后自动兼容 |
| 10 | asset-sourcer.mjs 调用 cdpNewTab | 正常工作 | High | 同上 |
