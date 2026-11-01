# Test Environment Baseline (Flaky Profile)

> 已知因**环境**而非代码差异失败的测试。解释测试失败前先对照本清单；命中则隔离重跑，再决定是否进入根因搜索。
> 维护规则：发现新的 env-flake 或既有条目失效时更新本表，附日期与证据；本表只收「重跑/环境可解释」的失败，代码缺陷走正常诊断流程。末尾另收**CI 扫描器已知误报类**（工具侧噪声，非测试失败，同样要求日期与证据）。

## 使用规则

1. 全量或相关测试失败时，先查下方清单；命中条目 → 隔离重跑该 suite，重跑全绿则按环境失败记录，不进根因搜索。
2. 隔离重跑仍失败 → 按正常根因流程处理（`implementation-workflow.md` §6）。
3. 并行会话在场时，失败也可能是他人正在改动测试主体——先查该路径是否有 foreign WIP（`git status`），恢复纪律见 `docs/agents/git-concurrent-recovery.md`。
4. worktree 里的全量跑有约 50 个环境失败基线（Chromium、被 gitignore 的媒体、LFS 相关）——与 main checkout 同文件基线对比后再判失败，不要直接当 diff 引入的问题。

## 已知条目

### `scripts/short-video` vitest

- `scene-gate-render` / `text-gate-render` — 真实 Chromium 渲染测试，全量并行负载下 flake（隔离重跑全绿）。2026-09-03。
- `e2e-pipeline` — 需要 CDP proxy / 网络，离线必挂。
- `renderer-guard`（仅 `main.mjs refuses --playwright` 一条）— main.mjs 的 renderer guard 在 Step 0.2 CDP gate 之后（main.mjs:154 vs main.mjs:108），Chrome 调试连接断开时 preflight 先退出（proxy `/targets` 随 Chrome 连接失败而 500），测试到不了 guard。Chrome 健康时全绿；这不是 guard 顺序回归，是入口测试对 live CDP 的环境耦合。2026-09-15（#308 session 实证：Chrome wsPath 缓存过期断连期间隔离重跑仍挂）。
- `verify-lfs-pointer` — 间歇性 env flake。
- `test-f5-duration` — Python 子进程测试，worktree 中 5s 超时；环境类，与被验证的 diff 无关。2026-09-05。
- `asr-analyzer-ipc`（仅 "timeout kills the worker and a late response never pollutes the next request" 一条）— `ASR_RESPONSE_TIMEOUT_MS=300` 预算内要完成第二个 worker 的冷启动 + 响应，负载敏感：CI 全量并行下失败（#370，run 36138179996）、隔离重跑绿、本地同内容 3/3 绿。2026-09-25。
- 依赖缺失本地工具的 suite 会以 stderr 噪音失败：`mlx_vlm`（VLM）、`whisper-cli`（ASR）、wav2vec2 模型缺失。
- **Worktree 缺本地构件（已自动化，2026-10-16）**：`git worktree add` 只带跟踪文件，装好的依赖与被 gitignore 的本地构件都不在里面——6 个 `npx remotion still` 类 suite 会以 `npm error could not determine executable to run`（缺 `scripts/short-video/remotion/node_modules`）或 `Could not load <CanvasImage>`（缺 `scripts/short-video/assets/pexels-ai-chip.jpg`）挂掉，`infra-paths` / `tts-kaggle-batch` 也因缺 `voice-samples` 失败；实测这 6 个 suite **76 条假失败**（全量口径 79，其余 3 条即 `infra-paths` 2 + `tts-kaggle-batch` 1）。`session:start` 现在自动跑 `scripts/session-provision.sh`（`SESSION_NO_PROVISION=1` 可跳过），已有 worktree 用 `npm run session:provision` 补。**两种形式不可互换**：`node_modules`（3 处）用符号链接即可；**dev server 提供的媒体与 voice-samples 必须复制实体**——符号链接会让 Vite dev server 对 `public/assets/*` 返回 404。CI 侧由 `VITEST_CI_SKIP_ENV_BOUND` 环境门跳过，不出现。**2026-11-01 #1093 后这条的媒体部分已自然为空**：没有 fixture 再引用抓取素材（生成图由测试自己写），provision 的媒体段按「fixture 里出现的 `assets/<file>`」推导，现在推导结果为空、不再拷贝任何文件；机制保留给将来绑定真实素材的 fixture。
- **8 个 `npx remotion still` 类 suite 曾在 `Lint, typecheck, test` 里整体缺席（2026-11-01 #1084 实证）**：`scripts/short-video/remotion` 有独立 lockfile，CI 的根 `npm ci` 只装根包 ⇒ 该 workspace 的 `node_modules` 与 `chrome-headless-shell` 在 CI 中都不存在，不是「跑红了」而是「根本不在那里跑」。连带后果：这些 suite 的断言算术必须有 CI 侧副本，否则本机红灯无人看见（#1084 的 `media-focus-render` invariant 5 存活两天即此）；`__tests__/pixel-probe.test.mjs` 是那半个门禁（算术本体在同目录 `pixel-probe.mjs`）。**2026-11-01 #1087 收口：6 套已进 CI；#1093 同日补齐最后 2 套，8/8 全部有门禁。** 独立作业 `Pixel render contracts` 装 remotion workspace（`npm ci --prefix scripts/short-video/remotion`）+ `remotion browser ensure` + brew ffmpeg，串行跑 `media-focus` / `media-start-offset` / `media-zoom` / `official-fit` / `text-gate` / `avatar-card` / `contrast-media` / `scene-gate`（`vitest run --no-file-parallelism --retry=0`；本地串行合计 232 s，作业预算 25 min）。**`--no-file-parallelism` 本身是判据**：每套各起一个 headless 浏览器，并行跑时 runner 的核数变成变量，而被 CPU 挤死的一次渲染会报成像素断言失败——与真的取景缺陷无法区分。这 6 条仍留在 `CI_SKIPPED_MACHINE_BOUND`（那份列表只是 `Lint, typecheck, test` 的排除项，由 `VITEST_CI_SKIP_ENV_BOUND=1` 生效，新作业不设该变量），注释里点名由 `pixel-render` 跑。**最后 2 套（#1093 已收口）**：`contrast-media-render` 与 `scene-gate-render` 渲染的 `scene-gate-fixture.tsx` 曾绑定 `assets/pexels-ai-chip.jpg`，而 `.gitignore` 的 `pexels-*` 规则（抓取素材）把它挡在仓库外 ⇒ 干净 checkout 上渲染在 `Could not load <CanvasImage>` / 404 处失败（run 41304281947 实测）。#1093 改为 fixture 绑定 `assets/_fixture/scene-gate-photo.png`，由两套测试在 `beforeAll` 用 ffmpeg 生成（路径常量在 `remotion/src/fixture-media.mjs`，生成器在 `__tests__/fixture-media.mjs`；该目录已 gitignore），断言未放宽。判据是**干净素材实测**：把那张 Pexels 图移走后两套 39 例绿；变异（fixture 指向生成器不写的图）则红。CI 实测作业 11m48s → **17m17s**（run 41319038205，25 min 预算），即这两套在 runner 上约 +5m30s——接近上限时的既定处置是拆第二个作业，不是抬预算。**首次真跑暴露的两件事**：① `remotion still` 每次调用都重新 bundle（本地实测 bundle 21.3s、单帧 16.8s ⇒ 65 次渲染 ≈ 24 min 本机），所以这两套是作业时长的主要来源；共享 bundle+browser 走 `@remotion/renderer` 的 `renderStill` 实测 ~1.5s/帧，可作后续提速方向，不在本票范围。② 测量探针的「宽度三次稳定」settle 信号会被 group gate 的缩字过程骗过（缩字不动宽度），payload 于是带着未缩的 band 且缺 `data-group-fit`——已改为等 group 自己的 `data-group-fit`，断言不变。**同轮两次解绑尝试失败并已回退**：`avatar-frame-audit` 在 CI 上连收集都失败——它经 `skills/web-access/scripts/cdp-proxy.mjs` 这个指向未初始化 `skills/shared` submodule 的符号链接引入依赖；`finalize-render` 的真 ffmpeg 集成用例断言 loudnorm/drift 结果，runner 的 ffmpeg 不复现（两条都在 run 41304281947 的 `Lint, typecheck, test` 里实测）。教训：注释里写「remotion render path」不等于依赖就是 remotion，但「它只调 ffmpeg」也不等于能在干净 checkout 上跑——解绑必须一次 CI 验证，不能凭静态阅读。**步骤 ② 的容差口径（2026-11-01 定，用户裁决「先落档再扩面」）**：不引入独立的像素容差层，`MAX_DISTANCE = 96` 仍是对「这个采样点算不算某个色带」的唯一上限，`--retry=0` 固定不变。依据是上面那次实测——3 次 runner 运行与本地逐带一致，没有出现需要放宽的漂移；而一套凭空定出的容差会把这个作业存在的意义（看见抖动）换成一个「多大算正常」的口头约定。**扩面时（步骤 ③）若出现首个越限样本**，口径按那次的实际距离分布重定，不接受先给一个经验值再往上凑；届时把「样本距离 / 为什么是这个数」写进本条。**路径过滤：不加（2026-11-01 用户裁决，含改判触发条件）**。原始动因「docs-only PR 白跑一次渲染」实测后不成立：仓库是 public，macOS 标准 runner 分钟免费，省钱一栏是 0，真正付出的只有合并等待——PR #1094（2 文件纯 docs）实测 Pixel 591 s，与同轮 `Lint, typecheck, test` 的 280 s 并行 ⇒ 合并门 4.7 → 9.9 min，而纯 docs PR 占近 60 个已合并 PR 的 1/3（20 个）。**机制上也没有「顺手加个 paths-ignore」这个选项**：workflow 级 `on.pull_request.paths-ignore` 会让被过滤 workflow 的检查停在 Pending，而 `Pixel render contracts` 是必需检查（ruleset 23996753），PR 会被锁死；只有作业级 `if:` 能过滤，因为必需检查接受 `successful / skipped / neutral`，作业被 `if` 跳过才算通过。于是取「无条件跑 + auto-merge 消灭等待」（`allow_auto_merge: true`，docs-only PR 绿后自行合并，门禁语义不动），理由是这轮刚修完三处「注释写 CI 跳过、实际没跑」的失实，再引入一条「这次绿是真跑了还是按路径跳了」的维度不划算。**改判触发条件**（任一成立即改判，且必须用白名单——「全部改动都落在 `docs/**` + `README`/`CHANGELOG`」才跳过，漏判方向才是「默认跑」）：① docs-only 占比 > 50%；② 作业时长 > 15 min（#1093 把 `contrast-media-render` / `scene-gate-render` 接进来后**实测 17m17s**：run 41319038205，条件 ② 自本轮起成立，改判与否待用户裁决）。白名单的实证前提已核：6 套渲染的源码与测试对 `docs/` 的引用全是注释（`media-focus-render.test.mjs:58`、`HookScene.tsx:103`、`AvatarCard.tsx:7`），`docs/**` 不参与任何渲染产物。
- `human-input`（仅 `wheelScroll > scrolls the element that actually scrolls, not the window` 一条）— 全量并行跑时撞 5s 默认 `testTimeout`（2026-11-01 #1084 session 实证：全量 `scripts/short-video/__tests__` 5328 passed / 1 failed 即此项，隔离重跑 55/55 绿）。**判据**同 `session-launcher`：失败信息是 `Error: Test timed out in 5000ms` 且指向 `it(` 行；指向 `expect` 行并带 `AssertionError` 才是逻辑失败。
- **新下载的 `chrome-headless-shell` 会在本机启动即崩（新条目，2026-10-25 #910 session 实证）**：在 worktree 里跑 `npm ci` 后首次 `npx remotion compositions`（入口 `scripts/short-video/remotion/src/Root.tsx`），Remotion 下载的 `157.0.8080.0` headless shell 以 `ProtocolError: Target closed` 失败；`--log=verbose` 可见真因 `icudtl.dat not found in bundle` + `GPU process exited unexpectedly: exit_code=6`（同目录下 `icudtl.dat` 实际存在）。**影响面**是该 checkout 内所有依赖这个二进制的渲染检查（`npx remotion still` / `compositions`，含 `scripts/short-video` 里 remotion 渲染类 suite）——同一份二进制、同一条启动路径。既有 checkout 里 `149.0.7790.0` 那份能正常跑同一命令与 `npx remotion still`。**判据**：报错只有 `Target closed` 且 verbose 日志命中上述两条 chrome 内部行；**绕行**：`--browser-executable <既有可用 chrome-headless-shell>`（`REMOTION_BROWSER_EXECUTABLE` 环境变量不生效，实测仍落在新下载路径）。这是浏览器产物问题，不是依赖 diff 或 Remotion 代码回归——换用旧二进制后同一份新 `node_modules` 全绿。
- 本机 `jsdom` 缺失（新条目，2026-10-12 #424 session 实证；**补装方式于 2026-10-13 #319 session 修正**）：`package.json` 声明了 devDependency `jsdom@^30`，但 main checkout 的 `node_modules` 未安装它 → 3 个 jsdom 环境文件（`src/components/theme-toggle.test.tsx`、`src/components/ui/carousel.test.tsx`、`src/hooks/use-mobile.test.tsx`）以 fork 启动失败计入 Unhandled Errors。全量跑表现：215 文件通过、4359 通过 / 1 skipped、errors=3、exit=1——同一命令在 main checkout 同基线。**修法：`npm ci`**（lockfile 里就有 `jsdom@30.1.2`，恢复即带上；2026-10-13 实测恢复后 227 文件 4496 通过 0 失败、3 条 fork 错误消失）。⚠️ **不要用 `npm install --no-save --no-package-lock <pkg>` 补包**：它会把整棵树重解析到各 range 的最新满足版本——实测把 `@tanstack/start-client-core` 1.170.34→**1.170.37**、`@tanstack/react-start` 1.168.60→**1.169.1** 甩到 lockfile 之外，而 1.170.37 把 `inputValidator` 改名为 `validator`，于是 `src/lib/posts.functions.test.ts` 报 `createServerFn(...).inputValidator is not a function` 的**假失败**（CI 用 `npm ci` 全绿）。判据：失败信息 + `node_modules/@tanstack/start-client-core` 的 mtime 落在安装时刻 + lockfile pin ≠ 实装版本。需要临时包时用独立 checkout，别动共享 `node_modules`。

- `visual-analyzer-pool`（`scripts/short-video/lib/__tests__/visual-analyzer-pool.test.mjs`）— 池计时断言的墙钟上界在并行负载下 flake：2026-10-06 实测 1131/1295/1464/1134ms 四次超当时的 1100ms 上界（「caps in-flight at pool size」已按 `42b12c80` 改为事件顺序断言；「runs 2 requests concurrently」保留宽松的 `total < 2000ms` 上界）；2026-10-12（Round XXX）全量跑唯一失败即此项；2026-10-14（#555 session）并行负载下实测 8452ms 超 2000ms 上界，隔离重跑绿。隔离重跑绿 → 按环境失败记录；本条落档 #466 标题点名的「计时 flake 无基线登记」缺口，计时基线与修复仍归 #466。

### `scripts/__tests__`（session 工具链）

- `session-launcher` 的 gc 竞态用例（`gc: a branch deleted mid-loop is reported gone, not kept` 及其 `--dry-run` 变体、`keeps the remote twin when a commit lands between verification and delete`）在全量跑的负载下会撞 5s 默认 `testTimeout`——每条 gc 用例要 spawn 真 git/bash 约 2-3s，旁边还有 Chromium/ffmpeg 重负载。**判据**：失败报告指向 `it(` 行（如 `session-launcher.test.mjs:353:3`、`:747:3`）且是 `Error: Test timed out in 5000ms`；指向某条 `expect` 行并带 `AssertionError` 才是逻辑失败（`--testTimeout=1000` 可复现超时的报告形态）。隔离重跑 55/55 绿、与 Chromium 套件并发跑也绿、随后全量 260 文件 4925 通过 0 失败。2026-10-14（#406 session 实证）。

### `scripts/short-video/__tests__` Python suite

- **mlx_vlm 路径的取模约定（2026-10-14，#555 leftover 收口）**：`test_frame_strategy.py` 有 2 条用例走 `mlx_vlm.generate.video` 的 `resolve_video_inputs`。真包只装在 `~/.venvs/mlx-vlm`（Python 3.12），CI 的一次性 venv 没有它——这两条经 `_video_module()` 取模块：真包在场用真包，缺包注册同名 stub，两边跑同一批断言。CI 侧因此从 `245 passed / 2 skipped` 变为 **247 passed（0 skip）**；改动后本机两种解释器各跑一遍验证。
- **ffmpeg 二进制差异（同上实证）**：`test_video_loader.py` 的 fixture 生成默认用仓库文档化的 `/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg`；CI 的 Homebrew runner 没有它，该步以 `VIDEO_LOADER_FFMPEG=$(command -v ffmpeg)` 指向 brew 的 ffmpeg，22 条 fixture 用例照跑（缺二进制时是 22 条 ERROR，不是 skip）。同文件里 `to_minicpm_units` 的段长在 CI 上是 15959 而本机是 16000：AAC 流头部样本数随 ffmpeg build 变，跨机比较这两个数时不要当回归。
- **依赖来源**：套件依赖写在 `scripts/short-video/__tests__/requirements.txt`（pytest/Pillow/numpy/pytest-cov），CI 装进一次性 venv `.scratch/pytest-venv`。运行入口与守卫的唯一出处是 `package.json` 的 `test:python`（快跑）与 `test:python:coverage`（CI 用，含覆盖率门禁）加套件内 `conftest.py`（逐文件计数表、零收集硬门禁），此处不复述命令行。
- **覆盖率棘轮分两半，口径不混（2026-10-14，#555 leftover 收口）**：JS 半边在 `vitest.config.ts` 的 `coverage.thresholds`，Python 半边在 `scripts/short-video/__tests__/.coveragerc` 的 `[report] fail_under`；两半指标集不同，故各自一个数、不合并成混合值（阈值与实测日期只写在这两个配置里，此处不复述）。Python 侧范围 = 本套件断言其行为的 `lib/` 模块，排除项必须在 `.coveragerc` 内逐条写明理由；新增 `lib/*.py` 默认纳入（未测即 0% 拉低总分），但 coverage 的 source 走查按路径推导模块名——带连字符的目录（`b-roll/`）里只有被 import 过的文件才进表，这类目录该留在 omit 名单里。原始数据与 JSON 报告落 `.scratch/coverage-python/`（与 JS 侧 `.scratch/coverage` 同域，仓根不落 `.coverage`）。
- 旧 vitest wrapper `test-f5-duration.test.mjs` 仍绑 `~/.video-tts-env`（见上表），与 pytest 侧跑同一个 `test_f5_duration.py`；wrapper 只认 stdout 的 `Results: N passed, 0 failed` 形状，改该文件报告格式须同步改 wrapper。

### Node 版本漂移

- node < 20.12 启动 vitest/vite 8 直接崩溃（`node:util does not provide an export named 'styleText'`，rolldown 要求 ≥20.12）。仓库无 `.nvmrc` / `engines` pin——用 nvm 的 node（≥24.12）跑。同一类漂移见 prettier 版本史（#177，已解决）。

### git push 前置扫描（osv-scanner）

- pre-push 跑 `npm run scan:deps`（osv-scanner 查 api.osv.dev）。本机直连 osv.dev 会 i/o timeout，扫描异常退出使 pre-push **fail-closed** 报 `BLOCKED: dependency scan failed`（实际 0 findings）。2026-09-12；文案于 2026-10-25 #910 改为同时覆盖「扫描报错」。
- 处理：代理前缀 `HTTPS_PROXY=http://127.0.0.1:<当前活着的端口> git push ...`；或单独 `HTTPS_PROXY=... npm run scan:deps` 确认 "No issues found" 后再推。不要 `--no-verify` 绕过（会同时跳过 gitleaks）。
- ⚠️ 端口**不要照抄**：本机有两个代理客户端、端口不同，写死那一个会在切客户端当天变成死端口。先按下方「宿主代理端口」实测再填。

### 宿主代理端口（Clash Verge / FlClash 双客户端）

本机同时装了 Clash Verge Rev 与 FlClash，**两个都可能处于运行状态**（进程在 ≠ 代理可用）。

**2026-11-01 起 Clash Verge 的 mixed-port 是随机的**（`verge.yaml` → `enable_random_port: true`）：每次启动挑一个空闲端口，写进 `clash-verge.yaml` 的 `mixed-port`，并由 `enable_system_proxy: true` 自动写进 macOS 网络设置。实测重启两次：`63009` → `63265`。所以**任何表格里的 Clash 端口都只能当快照**，判据永远是当场探测。

⚠️ **Clash Verge 重启不回收内核（2026-11-01 实测）**：每次 `open -a "Clash Verge"`（或退出后重开）都会留一个 root 的 `verge-mihomo` 不退出，实测累积到 5 个（4 个空闲、合计约 85MB，且不占端口，所以不影响可用性）。清理要 root：

```bash
ps -o pid=,lstart= -p $(pgrep -x verge-mihomo | paste -sd, -)   # 看谁是活的（最后一个）
sudo kill <空闲的 PID...>                                        # 只杀空闲的
```

| 角色                         | 端口                                                                    | 配置位置                                                                                                                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Clash Verge Rev `mixed-port` | **随机**（实测 `63265`）                                                | `~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/clash-verge.yaml`；`verge.yaml` 里 `enable_random_port` / `enable_system_proxy` 必须同时为 true |
| Clash Verge Rev 固定监听     | socks `7898` / http `7899` / redir `7895` / controller `127.0.0.1:9097` | `verge.yaml` 的 `verge_*_port`，这几个**不随机**；`7899` 是可用兜底出口                                                                                                  |
| FlClash `mixed-port`         | `7890`                                                                  | `~/Library/Application Support/com.follow.clash/config.yaml`（`port`/`socks-port`/`redir-port` 均为 0，`external-controller` 为空）；2026-11-01 已确认其进程为僵尸并终止 |
| colima 隧道                  | VM `127.0.0.1:7891` → 宿主 `<PROXY_PORT>`                               | `scripts/colima-proxy-tunnel.sh`；`PROXY_PORT` 由 `scutil --proxy` 自动探测（系统代理关闭时探测失败 ⇒ 隧道起不来）                                                       |

**先实测哪个端口今天活着**，再决定往哪儿指（10 秒）：

```bash
P=$(scutil --proxy | awk '/HTTPPort/{print $3}')   # 系统代理当前指向（关掉时为空）
for p in ${P:+"$P"} 7899 7890; do
  printf "%s => %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' \
    -x http://127.0.0.1:$p --max-time 8 https://www.google.com/generate_204)"
done
# 204 = 该端口真在代理；000 = 死端口（Direct 模式 / 无可用节点 / 未监听）
```

`${P:+"$P"}` 是必要的：系统代理关掉时 `scutil --proxy` 没有 `HTTPPort` 行，`$P` 为空，直接写 `"$P"` 会探 `http://127.0.0.1:` 并打印一行没有意义的 `000`。

⚠️ **测法本身的坑**：`--noproxy '*'` 会**覆盖** `-x`，两者同上时三条路径全退化成直连，结果是假的“都一样”。测本地代理端口时不要带 `--noproxy`。

**逐端口是这条判据的全部**：不带 `-x` 的请求在 TUN 开启时也返回 `204`（见下表「不给代理（默认）」行），所以裸请求分不出「这个端口在代理」和「这台机器在某处代理」。上面这个循环已由 `npm run proxy:url` 自动化（`scripts/lib/proxy-port.mjs`），批量 git 调用见 `docs/agents/git-workflow.md` §11；本表仍是配方与实测值的唯一出处。

**2026-09-25 实测快照**（每次切客户端后重测，别当长期结论）：

| 路径                 | google/generate_204 | youtube | 判读                                                                                                                                           |
| -------------------- | ------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| FlClash `7890`       | `204`               | `200`   | ✅ 可用（TUN 打开后它不再是唯一出口）；2026-11-01 该进程已是僵尸并被终止，此行为历史                                                           |
| Clash Verge `7897`   | `000`               | `000`   | ❌ 端口在监听但不代理（`verge.yaml`：`enable_tun_mode: false`、`enable_system_proxy: false`，运行配置 `mode: direct`）⇒ 等价直连               |
| **不给代理（默认）** | `204`               | `200`   | ✅ **TUN 已接管**（2026-09-25 10:10 起）：`1` `2/7` `4/6` `8/5` `16/4` `32/3` `64/2` `128.0/1` 八条半路由全部指向 `utun7`（网关 `198.18.0.1`） |

⚠️ **2026-11-01：TUN 已关闭**（`enable_tun_mode: false`），上表最后一行不再成立——不带 `-x` 的请求现在真的直连，`google` 返回 `000`。所以「裸请求也能 204」这个坑今天不存在，但别据此推翻「逐端口探测」的判据：TUN 一开它就回来了。

**`mode` 的坑（2026-11-01 踩过）**：`rule` 只打在运行时（`PATCH 127.0.0.1:9097/configs`）会被重启抹掉——真正的持久值在 `config.yaml` 与 `clash-verge.yaml` 的 `mode:` 行。它们是 `direct` 时，端口在监听、系统代理也指对了，但**不代理任何流量**（实测 `google=000`、`baidu=200`），看起来像「代理挂了」。改完必须重启内核才生效。

**端口被写死在哪 —— 改一个要同时改，否则只有一半通**：

| 位置                                               | 现状                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 仓库 `.git/config` 的 `http.proxy` / `https.proxy` | **`http://127.0.0.1:7899`**（2026-11-01 定）。`7899` 是 Clash Verge 的**固定** http 监听，不随随机 mixed-port 变，所以这里可以写死；`7890`（FlClash 旧口）/ `7897`（旧 mixed-port）都已作废。批量 git 仍可走 `npm run git:proxy`（§11），它按当次探测结果注入、不写这个共享文件 |
| `~/searxng/settings.yml` 的 `outgoing.proxies`     | `http://192.168.5.2:7890`。⚠️ `7890` 是 FlClash 旧口，2026-11-01 起无进程监听 ⇒ **下面两行目前指向死端口**；TUN 关着时要让 VM 出网，须改 `192.168.5.2:7899`（Clash Verge 固定 http 口）或走隧道 `127.0.0.1:7891`                                                                |
| colima VM 内的 `http_proxy` 等 4 个环境变量        | `http://192.168.5.2:7890`（VM 启动时注入的项目，`colima.yaml` 的 `env` 为空 ⇒ 来自别处）；同上，`7890` 已死，需同步改                                                                                                                                                           |

⚠️ **为什么 `.git/config` 能写死而系统代理不能**：系统代理由 Clash Verge 自动改写（`enable_system_proxy`），跟着 mixed-port 跑；`.git/config` 没人替它更新，所以它必须指向一个**不会变**的端口。`7899` 由 `verge.yaml` 的 `verge_http_enabled` / `verge_port` 决定，是这批监听里唯一适合当锚点的（`7898` 是 SOCKS，git 不走）。

⚠️ **纠正（2026-09-25 09:50 实测）**：本表原写「git 实际直连：github 能通」——**是错的**。当天 `github.com` 直连 = `000`（被墙），只有 `api.github.com` 直连 = `200`。所以 `.git/config` 指着死端口时 git **不是直连、而是全挂**。判据要用 `github.com` 本体，别拿 `api.github.com` 代替（它不走墙）。

⚠️ **量 VM 出网必须先清 env**：VM 里注入了 `http_proxy=http://192.168.5.2:7890`，不清 env 时看到 `204` **什么都证明不了**。清法：`env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY curl ...`。

- TUN **关**时清完 env = `000`；TUN **开**时清完 env = `204`。
- **纠错（2026-09-25 10:18）**：本条原写「VM 内直连能用是假象、VM 出网必须走代理」——**后半句在 TUN 打开后不成立**。当天实测清完 env 后 VM 直连 `google` = `204`、`github` = `200`，且 VM 把 `google.com` 解析成 **`198.18.0.4`**（宿主 TUN 的 fake-IP 段；VM `resolv.conf` 仍指向宿主 `192.168.5.1`）⇒ **宿主 TUN 覆盖了 colima VM 的 NAT 流量**。
- **判据要用 fake-IP，不能只看状态码**：`204` 无法区分「TUN 接管」与「注入的代理生效」，`198.18.x.x` 才能。

**历史坑（勿丢）**：FlClash `7890` 曾对**带 auth header 的 POST** 断连，colab CLI 因此必须切到 Clash Verge `7897`（`docs/archive/handoffs/handoff-infinitetalk-kaggle-colab.md`）。所以「哪个端口才对」不是固定的，取决于**当前客户端 + 协议**——按上表实测，别照抄历史结论。2026-11-01 起这个 `7897` 更不可能再对：Clash Verge 的 mixed-port 已经随机，`7897` 是个不会再监听的端口；要用固定出口就选 `7899`（HTTP）/ `7898`（SOCKS）。

**根治方向 —— 两条路，别混着走**：

前提：**同一时间只跑一个客户端**。Clash Verge 与 FlClash 同时运行是端口漂移的源头。

| 方案                                         | 代价                                                          | 谁受益                                                                                                             | 仍需同步端口的地方                                     |
| -------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| **客户端「系统代理」打开**（推荐起步）       | 一次点击、可逆、不动内核                                      | 浏览器（Chrome **动态跟随**，无需重启）、`scutil --proxy` 有值 ⇒ 隧道脚本能自动探测                                | git、SearXNG（**都不读** macOS 系统代理）              |
| 客户端 TUN 真正打开（**2026-09-25 起采用**） | 需客户端 helper；**两客户端同时开会抢路由**，必须先退出另一个 | 所有进程透明代理（CLI / git / Chrome **以及 colima VM**）；`.git/config` 与 SearXNG 里的宿主端口写死**都可以去掉** | 仅剩「TUN 被关掉之后」这一种情形，那时才需要隧道或网关 |

- **切到非 Clash Verge 客户端时，才动 git 的代理**：

  ```bash
  P=$(scutil --proxy | awk '/HTTPPort/{print $3}')
  [ -n "$P" ] && git config --local http.proxy "http://127.0.0.1:$P" \
               && git config --local https.proxy "http://127.0.0.1:$P" && echo "git → $P"
  ```

  ⚠️ **跑这一行之前先想清楚**：它把 `.git/config` 改成**当前**的系统代理端口，而 Clash Verge 的混合端口是随机的——下次重启后它就是死端口。这是**切客户端**（例如换到 FlClash）时的一次性动作，不是在 Clash Verge 下日常该做的事：Clash Verge 的 `.git/config` 应当固定停在 `7899`，不需要跟着随机端口跑。

  系统代理关着时 `$P` 为空：改走 TUN 就该 `git config --unset http.proxy`（TUN 覆盖后不需要它）。**别让两个都不成立**——那时 git 对着一个死端口。

- ~~**让 SearXNG 不再随端口漂**：把 `outgoing.proxies` 改为隧道口 `127.0.0.1:7891`~~ —— **已被 TUN 取代（2026-09-25 10:20）**：TUN 开着时 VM 直连即可，`outgoing.proxies` 不再是必需项。只有回到「TUN 关着」的时段才需要隧道或网关方案。

**colima 与代理的关系（别把它当"本地所以直连"）**：colima 是跑在本机的 Linux VM（lima + Apple Virtualization.Framework），Docker/SearXNG 在 VM 内。VM 有自己的网络命名空间，**VM 的 `127.0.0.1` ≠ macOS 的 `127.0.0.1`**；代理客户端只监听宿主 `127.0.0.1`、且 `allow-lan: false`，VM 直连不到。VM 出网三条路：① 宿主网关 `192.168.5.2:<宿主端口>`；② SSH 反向隧道 `VM 127.0.0.1:7891 → 宿主 <端口>`（`scripts/colima-proxy-tunnel.sh`）；③ **宿主 TUN 开着时的透明代理 —— 实测覆盖 VM**（判据见上「量 VM 出网」节的 fake-IP）。①②只在③不成立时才有意义。

**隧道现状（2026-09-25 10:20 定位到真根因）**：VM 内 `7891` 在 LISTEN、`-x http://127.0.0.1:7891` = `204`，但 **`/tmp/colima-proxy-tunnel.pid` 里的进程早已不存在** —— 端口被**上一次 ssh 留下的 orphan 转发**占着（原进程已退出，转发挂在 lima control master 上继续活着）。
后果链条：LaunchAgent 每 60s 判「pid 死了 ⇒ 重启」→ 新 ssh 对已被占用的 `7891` 做 `-R` → 静默失败（脚本没开 `ExitOnForwardFailure`）→ 日志只剩 `Connection refused` 噪声，而隧道时好时坏。**「隧道在通」与「守护进程还管得住它」是两件事**：只看 `kill -0 $(cat pidfile)` 会把 orphan 误判成「需要重启」。
修法：脚本改为「先探 `7891` 是否真能出网 ⇒ 能用就静默接管、不能用才重启」，并加 `-o ExitOnForwardFailure=yes`；`start` 还会先判「VM 已能直连（TUN）⇒ 什么都不做」，重试链条由此归零。

**⚠️ `~/bin` 那份必须是实体文件，不能是软链（2026-09-25 实测）**：LaunchAgent 由 launchd 派生，**没有 `~/Documents` 的 macOS 隐私（TCC）授权** —— 软链指向仓库后每轮都报 `/bin/bash: /Users/pabloli/bin/colima-proxy-tunnel.sh: Operation not permitted`（launchd 读不到 `~/Documents` 里的真身）。所以结构保持「可执行件在 `~/bin`、真值源在仓库」，同步用 `npm run env:sync-tunnel`（该脚本是唯一写入者；改完 `scripts/colima-proxy-tunnel.sh` 就跑一次）。

### .nvmrc（#231，2026-09-12 新增）

- 仓库根 `.nvmrc` = 24（Remotion 渲染需 arm64 Node ≥22，x64 缺 @rspack 绑定；renovate 后续抬到 24，下限仍是 22）；上条「Node 版本漂移」的 `无 .nvmrc` 表述已过时。

---

## CI 扫描器已知误报类

### Semgrep × 测试 fixture（2026-10-12 起，2026-10-13 扩到五类）

测试 fixture 的构造方式（临时目录、真媒体文件、内存状态替身、常量表断言）会命中若干 Semgrep 规则，而这些形状在测试里是预期行为。**判据是「规则 id 且测试路径」双条件**：测试文件对其余规则照常扫描，生产路径的同规则命中照常上传。

| 规则（完整 id，与过滤器 `RULE_IDS` 逐字一致）                                                           | 测试里的形状                                                                        |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal` | fixture 路径来自 `mkdtempSync`，taint 源=函数参数、汇=`path.join`/`resolve`         |
| `javascript.lang.security.detect-child-process.detect-child-process`                                    | fixture 用 `execSync` 跑 ffmpeg 造真媒体文件，参数是临时目录路径与数字（时长/延迟） |
| `javascript.lang.security.insecure-object-assign.insecure-object-assign`                                | 测试替身用 `Object.assign(mem, JSON.parse(JSON.stringify(s)))` 合并内存状态         |
| `javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp`                    | 用常量列表或捕获的进程输出构造 `RegExp` 来断言                                      |
| `javascript.lang.security.audit.prototype-pollution.prototype-pollution-loop.prototype-pollution-loop`  | 漂移模拟按固定字段常量表改写 fixture 对象                                           |

- **证据（2026-10-12 首批）**：`path-join-resolve-traversal` 是 **taint 模式**规则，全量实测（`semgrep 1.179.0`，`--config p/default`，`src/ scripts/`）**115 条在测试路径、266 条在生产路径**——误报只在测试侧。**注解是否生效与版本相关（2026-10-14 订正）**：1.179.0/1.180.0 上 `// nosemgrep` 对该 taint 规则不生效（注释在汇行、源行、带显式 rule id 三种写法均仍上报）；但**本仓 pre-push 用的本地版本 1.176.1 上汇行注解生效**——同线 A/B（`const full = join(dir, entry.name);` 2 findings → 加 `// nosemgrep` 0 findings），`src/components/widgets/tokens-drift.test.ts:29` 同形亦被压制。故本地误报可先用汇行注解消掉；**CI 的过滤器仍是唯一版本无关的兜底**（CI 容器版本随镜像漂移，不能假设注解有效）。`paths.exclude` 覆盖同 id 规则会让结果**翻倍**（19 → 27 实测）。
- **证据（2026-10-13 第二批）**：安全页 27 条开放告警全在测试路径，分属上表后四类（`detect-child-process` 19、`insecure-object-assign` 4、`detect-non-literal-regexp` 3、`prototype-pollution-loop` 1）。全量实测（`semgrep 1.176.1`，同命令）489 条结果：过滤器丢弃 **145**（118 条 `path-join-resolve-traversal` + 上述 27 条），生产路径保留 `path-join-resolve-traversal` 265 条、`detect-child-process` 41 条、`detect-non-literal-regexp` 14 条；集合外规则的 24 条前后逐条一致。**计数随 semgrep/规则集版本漂移**（首批 115/266，第二批 118/265 即版本差），契约是「规则 id + 路径」，不是任何固定数字。
- **处置**：CI 在扫描与上传之间跑 `.github/scripts/filter-semgrep-fps.py`（`.github/workflows/ci.yml` 的 `Drop documented test-fixture false positives` 步骤）。过滤器由 `scripts/__tests__/semgrep-fp-filter.test.mjs` 钉住：每类规则在测试路径被丢弃、在生产路径保留、集合外规则在测试路径保留；另有「报告损坏 / 无 scan run / 无 results 键 / 无规则目录即失败」边界。**规则目录守卫**：报告自带的 `tool.driver.rules` 必须仍含五类 id——上游改名或删除时 job 失败并列出要同步的三处，过滤器不会静默失效。安全页上的存量告警按 **`used in tests`** dismiss（2026-10-12 首批 114 条；2026-10-13 第二批 27 条）。
- **维护**：新增一类误报必须**同时**改三处——过滤器 `RULE_IDS`、`scripts/__tests__/semgrep-fp-filter.test.mjs`、本表；三处的 id 必须逐字一致（表中列全 id 就是为了可对照）。若要把某规则**生产路径**的命中一起排除，那是策略变更，不属本机制。
