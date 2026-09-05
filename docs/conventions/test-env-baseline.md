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
- `verify-lfs-pointer` — 间歇性 env flake。
- `test-f5-duration` — Python 子进程测试，worktree 中 5s 超时；环境类，与被验证的 diff 无关。2026-09-05。
- 依赖缺失本地工具的 suite 会以 stderr 噪音失败：`mlx_vlm`（VLM）、`whisper-cli`（ASR）、wav2vec2 模型缺失。

### Node 版本漂移

- node < 20.12 启动 vitest/vite 8 直接崩溃（`node:util does not provide an export named 'styleText'`，rolldown 要求 ≥20.12）。仓库无 `.nvmrc` / `engines` pin——用 nvm 的 node（≥24.12）跑。同一类漂移见 prettier 版本史（#177，已解决）。
