# Review — #89 P0 Rate Limiter（2026-08-30）

双轴代码审查（Standards + Spec 并行子代理），固定点 HEAD `1e689b2`，范围 = 未提交改动（`rate-limiter.mjs` 新增 + `cdp-client.mjs` 修改 + 测试）。

## Standards 轴

### 硬性违规（已修复）

1. **`cdp-client.mjs` ESM 中使用未定义的 `__dirname`**（`STATE_DIR = join(__dirname, "..", "output")`）— vitest 注入 shim 掩盖了问题，真实 `node` import 即抛 `ReferenceError`，波及全部 4 个 CDP 消费方。同文件 `findCdpProxyScript` 已有正确写法 `dirname(fileURLToPath(import.meta.url))`。
   - **修复**：改用 `dirname(fileURLToPath(import.meta.url))`，真实 node import 验证通过。

### Judgement calls（不阻塞）

- `action` 字符串魔法值（"pass"/"waited"/"skip"）跨 3 文件共享 — 接受，语义局部且测试直断。
- `SITE_RATE_CONFIG` 6 条目 `{baseDelay, jitter, maxPerHour}` 数据结伴 — 行内配置字面量，接受。
- `prune` 读/写两次调用 + cdp-client 与 smoke 的持久化逻辑相似 — 结构差异（注入 vs 真实 fs），接受。
- `ensureLoaded()` 懒加载 + env 逃生阀双开关 — 为测试/调试服务，合理。

## Spec 轴

- 场景矩阵 17 行全部实现并有测试覆盖（16 单测 + 2 集成）。
- 配置数值与 spec 决策 4 完全一致；决策 1-8 逐项命中。
- **scope creep 1 项**：临时 smoke 脚本 `rate-limiter-smoke.mjs`（自标注 TEMP）不在 spec 文件清单 — 已运行验证后删除（删除操作受 IDE 审批阻塞，遗留待手动清理，见报告末尾）。
- **轻微偏差 1 项**：集成测试放在新文件 `cdp-client-ratelimit.test.mjs` 而非 spec 声明的 `cdp-client.test.mjs` — 同为既有 seam 家族（cdp-client 模块级），功能等价。
- skip 分支不记录/不持久化：**有意设计**（skip = 导航未发生，符合场景 9 期望；cap 未出窗前持续 skip 正是预期语义）。

## 验证证据

- 47 tests 全绿（rate-limiter 16 + cdp-client 29 + 集成 2）；lint/tsc/build 全绿。
- Real Data Smoke Test：真实 node 跑 `rateLimiter.wait()` 双进程，跨进程聚合生效（run 2 被 run 1 持久化时间戳门控），`news.google.com` 正确并入 google 桶，状态文件累积。
- 修复 `__dirname` 后用真实 node import 验证通过。

## 遗留待处理

- `scripts/short-video/rate-limiter-smoke.mjs` + `scripts/short-video/output/rate-limiter-state-smoke.json` — 临时文件，删除操作被 IDE 审批超时阻塞，需手动 `rm`（未进入任何 commit）。
- `docs/spec-issue-89-rate-limiter.md`（仓库根）— 归档副本已写入 `docs/archive/`，根目录原件需手动删除。
