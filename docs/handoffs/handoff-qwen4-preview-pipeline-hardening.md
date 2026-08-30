# Handoff: Qwen4-Preview 视频 + 管线加固（素材相关性 / 文字截断 / 验证盲区）

> Created: 2026-08-29
> Trigger: qwen4-preview HITL 审阅暴露 4 类问题（多版本混淆、文字截断、素材同质化、素材-scene 关联度低）；
> 用户指示「修复当前内容是其次，主要修复管线，保证以后不会再发生」
> Content slug: `qwen4-preview` ｜ Article slug: `qwen4-preview`（draft 已存 Supabase）

## 当前状态（Snapshot）

- **最终视频**：`scripts/short-video/output/qwen4-preview/qwen4-preview-v2026-08-29T12-23-09-short.mp4`
  （65.1s，MRL-3 0 FAIL，10/10 场景帧审计通过；旧版本 05-06-23 / 07-39-34 / 07-49-24 是中间态，发布前清理）
- **文章 draft**：`articles/qwen4-preview.md` 已存 Supabase（`publish-article.mjs --draft`），未公开
- **Caption/Pinned**：`output/qwen4-preview/tiktok-caption.txt` + `tiktok-pinned-comment.txt` 已生成
- **BGM**：已选 `news-cc-theme04.mp3`（选项 A），用户未拍板 A/B/C
- **HITL 未过**：用户尚未说「发布」。发布前依赖：新 widget `qwen4-benchmarks` 需 Lovable Publish + `verify-widget-a11y`
- **技术债已清理（2026-08-30, `a5b4f22`）**：asset-sourcer 四处搜索 phase 结构重复 → 共享 helper（`shouldSkipByPreFilter` / `shouldSkipByDedup` / `downloadAndRecord`）；relevance 字段散装原语 → `makeRelevance` + `RELEVANCE_SOURCE`；另修复 API phase `keywords[0]` ReferenceError（存量崩溃 bug）。行为不变（330 tests 全绿 + 真实 scene-data 冒烟）。spec/tickets/review 见 `docs/archive/`（`spec-asset-sourcer-techdebt-cleanup.md` / `tickets-asset-sourcer-techdebt-cleanup.md` / `reviews/review-asset-sourcer-techdebt-cleanup.md`）
- 相关 commits：`18ac70b`（管线第一轮）、`eb48293`（内容包）

## 本轮已落地的管线修复（2026-08-29，全部有测试）

| # | 问题 | 修复 | 验证 |
|---|------|------|------|
| 1 | symlink 功能移除后 verify 找不到视频 | `lib/assemble.mjs` 新增 `resolveOutputVideo()`（最新版本化文件优先），两个 verify 脚本改用 | 单测 4/4 |
| 2 | render-only 硬编码 `.mp3`（F5 输出 `.wav`） | 双扩展名探测 | 真实数据跑通 |
| 3 | render-only 无视 `meta.renderer`，对 Remotion 内容跑 Playwright DOM gate（7 场景误杀） | 镜像 main.mjs 的 renderer 分流 | 真实数据跑通 |
| 4 | **文字截断**：`overflow:hidden` 裁切对帧分析不可见；media-split 半宽布局无字符预算；Remotion 字体回退衬线放大宽度 | ① `scene-rules.mjs` `checkTextWidthBudget`（按布局×字号×衬线系数的字符预算，FAIL 级）② `frame-analysis.mjs` `checkClippedText`（右边界亮→暗硬切滑动窗口启发式，WARN 级） | 预算单测 5 + 真实帧 2/2 阳性 6/6 阴性；启发式单测 3 |
| 5 | **自定义 visualType 被 Remotion 静默降级**（"benchmark" 渲染成 narrative 丢字段） | `scene-rules.mjs` `checkVisualTypeWhitelist`（默认 renderer=remotion 时 FAIL；`meta.renderer="playwright"` 跳过） | 单测 3 |
| 6 | **素材被重复自动分配**：撤掉媒体后 main.mjs 下次 run 又会自动塞回 | `main.mjs` Step 1.5 支持 `mediaOptOut: true`（scene-data 声明有意纯 CSS） | 代码审查（本轮真实跑通） |
| 7 | caption 小数截断（"62.5"→"62"） | `lib/caption-utils.mjs` 句界切分改 lookbehind | caption 套件 66/66 |
| 8 | TTS 卡死（HF etag 检查经系统代理挂起 9 分钟） | 文档化 + `HF_HUB_OFFLINE=1`：`docs/video-workflow.md` → TTS Engine Configuration → F5 缓存加载注记 | 真实跑通（30s 加载） |

回归基线：`scene-rules.test.mjs` 126/126、`frame-analysis.test.mjs` 40/40。
文档同步：`docs/content-pipeline.md` MRL-2 表新增 B11（宽度预算）/ B12（visualType 白名单），Blocker 总数 10→12。

## 待办：发布流程（HITL 确认后执行，按序）

1. （用户拍板 BGM A/B/C）A → `node scripts/short-video/mix-bgm.mjs --video <最终mp4> --pipeline-id qwen4-preview`
2. Lovable 编辑器 Publish（部署 `qwen4-benchmarks` widget）→ `npm run dev` + `node scripts/verify-widget-a11y.mjs --preview`（0 FAIL）
3. `node scripts/article/publish-article.mjs --file articles/qwen4-preview.md`（公开）+ `upload-attachments.mjs --post qwen4-preview --files docs/refs/source-materials/qwen4-preview-wechat-article.md`
4. 访问 `/posts/qwen4-preview` 验证 widget/附件/TikTok embed
5. `node scripts/short-video/publish-tiktok.mjs --slug qwen4-preview`（用户需先在 Publora 配置好）
6. 清理旧版本 mp4 + `output/qwen4-preview/` 下 qa-*.png / audit-*.png / debug-*.png / final-*.png 审计产物
7. 手动操作（用户）：AIGC 标签、trending sound、地理标签、pinned comment、首小时回评——清单在 `docs/manual-ops.md`
8. `node scripts/rag/index.mjs` 手动重跑（自动触发因 `currentSourceIds is not defined` 脚本 bug 失败——见 Backlog #4）

## 单独立项 Backlog（用户已认可方向，未排期）

1. **素材相关性重构（最高优先）**。根因：asset-sourcer 按公司实体关键词搜图（`meta.keyEntities.companies[0]`）、轮转分配、VLM 只查品牌适配不查语义相关。改造点：
   - 消费 scene-data 的 `[ASSET NEEDED: 描述]` 标注做 per-scene claim 搜索，公司名只作 fallback
   - 跨内容已用素材索引（扫 `content/*/assets/` + media-cache URL/hash），同源配比上限（建议 ≤40%）
   - VLM 审查 prompt 加入 scene voiceover 主张，相关度低于阈值宁缺毋滥（`mediaOptOut` + 纯 CSS 是合法结果）
   - 参考：本次 S3（支付宝收款码）/S4（气球游行）/S5（欧洲广场）三个零相关案例帧存 `output/qwen4-preview/qa-*.png`
2. **Remotion 字体加载**：渲染环境缺 Helvetica Neue，全片衬线回退（doubao-work 起就是如此）。用 `@remotion/fonts` 打包品牌字体入 `scripts/short-video/remotion/`，或正式把衬线定为品牌渲染基准并同步 `docs/brand-system.md`。二选一，不能悬着。
3. **RAG `scripts/rag/index.mjs` 修复**：`currentSourceIds is not defined`（publish-article 触发链路上的存量 bug）。
4. **基准深挖第二集**（内容向）：episode-evaluator 建议 5 集 vs 实拍 1 集；SWE-bench Pro 62.5 vs Claude 53.4 + AndroidWorld 84.5 vs 62 可撑一集数据对比视频。
5. （轻量）verify-scene-dom 对 Remotion 路径的 DOM 级测量不可行（两套模板实现），帧分析启发式是当前兜底；若未来误报率上升再考虑 Remotion 内渲染 `Interactive.Div` 量宽方案。

## Suggested Skills

`short-video-pipeline`（发布流程）、`brand-system`（视觉）、`writing-for-agents`（改本目录文档时）、`web-access`（发布后验证页面）。
