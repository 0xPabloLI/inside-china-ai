# Spec — Information Layout System v2 (#1398)

Status: active（2026-11-17） · Parent issue: #1398 · Planning scale: S2 · Risk: R3（核心管线、Remotion 渲染、发布元数据）

## Problem Statement

`#1215` 的六种信息版式把「信息镜头没有主角」的几何问题解决了：`stat-reveal.set-piece`、`data.year-source`、`data.chart-card`、`contrast.split`、`context.flow`、`info-card.array` 都有可测的 focal object，空场门禁也从 WARN 翻成 FAIL。

但它们仍是**构图壳**，不是信息设计系统：

- 没有「数据关系 → 图型」的选择语法。`chart-card` 是一个 440×300 的图片框，不校验图型、坐标轴、单位、数据来源。
- 没有原生图表。唯一的数据图资产是 chart-img 的 800×600 K 线截图，等比缩进 440×300，标签不可读，也无法验证它是否对应当前 claim。
- 没有跨镜叙事。Amini 等对 50 条专业数据视频的编码显示：平均 3 分钟、6 个可视化、48% 时长用于数据可视化；34% 使用 `E+I+PR+`；60% 的 Initial 段已含数据可视化。我们只有单镜动画，没有叙事角色与注意力预算。
- 没有图表完整性门禁。`checkEmptyField` 只判断「有没有主角」，`checkFocusLight` 只判断「谁被点亮」；没有规则判断柱状图是否从零起、单位是否随标注出现、高亮是否只一个、图表是否只是装饰。
- 没有可归因实验。`ab-test-tracker.mjs` 只有自由文本变量与 views/completion；`cohort-report.mjs` 用 caption 词集匹配内容包，无法区分同一脚本的 A/B 版式。TikTok 没有有机 A/B，只有广告侧 Split Testing。

## Solution

新增一层**信息语法**（`scene.info`），把数据关系、图型、数据契约与竖屏几何绑定；新增原生 SVG 图表渲染；新增包级叙事/注意力门禁；新增可落盘的实验框架，支持内部盲评与有机号配对区组。

保留既有版式作为文本侧拓扑。`data.chart-card` 继续支持真实图表 PNG；原生图表走新的 `data.chart` 布局，二者不互相替代。

### 1. 作者 API：`scene.info`

```js
{
  id: 4,
  visualType: "data",
  layout: "chart",
  voiceover: "...",
  texts: {
    label: "VALUATION, $B",
    subtext: "$35B -> $50B IN SIX MONTHS",
    source: "SOURCE: PENGPAI, JULY 29",
  },
  info: {
    relationship: "change-over-time",
    chart: "line",
    data: [
      { label: "JAN", value: 35 },
      { label: "JUL", value: 50 },
    ],
    unit: "B",
    baseline: 0,
    sort: "none",
    highlight: "JUL",
    time: { from: "2026-01", to: "2026-07" },
  },
}
```

Rules:

- `info` only on `visualType: "data"` with `layout: "chart"` — with **one exception**: `chart: "candle"` may also drive a `visualType: "hook"` + `layout: "media-led"` scene, where it fills the 820×619 media band that a chart PNG used to occupy (#1405). A hero-center hook has no band, so it is rejected.
- `info` is additive. Existing `scene.chart` (chart-img K-line pin) keeps its current meaning and schema, and remains the path for every instrument the bake pipeline does not cover (non-HKEX, intraday, annotated drawings).
- `texts.label` is the chart title/claim; `texts.subtext` is the reading; `texts.source` is mandatory for a native chart.
- `data` entries are `{ label, value, value2?, x?, y?, highlight? }`.
- `unit` is required. Values are numbers; formatting is derived (thousands separators, up to 1 decimal unless `decimals` is set).
- `highlight` is a label, not an index; at most one entry may be highlighted.
- `baseline` defaults to 0 for `bar` / `column`; `deviation` requires an explicit baseline.
- `time` is optional; when present, `checkChartClaimAgreement` uses it to verify the VO's year/month window overlaps.

### 2. Relationship → chart

| relationship | allowed charts | default | notes |
| --- | --- | --- | --- |
| `magnitude` | `bar`, `column`, `dot-plot` | `bar` | bar labels above the bar, never rotated; column must start at 0 |
| `ranking` | `bar`, `dot-plot`, `slope` | `bar` | sort `desc` by default; highlight at most one |
| `change-over-time` | `line`, `column`, `slope`, `candle` | `line` | preserve input order; 2–6 points in 40–70s; `candle` is the daily-OHLC variant (5–260 bars) |
| `part-to-whole` | `proportion-bar` | `proportion-bar` | one stacked bar, direct labels, no pie |
| `deviation` | `bar`, `column` | `bar` | explicit baseline; diverging around it |
| `distribution` | `dot-plot`, `column` | `dot-plot` | pre-binned; 5–12 points |
| `correlation` | `scatter` (phase 2) | — | not in v2 native; use a real chart image with `chart-card` |
| `flow` | — | — | use `visualType: "context"`, `layout: "flow"` |
| `spatial` | — | — | use a real map image; never invent geography |

`scatter` and `histogram` are registered as known-but-not-yet-native; `validateInfoSpec` returns a clear error telling the author to use `chart-card` with a real chart asset.

### 2b. Candle（K 线，#1405）

K 线不是「12 个以内的已知数值」，而是**一整段已收盘的日线**。它走同一套 `info`，但数据形状与门禁不同：

```js
info: {
  relationship: "change-over-time",
  chart: "candle",
  entity: "zhipu",                   // bake 契约：实体的 ticker 由 chart-symbols.json 解析
  dataFile: "data/2513-daily.json",  // bake 契约：包内数据文件（`symbol` 亦可直接写 EXCHANGE:SYMBOL）
  data: [/* 由 readBakedCandleSeries 读入的 rows */],
  unit: "HK$",
  time: { from: "2026-06-01", to: "2026-11-12" }, // 镜头 claim 的窗口
  highlight: "2026-06-22",          // 只接受数据里的交易日
  credit: "HKEX CLOSE VIA EASTMONEY · NOV 12", // 画面内署名（必写在图内）
}
```

- `data` 条目是 `{ date, open, high, low, close, volume }`；日期必须唯一且升序，`high`/`low` 必须包住 `open`/`close`，序列不得越出 `time` 窗口。
- `data` 由 `npm run bake:quotes -- <pack>` 从 `content/<pack>/data/*.json` 烘焙：东方财富为主源、腾讯逐根校验，任何一根任何一字段不一致就整体失败（不挑「谁先答」）。渲染期零网络。
- `symbol` + `dataFile` 是**再烘焙契约**，缺一不可；`time.to` 必须是已收盘的交易日，且应等于旁白引用的最新收盘（多含一天就会把下一个收盘画到屏幕上）。
- `highlight` 是日期而非 label；最多一个。图内 amber 标记 + `PEAK · JUN 22` 文案，用来把旁白的峰值锚到一个具体蜡烛。
- 图内必须印 `credit`（来源 + 时点）；`texts.source` 仍必填，但保持短行（长行会把 hook 文本条挤出槽位，TextFit 会拦）。
- 观点/预测不进 K 线：只画已收盘日线，不做盘中、不做未来格子。

### 3. Native chart panel

- Geometry: 820×620 content box at `left: 60, top: 300` (safe zone x[60,880], y[300,920]); source line at `bottom: 210`.
- Default `ChartPanel` is clean: `rgba(245,245,245,0.04)` ground, 1px `rgba(245,245,245,0.12)` border, 12px radius, no grid. A `variant: "terminal"` (3px white border, black ground, #4A4A4A grid) is retained only for A/B tests.
- Chart labels: 40px; values: 40px; title: `texts.label` 60px; source: `texts.source` 40px. No rotation. No label below the 40px metadata floor.
- At most one highlight; all other marks use `COLOR.brand` / neutral; highlight uses `COLOR.amber`; negative uses `COLOR.red`, positive `COLOR.green`.
- One entrance cue per chart: bars grow from baseline, line draws once, proportion segments reveal once. No additional ambient motion.
- SVG only; no third-party chart library. The panel is a pure function of props + `useCurrentFrame()`.

### 4. Gates

| gate | severity | behavior |
| --- | --- | --- |
| `checkInfoSpec` | FAIL | `info` present but layout not `chart`; unknown relationship/chart; chart not allowed for relationship; data length outside range; non-finite value; duplicate labels; missing unit/source; >1 highlight; bar/column baseline ≠ 0 for magnitude/ranking; part-to-whole sum ≤0 or `%` sum not ≈100 |
| `checkChartPinContract` | FAIL | existing `scene.chart` pin: entity resolves in `config/chart-symbols.json`; annotations array ≤3 and well-formed; range/interval/theme are strings; this replaces the late Step 1.5 throw |
| `checkChartClaimAgreement` | WARN (advisory) | native chart: at least one data label/number appears in VO or `texts`; if `time` present, a year/month token overlaps the VO; K-line pin: `texts.subtext`/`source` must name the unit or claim window |
| `checkNarrativeArc` | WARN (advisory) | pack with ≥4 scenes: exactly one explicit `arcRole: "peak"`; peak midpoint at 35–65% of duration; if the pack has a chart, at least one chart scene precedes the peak; hook is `establisher`, closing scene is `release` |
| `checkAttentionBudget` | WARN | at most one declared `attention.cue` per scene; 3+ consecutive information scenes with the same `visualType:layout` → warn; a `chart` scene with a `terminal` panel plus another declared cue → warn |

`arcRole` is deliberately a new field. The existing `narrativeRole` already carries the legacy S/T/A/R retention taxonomy (`S` setup, `T` tease, `A` argument, `R` resolution) consumed by `checkOpenLoop` and friends; reusing it for E/I/P/R would silently change those checks. A pack that only has legacy `narrativeRole` gets one advisory row saying the legacy codes do not encode a peak.

`checkInfoSpec` and `checkChartPinContract` enter the blocking runner immediately. `checkChartClaimAgreement` / `checkNarrativeArc` / `checkAttentionBudget` start in the editorial (advisory) bucket; promotion requires real packs at zero findings, as with `#1215` PR-C.

### 5. Experiment framework

Three tiers:

- **L0 static contracts**: `checkInfoSpec`, render fixtures, text fit, source/unit. Must be green before L1.
- **L1 internal blind pairwise review**: `experiment-review.mjs` builds a static HTML packet from still pairs, randomizes left/right by seed, records four 1–7 dimensions (clarity, credibility, memorability, hierarchy), exports JSON. `--analyze <export.json>` joins that export with `key.json` and reports the A−B difference per dimension with a seeded bootstrap CI, sign / Wilcoxon p-values, preference votes with a Wilson interval, and ICC(2,1) once there are two or more raters (a single rater has no agreement to measure). Below 8 pairs the report stays descriptive. No external panel in v1.
- **L2 organic matched-pair field test**: `experiment.mjs` pre-registers, assigns variants by hash within a topic block, ingests TikTok details, runs paired permutation / Wilcoxon / bootstrap, reports MDE and limitations. The protocol below is enforced by the tool, not left to the operator:
  - `create` pre-registers **two co-primary metrics** and the decision rule is an intersection-union test (the treatment must win **both**; no multiplicity correction is needed). A metric cannot be both primary and secondary.
  - `assign --duration <sec>` records each pack's duration and refuses a partner whose gap exceeds 3s: an incomparable pair never enters the log.
  - `ingest` skips a post younger than **T+72h**. Post dates carry day precision (`M/D/YYYY`), so the age used is the **latest plausible posting moment** (end of that UTC day) and the stored `ageHoursLower` is a lower bound.
  - `ingest` also skips a pair whose posts are under **48h apart** (with day-precision dates that is only provable from three calendar days) or whose publish order contradicts the seeded `order`. `--allow-protocol-violations` keeps such a pair but stamps `protocolViolations` on the observation for a labelled sensitivity read.
  - `report` withholds **p-values, confidence intervals and the decision** until the pre-registered pair count is complete (fixed n, no peeking). The two co-primaries share **one** gate: while either is short of the target, neither prints inference — the win-rate Wilson interval included. Interim reports print n, means and the MDE only. A pilot whose target sits below the 8-pair floor reports `descriptive-only`, never `mixed`.
  - The sign-flip permutation is **exact through n=20**, the planned sample, so the planned read carries no Monte Carlo error.
  - `check` audits the record before a read (unassigned or duplicated observations, a post stored below T+72h, a block whose durations drifted) and exits non-zero; `report` refuses to run on a record that fails it.
  - The pre-registration is `scripts/short-video/experiments/<id>/experiment.json`, committed before the first pair. `.gitignore` ignores `experiments/**` and re-includes only `*/experiment.json`, so assignments and observations stay out of git while the frozen record is tracked.

Field-test protocol:

- 20 pairs target (40 posts), 2 pairs/week, 10 weeks; 6-pair pilot estimates σ and ρ.
- Same topic, same script, same audio, duration gap ≤3s; only the layout factor changes. (Gap: `assign --duration`.)
- Randomize which variant publishes first; ≥48h apart; same weekday/time window; avoid major news days. (Order and interval: `ingest`.)
- Primary metrics: `full_video_watched_rate` and `ln(average_time_watched)`; secondary: retention@50% duration, shares/reach, comments/reach (BH-FDR). (Co-primaries: `create`.)
- Read at T+72h; T+7d only sensitivity. Fixed n; no peeking. Report n, effect, 95% CI, p, MDE, and limitations. (Maturity and peeking: `ingest` / `report`.)
- n<8: descriptive only, no conclusion. At n=20, ρ≈0.5, MDE ≈ +28% (ln scale 0.25); this is a structural decision tool, not a micro-optimizer.

### 6. Layout signature and attribution

- `lib/layout-signature.mjs`: stable string/hash from every scene's `visualType:layout` plus `info.relationship/chart`; `INFO_LAYOUT_VERSION = "v2"`.
- `pending-analysis.json` gains `slug`, `layoutSignature`, `infoLayoutVersion`, `experimentId` (nullable), `variant` (nullable). Existing keys stay unchanged.
- `meta.mjs` may export `experiment` but is not required; the pipeline computes the signature from `scenes`.

## Modified Files Impact（R3）

- New: `lib/info-grammar.mjs`, `lib/experiment-stats.mjs`, `lib/layout-signature.mjs`, `remotion/src/components/charts/*`, `experiment.mjs`, `experiment-review.mjs`, tests, spec/research docs.
- Modified: `remotion/src/types.ts` (SceneData + InfoSpec), `remotion/src/scenes/DataScene.tsx` (`chart` layout), `remotion/src/components/charts/*` (native chart renderer, panel, tokens, formatters), `lib/text-slots.mjs` (`info` layout slot map), `lib/type-scale.mjs` (`data.chart` focal), `lib/scene-rules.mjs` (gates + runner), `lib/publish-utils.mjs` / `publish-tiktok.mjs` (pending metadata), `scene-gate-fixture.tsx` + `scene-gate-render.test.mjs` (new baselines), docs.
- Existing consumers: `ShortVideo.tsx` dispatch unchanged; `checkEmptyField` sees `data.chart` focal; `cohort-report` ignores new fields until extended; `tiktok-upload-prep` writes pending analysis via shared builder.
- R3 follow-up (blind-review payoff): new `lib/blind-review-analysis.mjs`; modified `experiment-review.mjs` (`--analyze` / `--key` / `--labels` / `--out`; `--manifest` unchanged) and `lib/experiment-stats.mjs` (`icc21`). Risk: an under-powered analysis gets quoted as a verdict. Mitigation: single rater reports `n/a` instead of ICC; a dimension under 8 pairs withholds its p-values; the report always prints the pair count it used.
- Worst consequence of a mistake: a native chart renders wrong data/units or a gate blocks a legal pack. Mitigation: schema fail-closed at preflight; `chart-card` path untouched; new layout only opt-in; pixel fixtures cover each chart type; `checkInfoSpec` tests against real packs.

## Behavioral Scenarios（R3）

| # | 场景 | 期望 |
| --- | --- | --- |
| S1 | `data` + `layout:"chart"` + valid `info` | 820×620 native chart renders; title/source gates pass; one highlight |
| S2 | `info.relationship:"part-to-whole"`, `unit:"%"`, values sum 100 | proportion bar segments fit; direct labels; no pie |
| S3 | `info.chart:"bar"` with baseline 20 for magnitude | `checkInfoSpec` FAIL; message names FT zero-baseline rule |
| S4 | `info` on `visualType:"contrast"` | FAIL; author must use a text-side topology or change visualType |
| S5 | `layout:"chart"` without `info` | FAIL; no silent fallback to `hero-center` |
| S6 | existing `data.chart-card` image pack | unchanged render; no new gate failure |
| S7 | existing `scene.chart` K-line pin with 4 annotations | `checkChartPinContract` FAIL at preflight, not Step 1.5 |
| S8 | pack with no explicit peak (including legacy S/T/A/R only) | `checkNarrativeArc` WARN (advisory), not fail |
| S9 | experiment n=5 | report prints descriptive rows and "no conclusion"; no p-value claim |
| S10 | experiment all pairs same direction, n=6 | sign/permutation p≈0.031; report calls it "directional, small n" |
| S11 | publish a v2 pack | `pending-analysis.json` carries slug + layoutSignature + v2 version |
| S12 | old pack re-render | no visual change; layout signature still computed |
| S13 | reviewer export + `key.json`，某对左右已翻转 | `--analyze` 按 key 还原变体：left 偏好记给 key 的 left 变体，A−B 差值符号随 key 翻转 |
| S14 | 只有一位评分者 | 报告写 `single rater: agreement needs at least two`，不打印 ICC 行，不伪造一致性数字 |
| S15 | 某对只有一侧打分，或某维度不足 8 对 | 该对不进配对差值（不跨评分者拼 A/B）；该维度 p 值留空并标 `*`，报告只作描述 |

## Testing Decisions

- Pure Node: `info-grammar.test.mjs` (relationship/chart matrix, data bounds, zero baseline, part-to-whole, highlight, errors), `chart-claim-agreement.test.mjs` (value/label anchor, year-vs-small-number boundary, time window, pin window, advisory wiring), `experiment-stats.test.mjs` (n<8, all-same-direction, zero variance, missing values, Wilson CI, BH), `layout-signature.test.mjs` (stable, order-sensitive), `narrative-attention.test.mjs` (arc/attention gate severity and message).
- Render: add `topology-chart-bar`, `topology-chart-deviation`, `topology-chart-line`, `topology-chart-slope`, `topology-chart-proportion` to `BASELINE_SCENES` and `BASELINES`; each is a legal 1080×1920 still. Keep existing `topology-chart-card` untouched.
- Real data: 4 packs; `verify-video --pre` 0 FAIL; render stills; inspect labels/units/highlight.
- Experiment: fixture JSONL observations; CLI `create/assign/ingest/report`; golden report with n=20 synthetic rows.
- Blind review: `blind-review-analysis.test.mjs` (key mapping incl. flipped pairs, tie/unrated accounting, single-rater ICC refusal, identical vs mirrored raters, per-dimension floor suppression, cross-rater A/B mixing guard) plus a CLI run that writes `report.json`; `experiment-stats.test.mjs` covers `icc21` degenerate inputs.
- Docs: `lint:docs`.

## Out of Scope

- Native scatter/histogram/flow/spatial charts; use real chart assets or existing topologies in v2.
- TikTok Ads Split Testing integration (paid); protocol documented, not automated.
- External paid review panel.
- Cross-platform layout unification.
- Auto-publishing; HITL unchanged.

## Rollout / Tickets

1. `01-experiment-plumbing`: stats + CLI + layout signature + pending metadata + tests. No render change.
2. `02-native-charts`: info grammar + schema + 6 native chart components + `data.chart` + gates + fixtures + 4 pack migrations.
3. `03-narrative-attention`: narrative/attention gates + `arcRole` + advisory wiring + real-pack audit.
4. `04-evidence-author-docs`: research doc + author guide + brand-system chart section + docs index.
5. `05-migration-blind-review`: remaining pack migrations + blind-review packet + report. The blind-review half runs as sub-issue #1406 (scoring plus `report.json`); the migration half stays local.

Tickets stayed local while GitHub sub-issues were unauthorised; the blind-review half now runs as native sub-issue #1406 under #1398. Each ticket is a vertical slice with its own demo and acceptance.

## Delivery Status（2026-11-16）

- **已落地**：`scene.info` + `data.chart` + 6 个原生图表；`checkInfoSpec`（FAIL）、`checkChartPinContract`（FAIL）、`checkChartClaimAgreement` / `checkNarrativeArc` / `checkAttentionBudget`（advisory）；布局签名与发布元数据；实验 CLI；盲评包生成。
- **盲评分析入口（2026-11-17 补）**：`experiment-review.mjs --analyze` 已落地——变体映射走 `key.json`，四维 A−B + 种子化 bootstrap CI + sign/Wilcoxon + 偏好 Wilson 区间；≥2 位评分者自动补 ICC(2,1)，单人记 `n/a`，n<8 只出描述性结论。评分与报告的执行范围登记为子票 **#1406**。
- **真实包**：49 个 content pack 新增门禁 0 FAIL；45 个包无 `arcRole`（advisory），4 个包连续 3 个同版式信息镜（advisory）。4 个迁移包 `kimi-ipo` / `deepinfer` / `china-us-token-divide` / `zhipu-valuation` 的 `verify-video --pre` 均为 0 FAIL；`checkChartClaimAgreement` 对 Kimi 时间窗和 DeepInfer 的「nearly in half」各给 1 条 advisory（未改文案）。
- **盲评**：`output/experiments/info-layout-v2-blind-review/index.html` 已生成 6 对（seed 20261116，左右随机），`key.json` 只在分析师侧。**人类评分尚未收集**；ICC、win rate 与「原生图表更好」的结论均未产生。
- **未完成**：S5 的 ≥6 对离线盲评需要评审实际打分；L2 有机配对实验需要发布 20 对（约 10 周）。本 spec 不把待收集数据写成结果。
