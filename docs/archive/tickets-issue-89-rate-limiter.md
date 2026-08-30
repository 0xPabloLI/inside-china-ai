# Tickets — #89 P0 Rate Limiter

Spec: `spec-issue-89-rate-limiter.md`（同目录）。拆分时间 2026-08-30，TDD 实施完成，47 tests 全绿。

## 01 — Rate limiter module core

**What to build:** 可独立使用的按域名限流器。给定目标 URL，决定「立即放行 / 等待后放行 / 跳过」：域名后缀匹配配置（含 `_default` 兜底）、首次请求不等待、`baseDelay × jitter` 间隔、1h 滑窗 `maxPerHour` 超限等待出窗（>10min cap 跳过并抛含域名错误）、跨进程持久化（缺失/损坏降级空状态）、`RATE_LIMITER_DISABLED=1` 逃生阀。`now`/`sleep`/`loadState`/`saveState`/`random` 全注入。

**Blocked by:** None.

**Status:** ✅ done

- [x] 场景 1–3：首请求不等待；间隔内等待；jitter 时长区间断言
- [x] 场景 4–6：域名后缀匹配同桶；google 聚合；跨域名独立桶
- [x] 场景 7：未知域名/不可解析 URL 走 `_default`，不 crash
- [x] 场景 8–10：滑窗超限等待出窗；超 cap 抛错跳过；旧时间戳修剪
- [x] 场景 11–13：状态文件缺失建目录；损坏 warn+重置；跨实例 roundtrip 聚合
- [x] 场景 14–15、17：导航前记录时间戳；env 逃生阀；持久化往返一致
- [x] lint + tsc + 现有测试套件全绿

## 02 — cdpNewTab integration

**What to build:** `cdpNewTab` 在打开 tab 前调用限流器 `wait(url)`，接口契约不变（正常返回 targetId；无 targetId 仍 throw）；限流跳过抛可识别错误 → `collectFromCdp` 现有 catch 接管 → 返回空数组 → 现有 fallback 链继续。现有测试经逃生阀保持零等待。4 个生产消费方零改动自动生效。

**Blocked by:** 01

**Status:** ✅ done

- [x] 限流开启时 cdpNewTab 正常路径契约不变（现有用例 disable 后全绿）
- [x] 跳过路径：wait 抛错 → cdpNewTab 传播错误，含域名信息
- [x] 无 targetId 的原有 throw 行为不回退
- [x] lint + tsc + build 全绿；Real Data Smoke Test（真实 node 双进程验证等待日志 + 跨进程聚合 + 状态文件）
