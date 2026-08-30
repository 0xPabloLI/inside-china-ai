# Spec — #89 P0: CDP Rate Limiter Module

> Issue: [#89 Anti-bot scraping solutions](https://github.com/0xPabloLI/inside-china-ai/issues/89) — P0 slice only。
> Wave: W1。Grill 记录：2026-08-30 session，Q1-Q6 全部按推荐。

## Problem Statement

管线通过 CDP 抓取 35+ 源，当前没有任何系统化限流：`PAGE_LOAD_WAIT_MS = 3000` 固定且不分站点，`RETRY_WAIT_MS = 3000` 固定无退避，多个 Google 系源（`google_search`、`google_news`、13 个自动生成的 `googleSiteFallback`）各自独立请求同一域名，请求量叠加。结果是Google/Bing/百度等高风险引擎可能触发限流或 CAPTCHA，小红书等站有封号风险。

## Solution

新增按域名限流模块：每次 CDP 导航前按目标 URL 域名计算随机化等待间隔，按域名维护小时请求滑窗上限，超限时等待（有上限）或跳过。跨进程持久化滑窗时间戳，使连续多次 run 之间请求量仍然聚合。集成在 `cdpNewTab` 内部，所有 CDP 消费方自动生效，调用方零改动。

## User Stories

1. As a 管线运营者, I want 对 Google 的所有请求（直连源 + site: fallback）共享一个限流桶，so that 请求量聚合后不触发 Google 的 ~100 req/hr 限流。
2. As a 管线运营者, I want 每次导航间隔带随机 jitter，so that 请求模式不像机器人。
3. As a 管线运营者, I want 小红书等高危站有更长的 baseDelay 和更低的 maxPerHour，so that 封号风险可控。
4. As a 管线运营者, I want 小时请求量跨 run 持久化，so that 连续两次 trend run 不会叠加超限。
5. As a 管线运营者, I want 限流触发时先等待、等待超过上限才跳过，so that 轻微超限不会导致整轮丢数据。
6. As a 管线运营者, I want 被限流跳过的 source 走现有 fallback 链（CDP → googleSiteFallback → MCP），so that 数据可用性不受单点限流影响。
7. As a 管线运营者, I want 限流等待和跳过在日志中可见，so that 我能判断某源失败是限流还是真反爬。
8. As a 开发者, I want 限流对 `cdpNewTab` 的接口契约零改变，so that 所有现有消费方（search-sources / asset-sourcer / extract-media / video-understand）无需修改。
9. As a 开发者, I want 有 `RATE_LIMITER_DISABLED=1` 逃生阀，so that 调试和测试不受等待阻塞。
10. As a 开发者, I want 限流器时间与睡眠可注入，so that 单测不需要真实等待。
11. As a 开发者, I want 状态文件损坏时降级为空状态而非 crash，so that 一次损坏不会废掉整轮抓取。

## Implementation Decisions

1. **新模块 `rate-limiter.mjs`**（不依赖 `cdp-client.mjs`，避免循环导入），导出工厂 `createRateLimiter({ now, sleep, loadState, saveState, disabled })`，实例方法 `wait(url)`：解析 URL → 匹配域名配置 → 计算等待 → 必要时 sleep → 记录时间戳（导航前，失败请求也计数）→ 持久化。返回值区分"已等待/未等待/已跳过"。
2. **域名匹配**：取 URL hostname，对配置 key 做后缀匹配（`google.com` 命中 `www.google.com`/`news.google.com`），最长匹配优先；无匹配或 URL 不可解析 → `_default`。
3. **集成点 `cdpNewTab`**：内部先 `await limiter.wait(url)`；跳过时抛出携带域名信息的错误（沿用现有 throw 风格），`collectFromCdp` 的现有 catch 自然接管并返回 `[]`，后续 fallback 链不受影响。`cdpNewTab` 签名与返回值不变。
4. **配置 `SITE_RATE_CONFIG`**：采用 issue #89 数值基线（google 8s/30hr、bing 5s/60hr、baidu 7s/40hr、bilibili 5s/50hr、zhihu 7s/40hr、xiaohongshu 15s/20hr、default 1s/200hr），jitter 区间同 issue。
5. **滑窗与等待**：每域名维护时间戳数组；间隔 = `baseDelay × random(jitter min..max)`，取 `now - lastTs` 与间隔的差为等待量；首次请求不等待。小时窗口 = 最近 1h 内时间戳计数 < `maxPerHour`；超限则等待到最老时间戳出窗，等待 > 10 min（cap）→ 跳过。
6. **持久化**：滑窗时间戳写入 `scripts/short-video/output/rate-limiter-state.json`（目录 gitignored；不存在则创建）。加载时修剪 >1h 的旧时间戳。文件缺失 → 空状态；JSON 损坏 → warn + 重置空状态。并发双 run 的读写竞态接受 last-write-wins（管线为单 run 串行，文档化限制）。
7. **逃生阀**：`RATE_LIMITER_DISABLED=1` 时 `wait()` 直接返回，不写状态。测试环境通过该变量或注入 fake clock 隔离。
8. **日志**：等待时打印域名、等待 ms；跳过时打印 warn（含已等待上限、恢复建议）。

## Testing Decisions

- 只测外部行为：给定调用序列与注入时钟，断言 sleep 调用次数/时长区间、状态文件内容、跳过时抛错；不断言内部数据结构。
- 模块单测：`rate-limiter.test.mjs` 覆盖行为场景矩阵全部行（注入 `now`/`sleep`，`loadState`/`saveState` 用内存 map 或临时文件）。
- 集成测试：沿用 `cdp-client.test.mjs` 现有 seam（mock fetch + `RATE_LIMITER_DISABLED=1`），验证限器开启时 `cdpNewTab` 契约不变（现有用例全绿）、跳过路径抛错。
- 既有测试先例：`__tests__/cdp-client.test.mjs` 的 mock fetch 模式、`trends-utils` 系列的纯函数注入模式。

## Out of Scope

- P1 exponential backoff retry（同 issue 下一切片）
- P2 通用 CAPTCHA 检测、P3/P3c 搜索源新增、P4 Google 源合并、P5-P7（selector 自愈 / 节点切换 / colima）
- API 源与 MCP 源的限流（各有自身配额，不经 CDP）
- 跨进程文件锁（竞态已文档化为可接受限制）
- `asset-sourcer.mjs` / `extract-media.mjs` / `video-understand.mjs` 的任何代码改动（经 `cdpNewTab` 自动生效）

## Scenario & Risk Verification Matrix

### Section 1: Modified Files Impact

| 文件 | 修改内容 | 风险等级 | 评估 |
|------|---------|---------|------|
| `lib/cdp-client.mjs` | `cdpNewTab` 内新增 limiter 调用 + 模块级实例化 + 导出 limiter 供测试 | Medium | 4 个生产消费方 + 测试套件受影响。缓解：仅追加等待语义、逃生阀变量、单测注入时钟、现有用例加 disable 后必须全绿。最坏后果：限流器误拦导致 source 静默变空 → 由日志 warn + fallback 链兜底 |
| `__tests__/cdp-client.test.mjs` | 顶部设置 disable env；新增跳过路径用例 | Low | 现有用例语义不变 |
| `lib/rate-limiter.mjs`（新） | 全新模块 | Low | 无下游，单点消费方为 cdp-client |
| `__tests__/rate-limiter.test.mjs`（新） | 全新测试 | Low | — |

### Section 2: Behavioral Scenarios

| # | Scenario | Expected Behavior | Risk | Mitigation |
|---|----------|-------------------|------|------------|
| 1 | 域名首次请求 | 不等待，导航即发，时间戳记录+持久化 | Low | — |
| 2 | 同域名第二次请求，间隔 < baseDelay×jitter | sleep 差值后导航 | Low | — |
| 3 | sleep 时长落在 `jitter min..max × baseDelay` 区间 | 断言区间 | Low | 注入确定性随机 |
| 4 | `www.google.com` 与 `google.com` | 同一桶 | Low | — |
| 5 | `google_search` 与 `googleSiteFallback`（google URL）连续请求 | 共享 google 桶，第二次触发等待（聚合验证） | Medium | 场景 2 断言复用 |
| 6 | google 与 baidu 交替请求 | 各自独立桶，互不等待 | Low | — |
| 7 | 未配置域名 / 不可解析 URL | `_default` 配置，不 crash | Low | — |
| 8 | 1h 滑窗达到 maxPerHour，最老时间戳出窗等待 ≤ cap | 等待到出窗时刻后放行 | Medium | 注入时钟推进 |
| 9 | 出窗等待 > 10 min cap | 抛错跳过，不导航；错误含域名 | Medium | search-sources 现有 catch → fallback 链（集成层验证） |
| 10 | 窗口内 >1h 旧时间戳 | 加载/写入时修剪，容量释放 | Low | — |
| 11 | 状态文件缺失 | 空状态启动；保存时自动建目录 | Low | — |
| 12 | 状态文件 JSON 损坏 | warn + 重置空状态，管线继续 | Medium | 场景 13 断言继续可用 |
| 13 | 本进程记录后，新实例加载状态文件 | 旧时间戳计入滑窗（跨 run 聚合） | High（核心需求） | 持久化读写直测 |
| 14 | 导航随后失败 | 时间戳已记录（失败也计数） | Low | 场景 1 断言顺序 |
| 15 | `RATE_LIMITER_DISABLED=1` | 零等待、零写盘 | Low | — |
| 16 | 限流开启时 `cdpNewTab` 正常路径 | 返回 targetId；无 targetId 仍 throw（契约不变） | Medium | 现有用例 disable 后全绿 + 新开启态用例 |
| 17 | 持久化保存与加载往返 | 时间戳数组 roundtrip 一致 | Low | — |

每行 = 一个 TDD 测试用例，Step 4 必须全覆盖。
