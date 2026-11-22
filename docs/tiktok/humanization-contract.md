# TikTok 发布拟人化契约（v1.1 当前实现）

> 状态：**当前实现 + 目标契约**。2026-11-19 已落地 trusted paste、5–10 分钟节流、审阅硬中止、出口阻断、原生 NSOpenPanel 文件选择；剩余差距见 §7。
> 范围：`scripts/short-video/tiktok-upload-prep.mjs` 的 CDP 草稿路径。手机 App 手动发布不在自动路径内，但受同一套“设备出口”事实约束（§6）。
> 目的：把散落在 `tiktok-upload-prep.mjs`、`human-input.mjs`、`publish-throttle.mjs`、`publish-egress.mjs`、`cdp-fingerprint.mjs`、`human-input-selftest.mjs` 的规则，收敛成一套可执行、可验收的契约。

## 0. 一句话

拟人化不是一个开关，而是**环境、会话、输入、节奏、审阅、日志**六层同时成立；任何一层单独“像人”都不够。

这份契约不能保证平台一定给流量。它只负责移除我们能控制的机器形状信号：固定间隔、合成事件、隐藏窗口、错误出口、未审阅就保存、可绕过的门禁。

## 1. 边界：自动路径只到草稿

- 自动路径的终点是 **保存草稿**；公开点击由操作者完成（#1181）。
- `publish-throttle` 计的是**准备动作**（prepared editor / saved draft），不是公开帖子。它不控制你的真实发布节奏。
- 因此：16 分钟、10 分钟、甚至更短地连续准备草稿，对平台来说都还不是“连续发帖”；真正被平台看到的是你手动点发布的那一刻。
- 草稿不同步到手机 App；手机端发布是另一次上传，不是“打开网页草稿”。

## 2. P0 硬门禁

任何一条不成立，run 必须 **abort**，不得“warn 后继续”。

### 2.1 身份与环境

| 必须成立                                                | 证据                                                                              | 失败动作                                                |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 固定自动化 profile `~/chrome-tiktok-profile`，端口 9229 | `ensureCdpProfileGuard()` 通过                                                    | abort                                                   |
| 真实 Chrome，未用 `--enable-automation`                 | `FINGERPRINT_PROBE` 的 `webdriver:false`                                          | abort                                                   |
| UA / platform / language / timezone 与真实 Chrome 一致  | `classifyFingerprint()` 四项全过                                                  | abort                                                   |
| 不做 UA / 时区 / WebGL / canvas 伪造                    | 代码中无 `Emulation.setUserAgentOverride` / `setTimezoneOverride`；不加载伪装脚本 | abort                                                   |
| 运行中不切换代理节点、不断网重连                        | 运行前后出口 IP/colo 一致                                                         | abort                                                   |
| 同一 profile 同时只有一个发布 run                       | 进程锁 / `publish-throttle` 状态文件 + run lock                                   | abort                                                   |
| 浏览器窗口前台可见                                      | `document.hasFocus()` / `visibilityState`；焦点模拟只能作为记录过的降级           | abort 或记录 `focusEmulated` 后继续（仅限输入超时自愈） |

### 2.2 出口地理

| 必须成立                                          | 证据                                                        | 失败动作           |
| ------------------------------------------------- | ----------------------------------------------------------- | ------------------ |
| 自动化浏览器的**实际出口**是期望区域（默认 `HK`） | Cloudflare `/cdn-cgi/trace` 的 `loc` 等于 `--expect-region` | abort              |
| 出口可确定                                        | `loc != XX`，`ip`/`colo` 可读                               | abort              |
| 节点名只作参考，不作出证据                        | 日志同时记录 selected node、`ip`、`colo`、`loc`             | 不满足即视为未验证 |
| 出口在 run 中未变化                               | 开始/结束各探测一次，`ip` 一致                              | abort              |

**关键事实**：Clash 的“新加坡 Y03”可以是新加坡入口、香港落地。节点名不是出口，`loc` 才是。2026-11-16 / 11-19 的实测落地都是 `loc=HK, colo=HKG`，且账号历史通过这个 HK 出口拿到过 272 / 351 / 189 播放，因此默认期望区域按**实测 HK**，不是标签上的 SG。要把发布区域改回 SG，必须显式 `--expect-region SG`；门禁不会静默放行。

### 2.3 输入

| 必须成立                                | 证据                                                                                | 失败动作     |
| --------------------------------------- | ----------------------------------------------------------------------------------- | ------------ |
| caption 用**系统剪贴板 + 真实 `Cmd+V`** | 页面收到 `paste` 且 `isTrusted:true`；读回文本逐字一致                              | abort        |
| 不使用合成 `ClipboardEvent`             | 无 `new ClipboardEvent("paste")`；无 `isTrusted:false` 的 paste                     | abort        |
| 文案读回校验                            | `normalizeCaption(read.text) === want`                                              | abort        |
| 粘贴失败重试一次                        | 第一次失败后重新选择、重新 `Cmd+V`；第二次仍失败即 abort                            | abort        |
| typed 只做显式调试                      | 只有 `--type-caption` 才逐字输入；日志 `captionMode:"typed-explicit"`               | 常规路径禁止 |
| 指针移动是曲线                          | ≥5 个 `mousemove`、真实距离、步长有变化、有减速/过冲                                | abort        |
| 按下/抬起是可信事件                     | `mousedown`/`mouseup` `isTrusted:true`，落点在路径终点                              | abort        |
| 滚轮是可信事件                          | `wheel` `isTrusted:true`，页面真的滚动                                              | abort        |
| 文件选择走原生 picker                   | 选择后校验文件名/大小/hash 与内容包一致；面板由 macOS 系统打开，不用 CDP `setFiles` | abort        |
| 所有输入等待都有抖动                    | 无裸 `sleep(常数)`；每个 band 有 `[base, spread]` 且 spread ≥ base 的 20%           | abort        |

### 2.4 发布选项

| 必须成立             | 证据                                                 | 失败动作                         |
| -------------------- | ---------------------------------------------------- | -------------------------------- |
| AIGC 标记开启        | `aigcEnabled:true`，且页面读回开启                   | abort                            |
| 音轨已挂接           | 页面读回 sound 名称/作者；日志 `sound.attached`      | abort                            |
| 音量正确             | 页面读回 slider 值 = `--volume-db`                   | abort                            |
| 封面正确             | 首帧/封面与内容包一致                                | abort                            |
| 隐私/位置按本次策略  | 记录 `privacy`、`location`；未设置则明确写 `not-set` | 不静默假设                       |
| 只保存草稿，不点发布 | `draft.saved=true`、`published=false`                | 任何 `published:true` 都视为越界 |

### 2.5 节奏

| 必须成立                       | 证据                                                  | 失败动作 |
| ------------------------------ | ----------------------------------------------------- | -------- |
| 草稿准备间隔 5–10 分钟随机     | `publish-throttle` 的 `intervalMs` 落在 300000–600000 | abort    |
| 每天最多 3 次准备              | `runsToday <= 3`                                      | abort    |
| 间隔不是固定值                 | 连续 run 的 `intervalMs` 有差异；日志保留 `jittersMs` | abort    |
| 常规路径不使用 `--no-throttle` | 该 flag 已移除；旧命令会直接报错退出                  | abort    |
| 失败重跑不消耗配额             | 只在成功终端动作后 `commitThrottleRun`                | 不提交   |

### 2.6 审阅

| 必须成立                | 证据                                                  | 失败动作              |
| ----------------------- | ----------------------------------------------------- | --------------------- |
| 预览真的播放            | 播放时钟从起点前进 ≥2s；`reviewed:true`               | abort                 |
| 审阅时长像人            | 观看 10s ±5s（`REVIEW_WATCH_MS`），不是固定 3s        | abort                 |
| 暂停确认                | 暂停后两次读时钟不再前进                              | abort                 |
| caption/sound/AIGC 读回 | 三项都在 `review` 行记录                              | abort                 |
| 截图留证                | 审阅帧截图保存到 `qa/`                                | 允许 warn，但不得静默 |
| 审阅失败不得保存草稿    | `reviewed:false` 时抛出并保留 tab；`draft.saved` 不写 | abort                 |

### 2.7 日志

每个 run 至少写：

- `profile`：publishMethod、AIGC policy、profile 路径。
- `throttle` / `throttle.blocked` / `throttle.commit`：策略、剩余时间；没有 bypass 字段，因为不存在 bypass。
- `egress`：expected、actual、ip、colo、selected node。
- `fingerprint`：四项检查结果。
- `warmup.feed`：每个 feed 的 dwell、scroll count、scroll mode。
- `caption`：mode（trusted-paste / typed-explicit）、trusted、len、hash、pasteAttempts、耗时。
- `review`：reviewed、watchedMs、advancedSeconds、pausedAfter。
- `draft`：saved、published、url。
- 所有事件带 ISO 时间戳；不写密码、cookie、token、完整 IP 之外的个人信息。

### 2.8 失败策略

- 出口不匹配 / 未知：abort。
- 登录态丢失：abort，提示重新登录，不反复重试。
- profile 错误：abort，打印修复命令。
- 指纹失败：abort。
- caption 读回不一致：abort。
- 预览未播放：目标 abort；当前至少不得静默当成功。
- 上传卡住 / 编辑器消失：abort，保留 tab。
- 任何 abort 都不得 `commitThrottleRun`，不得写 `draft.saved=true`。

## 3. Pipeline Workflow

| Stage           | 动作                                                                  | 完成条件                                             |
| --------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| 0 Preflight     | profile guard、指纹、出口、单实例锁、视频/文案/AIGC/音轨/音量参数校验 | 全部 P0 通过；否则不打开上传页                       |
| 1 Warm-up       | 打开 For You，3–8 个 feed，5–20s dwell，随机滚动/回看，前台窗口       | `warmup.feed` 条数 ≥3，输入事件 trusted              |
| 2 Upload        | 原生 picker 选文件，等待编辑器 ready                                  | 文件名/hash 一致，编辑器可编辑                       |
| 3 Compose       | caption 粘贴、AIGC、sound、volume、cover、privacy                     | 每项读回一致                                         |
| 4 Review        | 播放 ≥2s（目标 10s±5s），暂停，读回三项                               | `reviewed:true` 且 `pausedAfter:true`                |
| 5 Save draft    | 点裁剪面板“保存”，再点“保存草稿”                                      | 页面离开 `/upload` 或出现草稿确认；`published:false` |
| 6 Human publish | 操作者在 Studio 里点发布                                              | 自动化不执行                                         |
| 7 Post-publish  | 首小时评论、置顶评论、Analytics                                       | 人工/后续工具，不属于本契约                          |

## 4. Caption 输入规范（目标）

```text
pbcopy < caption.txt
focus caption editor (human click)
Cmd+V
read back Draft.js text
compare normalized text
if mismatch:
  retry paste once (re-select, Cmd+V)
  if still mismatch: abort — do not type 700 chars
else:
  log captionMode:"trusted-paste", trusted:true, pasteAttempts
```

- 常规路径不逐字输入。正常人贴 700 字就是一次粘贴，不是 84 秒敲 713 个字符。
- `new ClipboardEvent("paste")` 不是粘贴，是页面内伪造事件；平台能看到 `isTrusted:false`。
- `--type-caption` 只用于 smoke/debug，日志 `captionMode:"typed-explicit"`；它不是自动 fallback。
- 粘贴失败重试一次是人的行为；第二次仍失败就 abort，把问题暴露给操作者，不用 80 秒逐字输入掩盖。
- 粘贴后仍要 `pokeEditorState` 让 Draft.js 从 ContentState 重建，防止 DOM 有字、保存为空。

## 5. 节奏与 Throttle

### 5.1 它是什么

`publish-throttle` 是**我们自己的**草稿准备节流，不是 TikTok 的限制：

- 状态文件：`~/chrome-tiktok-profile/publish-throttle.json`
- 当前：每天 ≤3 次，间隔 5–10 分钟（7.5 ±2.5）
- 计数对象：成功到达终端动作的 run（prepared editor 或 saved draft）
- `--no-throttle`：已移除。旧命令带这个 flag 会直接报错退出，不会静默绕过。

### 5.2 为什么 90 分钟不合理

- 它管的是草稿准备，不是公开帖子；平台不会把两次“保存草稿”当成两次发帖。
- 你的真实工作流是“视频做完集中发”；90 分钟会人为把批量生产拆散。
- 16 分钟已经足够像一个正常人的批量操作；5–10 分钟随机更接近真实批量，而不是固定 90 分钟这种机器节拍。

### 5.3 当前策略

| 参数             | 当前值                                         |
| ---------------- | ---------------------------------------------- |
| `minIntervalMs`  | 5 分钟                                         |
| `baseIntervalMs` | 7.5 分钟                                       |
| `jitterMs`       | ±2.5 分钟                                      |
| 实际落点         | 5–10 分钟                                      |
| `maxPerDay`      | 3                                              |
| 常规路径         | 不使用 `--no-throttle`（已移除）               |
| 失败重跑         | 失败不计数，可直接重跑；不会缩短下一次合法间隔 |

## 6. 出口与手机端

- macOS 系统代理是 `127.0.0.1:59490`（Clash mixed port）。Clash 里选的是 `🇸🇬 新加坡Y03 | IEPL | x2`，但该节点的实际出口 IP 是 `141.11.146.63`，`ipinfo` 标注 `HK / Kwai Chung`，Cloudflare `loc=HK, colo=HKG`。
- 解释：**节点名是入口，不是落地**。新加坡入口可以接香港落地；Clash 的 `now` 只证明你选了哪个入口，不证明 TikTok 看到哪个国家。
- 手机手动发布：TikTok 看的是**手机自己的出口**，不是 Mac 的 Clash。
  - 手机连同一个 Wi-Fi 且走了同一个代理/VPN：大概率也是 HK 落地。
  - 手机用 5G/独立 VPN：是另一个出口，需要在手机浏览器打开 `https://www.cloudflare.com/cdn-cgi/trace` 看 `loc`。
  - 手机 App 发布与网页草稿是两条路；草稿不同步，手机端要重新上传 mp4。
- 修复顺序：
  1. 在 Clash 里逐个测 `Y01`/`Y02`，用 `cloudflare trace` 验证 `loc=SG`；
  2. 若三个 SG 节点都落地 HK，换供应商/专用 SG 出口，不要信节点标签；
  3. pipeline 默认按实测 HK 作为期望区域；如果实际落地变成其他 `loc`，直接 abort；
  4. 日志同时记录 selected node + actual IP + colo，区分“选错”与“落地错”。

## 7. 当前实现与剩余差距

| 文件                         | 现在有什么                                                                                                                                | 差距                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `tiktok-upload-prep.mjs`     | profile guard、指纹、warmup、Bézier 指针、抖动、AIGC、sound、volume、review、save-draft、trusted paste、审阅硬中止、出口阻断、原生 picker | 无                                                            |
| `lib/native-file-picker.mjs` | 按 PID 定位 Chrome、打开 NSOpenPanel、写入 Go to folder、点击 Open、页面 SHA-256 校验                                                     | 仅 macOS；依赖 System Events 辅助功能权限                     |
| `lib/human-input.mjs`        | 贝塞尔路径、过冲、可信按下、逐字 `insertText`、滚轮、真实剪贴板 `pasteText`                                                               | 无                                                            |
| `human-input-selftest.mjs`   | 验证 trusted 指针/键盘/滚轮/粘贴、零合成事件                                                                                              | 是 live CDP 脚本，不能直接进 GitHub CI；CI 用单测锁定同一契约 |
| `lib/publish-throttle.mjs`   | 跨进程状态、每日上限、5–10 分钟、失败不计数、无 bypass flag                                                                               | 无                                                            |
| `lib/publish-egress.mjs`     | 浏览器内 Cloudflare trace、默认 HK、非 dry-run 全阻断                                                                                     | 无                                                            |
| `lib/cdp-fingerprint.mjs`    | webdriver/UA/platform/timezone/languages 检查                                                                                             | 无                                                            |
| `lib/cdp-profile-guard.mjs`  | 固定 profile、端口、错误 profile 拒绝                                                                                                     | 无                                                            |
| `docs/manual-ops.md`         | 分散记录了 AIGC、草稿、出口、节流、self-test                                                                                              | 需与 v1.1 数值同步                                            |

## 8. 验收清单

### 8.1 本地 selftest

- [ ] 指针：≥5 个 mousemove、真实距离、步长有变化。
- [ ] 点击：mousedown/mouseup `isTrusted:true`，落点正确。
- [x] caption：真实 `Cmd+V`，页面 `paste` `isTrusted:true`；读回一致。
- [x] typed：只在 `--type-caption` 显式开启，日志有 `captionMode:"typed-explicit"`。
- [x] 键盘：Enter/Backspace trusted。
- [x] 滚轮：≥2 个 trusted wheel，页面真的滚动。
- [x] 合成事件：0。
- [x] CI 单测覆盖同一契约（`human-input.test.mjs`、`tiktok-upload-prep-human-shape.test.mjs`）；live selftest 仍手动跑。

### 8.2 空草稿 smoke

- [ ] 出口 `loc` 等于期望区域（默认 HK）；否则 preflight 直接 abort。
- [ ] 指纹四项全过。
- [ ] warmup ≥3 feed，窗口前台。
- [ ] caption paste trusted，读回一致。
- [ ] AIGC/sound/volume 读回一致。
- [ ] review `reviewed:true`、`pausedAfter:true`。
- [ ] `draft.saved=true`、`published=false`。
- [ ] `throttle.intervalMs` 在 5–10 分钟。
- [ ] 日志无 `throttle.bypassed:true`。

### 8.3 日志审计

- [ ] `egress` 行有 selected node、actual IP、colo、loc。
- [ ] `caption` 行有 mode、trusted、len、hash；trusted 路径有 `pasteAttempts`。
- [ ] `review` 行有 watchedMs、advancedSeconds。
- [ ] `draft` 行有 saved、published。
- [ ] 无敏感信息。

## 9. 落地顺序

1. **文档**：本文件 + `DOCS-INDEX.md` 指针。
2. **门禁**：egress block、review abort、run lock、5–10 分钟节流。
3. **输入**：trusted clipboard paste + typed fallback。
4. **测试**：human-input selftest 进 CI；空草稿 smoke。
5. **Canary**：只跑一条空草稿，不自动发布；通过后再用于真实内容。

## 10. 相关文件

- `scripts/short-video/tiktok-upload-prep.mjs`
- `scripts/short-video/lib/human-input.mjs`
- `scripts/short-video/lib/behavior-sampling.mjs`
- `scripts/short-video/lib/publish-pacing.mjs`
- `scripts/short-video/lib/publish-throttle.mjs`
- `scripts/short-video/lib/publish-egress.mjs`
- `scripts/short-video/lib/cdp-fingerprint.mjs`
- `scripts/short-video/lib/cdp-profile-guard.mjs`
- `scripts/short-video/human-input-selftest.mjs`
- `docs/manual-ops.md`
- `docs/content-pipeline.md`
