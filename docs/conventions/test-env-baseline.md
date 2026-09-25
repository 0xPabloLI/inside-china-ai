# Test Environment Baseline (Flaky Profile)

> 已知因**环境**而非代码差异失败的测试。解释测试失败前先对照本清单；命中则隔离重跑，再决定是否进入根因搜索。
> 维护规则：发现新的 env-flake 或既有条目失效时更新本表，附日期与证据；本表只收"重跑/环境可解释"的失败，代码缺陷走正常诊断流程。

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
- 依赖缺失本地工具的 suite 会以 stderr 噪音失败：`mlx_vlm`（VLM）、`whisper-cli`（ASR）、wav2vec2 模型缺失。

### Node 版本漂移

- node < 20.12 启动 vitest/vite 8 直接崩溃（`node:util does not provide an export named 'styleText'`，rolldown 要求 ≥20.12）。仓库无 `.nvmrc` / `engines` pin——用 nvm 的 node（≥24.12）跑。同一类漂移见 prettier 版本史（#177，已解决）。

### git push 前置扫描（osv-scanner）

- pre-push 跑 `npm run scan:deps`（osv-scanner 查 api.osv.dev）。本机直连 osv.dev 会 i/o timeout，扫描异常退出使 pre-push **fail-closed** 报 "known vulnerabilities"（实际 0 findings）。2026-09-12。
- 处理：代理前缀 `HTTPS_PROXY=http://127.0.0.1:<当前活着的端口> git push ...`；或单独 `HTTPS_PROXY=... npm run scan:deps` 确认 "No issues found" 后再推。不要 `--no-verify` 绕过（会同时跳过 gitleaks）。
- ⚠️ 端口**不要照抄**：本机有两个代理客户端、端口不同，写死那一个会在切客户端当天变成死端口。先按下方「宿主代理端口」实测再填。

### 宿主代理端口（Clash Verge / FlClash 双客户端）

本机同时装了 Clash Verge Rev 与 FlClash，混合端口不同，**两个都可能处于运行状态**（进程在 ≠ 代理可用）。

| 角色 | 端口 | 配置位置 |
| --- | --- | --- |
| Clash Verge Rev `mixed-port` | `7897` | `~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/{config,verge}.yaml`；另有 socks `7898` / http `7899` / redir `7895` / controller `127.0.0.1:9097` |
| FlClash `mixed-port` | `7890` | `~/Library/Application Support/com.follow.clash/config.yaml`（`port`/`socks-port`/`redir-port` 均为 0，`external-controller` 为空） |
| colima 隧道 | VM `127.0.0.1:7891` → 宿主 `<PROXY_PORT>` | `scripts/colima-proxy-tunnel.sh`；`PROXY_PORT` 由 `scutil --proxy` 自动探测（系统代理关闭时探测失败 ⇒ 隧道起不来） |

**先实测哪个端口今天活着**，再决定往哪儿指（10 秒）：

```bash
for p in 7890 7897; do
  printf "%s => %s\n" "$p" "$(curl -s -o /dev/null -w '%{http_code}' \
    -x http://127.0.0.1:$p --max-time 8 https://www.google.com/generate_204)"
done
# 204 = 该端口真在代理；000 = 死端口（Direct 模式 / 无可用节点 / 未监听）
```

⚠️ **测法本身的坑**：`--noproxy '*'` 会**覆盖** `-x`，两者同上时三条路径全退化成直连，结果是假的“都一样”。测本地代理端口时不要带 `--noproxy`。

**2026-09-25 实测快照**（每次切客户端后重测，别当长期结论）：

| 路径 | google/generate_204 | youtube | 判读 |
| --- | --- | --- | --- |
| FlClash `7890` | `204` | `200` | ✅ 可用（TUN 打开后它不再是唯一出口） |
| Clash Verge `7897` | `000` | `000` | ❌ 端口在监听但不代理（`verge.yaml`：`enable_tun_mode: false`、`enable_system_proxy: false`，运行配置 `mode: direct`）⇒ 等价直连 |
| **不给代理（默认）** | `204` | `200` | ✅ **TUN 已接管**（2026-09-25 10:10 起）：`1` `2/7` `4/6` `8/5` `16/4` `32/3` `64/2` `128.0/1` 八条半路由全部指向 `utun7`（网关 `198.18.0.1`） |

**端口被写死在哪 —— 改一个要同时改，否则只有一半通**：

| 位置 | 2026-09-25 现状 |
| --- | --- |
| 仓库 `.git/config` 的 `http.proxy` / `https.proxy` | `7897`（死）→ 09:50 改 `7890` → **10:12 `git config --local --unset`**。TUN 覆盖后这里**应当为空**：留着就是留一个迟早会死的端口 |
| `~/searxng/settings.yml` 的 `outgoing.proxies` | `http://192.168.5.2:7890`（VM 网关→宿主；当日与 FlClash 一致） |
| colima VM 内的 `http_proxy` 等 4 个环境变量 | `http://192.168.5.2:7890`（VM 启动时注入的项目，`colima.yaml` 的 `env` 为空 ⇒ 来自别处）|

⚠️ **纠正（2026-09-25 09:50 实测）**：本表原写「git 实际直连：github 能通」——**是错的**。当天 `github.com` 直连 = `000`（被墙），只有 `api.github.com` 直连 = `200`。所以 `.git/config` 指着死端口时 git **不是直连、而是全挂**。判据要用 `github.com` 本体，别拿 `api.github.com` 代替（它不走墙）。

⚠️ **量 VM 出网必须先清 env**：VM 里注入了 `http_proxy=http://192.168.5.2:7890`，不清 env 时看到 `204` **什么都证明不了**。清法：`env -u http_proxy -u https_proxy -u HTTP_PROXY -u HTTPS_PROXY curl ...`。

- TUN **关**时清完 env = `000`；TUN **开**时清完 env = `204`。
- **纠错（2026-09-25 10:18）**：本条原写「VM 内直连能用是假象、VM 出网必须走代理」——**后半句在 TUN 打开后不成立**。当天实测清完 env 后 VM 直连 `google` = `204`、`github` = `200`，且 VM 把 `google.com` 解析成 **`198.18.0.4`**（宿主 TUN 的 fake-IP 段；VM `resolv.conf` 仍指向宿主 `192.168.5.1`）⇒ **宿主 TUN 覆盖了 colima VM 的 NAT 流量**。
- **判据要用 fake-IP，不能只看状态码**：`204` 无法区分「TUN 接管」与「注入的代理生效」，`198.18.x.x` 才能。

**历史坑（勿丢）**：FlClash `7890` 曾对**带 auth header 的 POST** 断连，colab CLI 因此必须切到 Clash Verge `7897`（`docs/archive/handoffs/handoff-infinitetalk-kaggle-colab.md`）。所以「哪个端口才对」不是固定的，取决于**当前客户端 + 协议**——按上表实测，别照抄历史结论。

**根治方向 —— 两条路，别混着走**：

前提：**同一时间只跑一个客户端**。Clash Verge 与 FlClash 同时运行是端口漂移的源头。

| 方案 | 代价 | 谁受益 | 仍需同步端口的地方 |
| --- | --- | --- | --- |
| **客户端「系统代理」打开**（推荐起步） | 一次点击、可逆、不动内核 | 浏览器（Chrome **动态跟随**，无需重启）、`scutil --proxy` 有值 ⇒ 隧道脚本能自动探测 | git、SearXNG（**都不读** macOS 系统代理）|
| 客户端 TUN 真正打开（**2026-09-25 起采用**） | 需客户端 helper；**两客户端同时开会抢路由**，必须先退出另一个 | 所有进程透明代理（CLI / git / Chrome **以及 colima VM**）；`.git/config` 与 SearXNG 里的宿主端口写死**都可以去掉** | 仅剩「TUN 被关掉之后」这一种情形，那时才需要隧道或网关 |

- **跟随系统代理同步 git（切客户端后跑这一行）**：

  ```bash
  P=$(scutil --proxy | awk '/HTTPPort/{print $3}')
  [ -n "$P" ] && git config --local http.proxy "http://127.0.0.1:$P" \
               && git config --local https.proxy "http://127.0.0.1:$P" && echo "git → $P"
  ```

  系统代理关着时 `$P` 为空：改走 TUN 就该 `git config --unset http.proxy`（TUN 覆盖后不需要它）。**别让两个都不成立**——那时 git 对着一个死端口。
- ~~**让 SearXNG 不再随端口漂**：把 `outgoing.proxies` 改为隧道口 `127.0.0.1:7891`~~ —— **已被 TUN 取代（2026-09-25 10:20）**：TUN 开着时 VM 直连即可，`outgoing.proxies` 不再是必需项。只有回到「TUN 关着」的时段才需要隧道或网关方案。

**colima 与代理的关系（别把它当"本地所以直连"）**：colima 是跑在本机的 Linux VM（lima + Apple Virtualization.Framework），Docker/SearXNG 在 VM 内。VM 有自己的网络命名空间，**VM 的 `127.0.0.1` ≠ macOS 的 `127.0.0.1`**；代理客户端只监听宿主 `127.0.0.1`、且 `allow-lan: false`，VM 直连不到。VM 出网三条路：① 宿主网关 `192.168.5.2:<宿主端口>`；② SSH 反向隧道 `VM 127.0.0.1:7891 → 宿主 <端口>`（`scripts/colima-proxy-tunnel.sh`）；③ **宿主 TUN 开着时的透明代理 —— 实测覆盖 VM**（判据见上「量 VM 出网」节的 fake-IP）。①②只在③不成立时才有意义。

**隧道现状（2026-09-25 10:20 定位到真根因）**：VM 内 `7891` 在 LISTEN、`-x http://127.0.0.1:7891` = `204`，但 **`/tmp/colima-proxy-tunnel.pid` 里的进程早已不存在** —— 端口被**上一次 ssh 留下的 orphan 转发**占着（原进程已退出，转发挂在 lima control master 上继续活着）。
后果链条：LaunchAgent 每 60s 判「pid 死了 ⇒ 重启」→ 新 ssh 对已被占用的 `7891` 做 `-R` → 静默失败（脚本没开 `ExitOnForwardFailure`）→ 日志只剩 `Connection refused` 噪声，而隧道时好时坏。**「隧道在通」与「守护进程还管得住它」是两件事**：只看 `kill -0 $(cat pidfile)` 会把 orphan 误判成「需要重启」。
修法：脚本改为「先探 `7891` 是否真能出网 ⇒ 能用就静默接管、不能用才重启」，并加 `-o ExitOnForwardFailure=yes`；`~/bin/colima-proxy-tunnel.sh` 从**副本**改为**软链**指向 `scripts/` 那份，消灭双份漂移。

### .nvmrc（#231，2026-09-12 新增）

- 仓库根 `.nvmrc` = 22（Remotion 渲染需 arm64 Node ≥22，x64 缺 @rspack 绑定）；上条「Node 版本漂移」的 `无 .nvmrc` 表述已过时。
