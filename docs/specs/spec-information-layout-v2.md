# Spec — Information Layout System v2 (#1398)

Status: active（2026-11-16） · Parent issue: #1398 · Planning scale: S2 · Risk: R3（核心管线、Remotion 渲染、发布元数据）

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

- `info` only on `visualType: "data"`; `layout` must be `"chart"`.
- `info` is additive. Existing `scene.chart` (chart-img K-line pin) keeps its current meaning and schema.
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
| `change-over-time` | `line`, `column`, `slope` | `line` | preserve input order; 2–6 points in 40–70s |
| `part-to-whole` | `proportion-bar` | `proportion-bar` | one stacked bar, direct labels, no pie |
| `deviation` | `bar`, `column` | `bar` | explicit baseline; diverging around it |
| `distribution` | `dot-plot`, `column` | `dot-plot` | pre-binned; 5–12 points |
| `correlation` | `scatter` (phase 2) | — | not in v2 native; use a real chart image with `chart-card` |
| `flow` | — | — | use `visualType: "context"`, `layout: "flow"` |
| `spatial` | — | — | use a real map image; never invent geography |

`scatter` and `histogram` are registered as known-but-not-yet-native; `validateInfoSpec` returns a clear error telling the author to use `chart-card` with a real chart asset.

### 3. Native chart panel

- Geometry: 820×620 content box at `left: 60, top: 340` (safe zone x[60,880], y[340,960]); source line at `bottom: 210`.
- Default `ChartPanel` is clean: `rgba(255,255,255,0.04)` ground, 1px `rgba(255,255,255,0.12)` border, 12px radius, no grid. A `variant: "terminal"` (3px white border, black ground, #4A4A4A grid) is retained only for A/B tests.
- Chart labels: 40px; values: 48px; title: `texts.label` 60px; source: `texts.source` 40px. No rotation. No label below the 40px metadata floor.
- At most one highlight; all other marks use `COLOR.brand` / neutral; highlight uses `COLOR.amber`; negative uses `COLOR.red`, positive `COLOR.green`.
- One entrance cue per chart: bars grow from baseline, line draws once, proportion segments reveal once. No additional ambient motion.
- SVG only; no third-party chart library. The panel is a pure function of props + `useCurrentFrame()`.

### 4. Gates

| gate | severity | behavior |
| --- | --- | --- |
| `checkInfoSpec` | FAIL | `info` present but layout not `chart`; unknown relationship/chart; chart not allowed for relationship; data length outside range; non-finite value; duplicate labels; missing unit/source; >1 highlight; bar/column baseline ≠ 0 for magnitude/ranking; part-to-whole sum ≤0 or `%` sum not ≈100 |
| `checkChartPinContract` | FAIL | existing `scene.chart` pin: entity resolves in `config/chart-symbols.json`; annotations array ≤3 and well-formed; range/interval/theme are strings; this replaces the late Step 1.5 throw |
| `checkChartClaimAgreement` | WARN then FAIL | native chart: at least one data label/number appears in VO or `texts`; if `time` present, a year/month token overlaps the VO; K-line pin: `texts.subtext`/`source` must name the unit or claim window |
| `checkNarrativeArc` | WARN then FAIL | pack with ≥4 scenes: exactly one explicit `narrativeRole: "peak"`; peak at 35–65% of duration; at least one `info`/`chart` scene before peak for data packs; hook is establisher, CTA is release |
| `checkAttentionBudget` | WARN | at most one declared `attention.cue` per scene; 3+ consecutive information scenes with the same layout → warn; a `chart` scene with a `terminal` panel plus a second decorated layer → warn |

`checkInfoSpec` and `checkChartPinContract` enter the blocking runner immediately. `checkChartClaimAgreement` / `checkNarrativeArc` / `checkAttentionBudget` start in the editorial (advisory) bucket; promotion requires real packs at zero findings, as with `#1215` PR-C.

### 5. Experiment framework

Three tiers:

- **L0 static contracts**: `checkInfoSpec`, render fixtures, text fit, source/unit. Must be green before L1.
- **L1 internal blind pairwise review**: `experiment-review.mjs` builds a static HTML packet from still pairs, randomizes left/right by seed, records four 1–7 dimensions (clarity, credibility, memorability, hierarchy), exports JSON. No external panel in v1.
- **L2 organic matched-pair field test**: `experiment.mjs` pre-registers, assigns variants by hash within a topic block, ingests TikTok details, runs paired permutation / Wilcoxon / bootstrap, reports MDE and limitations.

Field-test protocol:

- 20 pairs target (40 posts), 2 pairs/week, 10 weeks; 6-pair pilot estimates σ and ρ.
- Same topic, same script, same audio, duration gap ≤3s; only the layout factor changes.
- Randomize which variant publishes first; ≥48h apart; same weekday/time window; avoid major news days.
- Primary metrics: `full_video_watched_rate` and `ln(average_time_watched)`; secondary: retention@50% duration, shares/reach, comments/reach (BH-FDR).
- Read at T+72h; T+7d only sensitivity. Fixed n; no peeking. Report n, effect, 95% CI, p, MDE, and limitations.
- n<8: descriptive only, no conclusion. At n=20, ρ≈0.5, MDE ≈ +28% (ln scale 0.25); this is a structural decision tool, not a micro-optimizer.

### 6. Layout signature and attribution

- `lib/layout-signature.mjs`: stable string/hash from every scene's `visualType:layout` plus `info.relationship/chart`; `INFO_LAYOUT_VERSION = "v2"`.
- `pending-analysis.json` gains `slug`, `layoutSignature`, `infoLayoutVersion`, `experimentId` (nullable), `variant` (nullable). Existing keys stay unchanged.
- `meta.mjs` may export `experiment` but is not required; the pipeline computes the signature from `scenes`.

## Modified Files Impact（R3）

- New: `lib/info-grammar.mjs`, `lib/experiment-stats.mjs`, `lib/layout-signature.mjs`, `remotion/src/components/charts/*`, `experiment.mjs`, `experiment-review.mjs`, tests, spec/research docs.
- Modified: `remotion/src/types.ts` (SceneData + InfoSpec), `remotion/src/scenes/DataScene.tsx` (`chart` layout), `remotion/src/components/topology.tsx` (ChartPanel/variant), `lib/text-slots.mjs` (`info` layout slot map), `lib/type-scale.mjs` (`data.chart` focal), `lib/scene-rules.mjs` (gates + runner), `lib/publish-utils.mjs` / `publish-tiktok.mjs` (pending metadata), `verify-video.mjs` (gate wiring), `scene-gate-fixture.tsx` + `scene-gate-render.test.mjs` (new baselines), docs.
- Existing consumers: `ShortVideo.tsx` dispatch unchanged; `checkEmptyField` sees `data.chart` focal; `cohort-report` ignores new fields until extended; `tiktok-upload-prep` writes pending analysis via shared builder.
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
| S8 | pack with no explicit peak | `checkNarrativeArc` WARN (advisory), not fail |
| S9 | experiment n=5 | report prints descriptive rows and "no conclusion"; no p-value claim |
| S10 | experiment all pairs same direction, n=6 | sign/permutation p≈0.031; report calls it "directional, small n" |
| S11 | publish a v2 pack | `pending-analysis.json` carries slug + layoutSignature + v2 version |
| S12 | old pack re-render | no visual change; layout signature still computed |

## Testing Decisions

- Pure Node: `info-grammar.test.mjs` (relationship/chart matrix, data bounds, zero baseline, part-to-whole, highlight, errors), `experiment-stats.test.mjs` (n<8, all-same-direction, zero variance, missing values, Wilson CI, BH), `layout-signature.test.mjs` (stable, order-sensitive), `scene-rules-info.test.mjs` (gate severity and message).
- Render: add `topology-chart-bar`, `topology-chart-line`, `topology-chart-slope`, `topology-chart-proportion` to `BASELINE_SCENES` and `BASELINES`; each is a legal 1080×1920 still. Keep existing `topology-chart-card` untouched.
- Real data: 4 packs; `verify-video --pre` 0 FAIL; render stills; inspect labels/units/highlight.
- Experiment: fixture JSONL observations; CLI `create/assign/ingest/report`; golden report with n=20 synthetic rows.
- Docs: `lint:docs`.

## Out of Scope

- Native scatter/histogram/flow/spatial charts; use real chart assets or existing topologies in v2.
- TikTok Ads Split Testing integration (paid); protocol documented, not automated.
- External paid review panel.
- Cross-platform layout unification.
- Auto-publishing; HITL unchanged.

## Rollout / Tickets

1. `01-experiment-plumbing`: stats + CLI + layout signature + pending metadata + tests. No render change.
2. `02-native-charts`: info grammar + schema + 4 native chart components + `data.chart` + gates + fixtures + 2 pack migrations.
3. `03-narrative-attention`: narrative/attention gates + `narrativeRole` + advisory wiring + real-pack audit.
4. `04-evidence-author-docs`: research doc + author guide + brand-system chart section + docs index.
5. `05-migration-blind-review`: remaining pack migrations + blind-review packet + report.

Tickets are local until GitHub sub-issues are authorized. Each ticket is a vertical slice with its own demo and acceptance.
