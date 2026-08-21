# Tickets: web-access v2.5.4 升级 + /extract 合并

## Ticket 1: 更新 web-access skill 文件到 v2.5.4 + 合并 /extract

**依赖**: 无
**阻塞**: Ticket 2（cdp-client.mjs 迁移需要新版 proxy 的 POST /new 端点）

### Checklist

- [x] 下载 v2.5.4 的 cdp-proxy.mjs，合并本地 /extract 端点（EXTRACT_FN + 路由 + 404 列表），写入 `skills/web-access/scripts/cdp-proxy.mjs`
- [x] 下载 v2.5.4 的 check-deps.mjs，写入 `skills/web-access/scripts/check-deps.mjs`
- [x] 下载 v2.5.4 的 browser-discovery.mjs，写入 `skills/web-access/scripts/browser-discovery.mjs`
- [x] 下载 v2.5.4 的 find-url.mjs，写入 `skills/web-access/scripts/find-url.mjs`
- [x] 下载 v2.5.4 的 migration-2.5.3.md，写入 `skills/web-access/references/migration-2.5.3.md`
- [x] 下载 v2.5.4 的 config.env.template，写入 `skills/web-access/templates/config.env.template`
- [x] 基于 v2.5.4 SKILL.md，合并 /extract "读" 部分，路径从 ${CLAUDE_SKILL_DIR} 改为 ~/.agents/skills/web-access/，写入 `skills/web-access/SKILL.md`
- [x] 基于 v2.5.4 cdp-api.md，合并 /extract 文档，路径适配，写入 `skills/web-access/references/cdp-api.md`
- [x] 同步所有文件到 `~/.agents/skills/web-access/`（全局版）
- [x] 验证全局版和项目版 diff 为空

## Ticket 2: 迁移 cdp-client.mjs 适配 POST /new

**依赖**: Ticket 1（需要新版 proxy 的 POST /new 端点）
**阻塞**: 无

### Checklist

- [x] 先写测试（red）：更新 cdp-client.test.mjs 的 cdpNewTab 测试，断言 fetch 用 POST 方法 + body=URL
- [x] 测试验证 red（测试失败，因为 cdpNewTab 还用 GET）
- [x] 修改 cdp-client.mjs 的 cdpNewTab 从 GET /new?url= 改为 POST /new（body=URL）
- [x] 测试验证 green（22 tests passed）
- [x] 确认 search-sources.mjs 和 asset-sourcer.mjs 不需要改（通过 cdp-client.mjs 间接调用）

## Ticket 3: 更新 docs/tools-catalog.md

**依赖**: 无
**阻塞**: 无

### Checklist

- [x] 更新 docs/tools-catalog.md 中 web-access 条目：补充 v2.5.4 版本信息、新增 browser-discovery 和 find-url 能力说明
