# Visual Design Loop — Impeccable Iteration for Video Templates

## Why

视觉设计没有唯一的"最优"——但有客观标准可以判断"不够好"。Impeccable skill 提供了 5 维度审查框架，但一轮审查总有遗漏。需要 loop（审查 → 修复 → 再审查）直到收敛。

本文档定义：哪些场景触发 loop、loop 的步骤、客观判定标准、以及哪些检查已固化为自动化工具。

## When

**触发条件**：修改以下任一文件时必须走 loop：

- `remotion/src/scenes/*.tsx` — Remotion 场景组件（实际渲染的代码）
- `remotion/src/components/visuals.tsx` — 共享视觉组件（StatCard、BadgePill 等）
- `lib/text-slots.mjs` — 字号契约（`SLOT_FIELDS`）
- `lib/safe-zones.mjs` — 画布 / 安全区 / 槽位几何常量
- 任何影响 scene 视觉间距/字号/层次结构的改动

**不触发**：纯文案修改、颜色值替换、动画 timing 调整（不涉及间距/字号/层次）。

## How

### Loop 步骤

每轮 loop 包含 4 步，重复直到 Step 4 无新问题：

#### Step 1: 审查（Assess）

用 Impeccable `layout.md` 的 5 维度逐个检查所有间距关系：

| 维度                 | 检查内容                                                                               | 客观标准                                                 |
| -------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Spacing**          | 所有 margin/gap 在 8px scale 上？                                                      | 值 ∈ {8, 16, 24, 32, 48, 64}；padding 在 4px scale 上    |
| **Visual Hierarchy** | 字号层次分明？squint test 通过？                                                       | 相邻层级 ratio ≥ 1.25×；同 zone 内无相同字号             |
| **Rhythm**           | tight/medium/generous 交替？                                                           | 组内 tight (8-12px)、组间 medium (24px) 或 large (32px+) |
| **Density**          | slot 占用率合理？                                                                      | 60-99% slot 高度；不溢出 safe zone                       |
| **Consistency**      | 间距/字号值与 `lib/safe-zones.mjs`（几何）、`lib/text-slots.mjs`（字号）单一真源一致？ | 无硬编码重复值                                           |

**工具支持**（自动执行）：

```bash
# 几何强制（安全区 + 溢出 + 换词）在渲染时由 TextGate 执行：
# 渲染即验证，任何越界场景直接 fail
node scripts/short-video/render-only.mjs --content _gate-smoke
```

**人工审查**（Agent 执行）：

- 读取 React 组件源码，构建完整间距矩阵
- 对照 5 维度标准逐项检查
- 对每个不达标项，给出：问题描述 + 当前值 + 建议值 + 理由

#### Step 2: 修复（Fix）

- 一次性修复本轮发现的所有问题（Remotion 组件是唯一渲染源，无需双端同步）

#### Step 3: 验证（Verify）

```bash
# TypeScript 类型检查
cd scripts/short-video/remotion && npx tsc --noEmit

# 渲染验证（TextGate 在渲染中强制几何）
node scripts/short-video/main.mjs --content _test-fixtures/hook-standard --skip-preflight --skip-verify
```

全 pass 后进入 Step 4。任一 fail 则回 Step 2 修复。

#### Step 4: 再审查（Review）

重新执行 Step 1 的 5 维度审查。**重点检查**：

- 本轮修复是否引入了新的 off-scale 值？
- 修复一个间距后，与其他间距的比例关系是否还合理？
- 字号改动后，层次 ratio 是否仍 ≥ 1.25×？

**收敛条件**：Step 4 无新问题 → loop 结束。
**最大轮次**：3 轮。超过 3 轮仍有问题，暂停并向用户报告剩余问题。

### 客观判定标准

以下标准不依赖人的视觉感觉，Agent 可自行判断：

#### 8px Scale（间距）

| 属性                       | 规则            | 自动检查 |
| -------------------------- | --------------- | -------- |
| margin-top / margin-bottom | 必须是 8 的倍数 | 代码审查 |
| gap (flex/grid)            | 必须是 8 的倍数 | 代码审查 |
| padding                    | 必须是 4 的倍数 | 代码审查 |

#### Hierarchy Ratio（字号层次）

| 属性                     | 规则                   | 判定方式 |
| ------------------------ | ---------------------- | -------- |
| 相邻字号 ratio           | ≥ 1.25×                | 代码审查 |
| 同一 slot 内相同字号     | 不允许（除非角色不同） | 代码审查 |
| 同一视觉 zone 内字号差异 | < 1.1× = 层次不足      | 代码审查 |

#### Slot Fit（密度）

| 属性                 | 规则            | 自动检查               |
| -------------------- | --------------- | ---------------------- |
| 内容不溢出 safe zone | bottom ≤ 1150px | TextGate（渲染时强制） |
| slot 占用率          | 60-99%          | 代码审查               |

#### Sync（一致性）

> Remotion 是唯一渲染器后（决策 59，2026-09-01），不再有 React ↔ HTML 双源，原 `verify-template-sync.mjs` 随 HTML 路径退役（归档已于 2026-09-20 删除）。一致性现在由单一真源保证：几何/安全区常量只在 `lib/safe-zones.mjs` 定义，字号契约只在 `lib/text-slots.mjs` 定义，字号**档位**只在 `lib/type-scale.mjs` 定义（`text-slots.mjs` 管每个字段用多大，`type-scale.mjs` 管这些尺寸必须落在哪一档）。（`lib/scene-layout.mjs` 是已退役的 HTML 路径固定槽位网格，无生产消费方，不作为真源。）

#### Type scale（尺寸三档，2026-11-10 · #739）

竖屏尺寸分三档，**档位之外没有第四种设计尺寸**。档位是 `lib/type-scale.mjs` 的 `TYPE_TIERS`（`tokens.ts` 经 `TYPE.tiers` 重新导出同一对象；当前没有场景直接消费，档位先以契约形式落地），每个 `SLOT_FIELDS[field].preferredSize` 必须落在其中一档：

| 档位       | 竖屏像素 | 用途                                  |
| ---------- | -------- | ------------------------------------- |
| label      | 40–48    | 标签、chip、出处等元数据（#688 地板） |
| supporting | 60–110   | 主文案与配角对象                      |
| hero       | 150+     | 镜头的主角对象（大数字 / set piece）  |

两段空隙（49–59、111–149）是刻意的：设计尺寸落在空隙会让契约测试（`__tests__/type-scale.test.mjs`）变红。没有运行时门禁——渲染端只读声明尺寸，测试就是守卫。缩小阶梯（TextGate 为长文案在 `preferredSize → minSize` 之间降到 52px）不属于设计尺寸，不参与档位判定。

档位数值、竖屏重算过程与「第二主角形式」不采纳的理由见本文件 `## Design Decisions & References`；来源规则与许可分档见 `docs/research/repo-survey-tracking.md` §C，代码侧推导记在 `lib/type-scale.mjs` 模块头。

**空场判据**：`checkEmptyField`（`lib/scene-rules.mjs`）对 `data` / `stat-reveal` / `contrast` / `info-card` / `context` 五种信息类 scene 取「已声明文本对象的最大 `preferredSize`」，低于 110px（supporting 档上限）且持续超过 45 帧即 **WARN**——镜头没有主角，只有小字与小 chip。判的是声明尺寸而不是渲染像素；渲染 `media` 层的镜头直接跳过（素材本身就是内容区最大物体；`data`/`stat-reveal` 不渲染媒体、声明了也照判，缺素材归 `final-media-gate`）。持续窗口在 post-render 用 `audio/scene-durations.json` 换算成**成片 clip 帧数**（`sceneClipFrames()`，含 0.5s 录音缓冲）；preflight 在 TTS 之前，以整镜为窗口。修法（信息图版式拓扑）是 #739 的后续半段，由 `#1215` 承接——#739 裁决里的四种拓扑在那里展开为六种量化版式 +「多」用矩阵；落地前该 WARN 是**具名设计债**，不是渲染阻断。

**作者侧纪律**：写 `scene-data.mjs` 的信息类 scene 时，按类型指定主角——`data` / `stat-reveal` 用 `stat` / `bigNumber`（hero 档 240px；这两类不渲染媒体，`media.path` 无效）；`contrast` / `info-card` / `context` 用会渲染的 `media.path`（满幅环境底是这三个模板今天唯一的主角来源，文本侧主槽要等 `#1215` 的版式补齐）。`title` 的 60px 属配角档，替代不了主角。`verify-video.mjs --pre` 在 TTS 之前用同一条判据点名缺主角的镜头。

#### 主角光（light follows the subject，2026-11-10 · #738）

画面里的光只有三层，**没有第四种**，且光的数量与转移受预算约束。单一真源是 `lib/focus-light.mjs`（`LIGHT_TIERS` / `FOCUS_LIGHT` / `LIGHT_PLANS`），渲染端 `useFocusLight()` 与 preflight 的 `checkFocusLight()` 读同一份对象：

| 层     | 是什么                         | 行为                                             |
| ------ | ------------------------------ | ------------------------------------------------ |
| bloom  | 结构线（画框边）               | 常驻，最暗；**不再有全屏 inset 泛光**            |
| soft   | 柔光：主角常亮 + 当前重点      | 主角静止在 `level 0.55`，当前重点 `1.0`          |
| flash  | 白闪事件                       | 落在拍点上，3–6 帧内衰减到 0                     |

- **「受光主角」与「空场判据的主角对象」是两个问题**：这里的主角是「光跟谁走」，由模板声明，可以是一个 60–110px 的标题；空场判据问的是「内容区最大物体够不够大」，`contrast` / `info-card` / `context` 的文本侧主角今天仍判具名设计债（#1215 补版式）。光跟着它，不等于宣称它是 hero 档。
- **主角必带光，配角默认不发光**：主角由**模板显式声明**（`LIGHT_PLANS[visualType].protagonist`，HITL 2026-11-09 裁定「scene 显式声明」，不作 `focusAnalysis` 自动判定）。互斥变体（hook 的 `bigNumber` / `hookText`）按优先级取第一个实际声明的字段。
- **一帧内重点 ≤1**：每个模板的 `beats` 按时间排序、每个 target 只出现一次；拍点之间的间隔必须 ≥ `FOCUS_LIGHT.transferOffFrames`（8 帧），因此任一帧最多一个 target 处于 `level 1`。违反即 `resolveLightTimeline()` 抛错——渲染失败，而不是「风格不佳」。
- **转移灭灯 8 帧**：新拍点亮起的那一帧，前一处已经离开 `level 1`，并在 8 帧内线性退回它的静止值（主角退回 0.55，配角退回 0）。衰减跑在 shadow alpha 上，内容本身不降透明度。
- **光落在元素自己身上**（`textShadow` / `boxShadow`；纯图形未来用 `drop-shadow`，当前没有图形主角），不是额外的一层定位 div：Remotion 没有布局 pass，任何「测量主角盒子」的做法都要么拿不到值、要么变成第二个真源；而 style 不参与布局，TextGate 的 fit 契约看到的盒子与改动前逐像素相同。
- **背景色不是光**：`<Glow>` 是底色（blue corner vignette，0.10），与 `GridBg` / `Scanlines` 同层，不标记主体；要「让某物跳出来」只能用 `useFocusLight`。`FrameGlow` 只剩 3px 结构线，它的全屏 inset 泛光就是本票要修的那个缺陷。
- **被删掉的是「第二盏主光灯」**：`data` / `stat-reveal` / `quote` / `hook` 原来各自手写了一个 0.12–0.15 的 amber/red 角部 radial，颜色与主角光同源、位置与内容无关——那是第二盏同色溢光灯，不是底色，随本票一并删除。保留的是模板已声明的 blue 底色（`<Glow>`，0.10），两者区别就是「零点一几的品牌底色」与「零点一几的主角同色光」。

可校验面：`checkFocusLight`（preflight，WARN：某镜的声明的字段没渲染 → 镜头没有受光主体；`fail`：plan 本身违反预算），以及渲染期 `resolveLightTimeline()` 的硬抛错。来源规则见 `docs/research/repo-survey-tracking.md` §C 第 2 条，许可分档（PolyForm Noncommercial，只吸收规则）与「不吸收紫色配色」的决定记在 `lib/focus-light.mjs` 模块头。

### 间距语义角色参考

修改间距时，先判断关系的语义角色，再选 scale 档位：

| 语义角色                         | scale 档位      | 示例                    |
| -------------------------------- | --------------- | ----------------------- |
| tight grouping（组内兄弟元素）   | 8px (8×1)       | StatCard num → label    |
| small（主从关系）                | 16px (8×2)      | bigNumber → numberLabel |
| medium（独立 focal 点）          | 24px (8×3)      | claim → reveal          |
| large（组间分隔）                | 32px (8×4)      | subject → focal         |
| group separation（不同性质信息） | 24-32px (8×3~4) | stats → source          |

### 已知 off-scale 值（遗留，非阻塞）

以下值不在 8px scale 上但属于 brand chrome（非内容元素），暂不修改：

| 元素            | 属性    | 当前值 | 说明                     |
| --------------- | ------- | ------ | ------------------------ |
| `.briefing-tag` | padding | 5px    | brand bar 内，非内容     |
| `.badge-pill`   | gap     | 10px   | badge 内 dot + text 间距 |

## 工具索引

| 工具               | 路径                                                          | 作用                                                      |
| ------------------ | ------------------------------------------------------------- | --------------------------------------------------------- |
| TextGate           | `scripts/short-video/remotion/src/` + `lib/text-geometry.mjs` | 渲染时几何强制（安全区、溢出、换词）                      |
| `checkEmptyField`  | `scripts/short-video/lib/scene-rules.mjs`                     | 信息类 scene 空场判据（最大对象 <110px 且 >45 帧 → WARN） |
| `useFocusLight`    | `remotion/src/components/focus-light.tsx`                     | 主角光/重点光/白闪的唯一取光入口（读 `LIGHT_PLANS`）      |
| `checkFocusLight`  | `scripts/short-video/lib/scene-rules.mjs`                     | 主角光判据（无受光主体 → WARN；plan 违预算 → FAIL）       |
| `render-only.mjs`  | `scripts/short-video/`                                        | 快速渲染验证（`--content _gate-smoke`）                   |
| `impeccable` skill | `.agents/skills/impeccable/`                                  | 5 维度设计审查框架（layout.md）                           |

## Design Decisions & References

- **8px scale 选择**：基于 Impeccable `layout.md` 的"consistent spacing scale"原则。4px base 太细（8 和 16 之间需要 12），8px base 在视频画布（1080×1920）上粒度合适。
- **loop 最大 3 轮**：实践中第 1 轮发现主要问题，第 2 轮发现修复引入的次生问题，第 3 轮应收敛。超过 3 轮说明设计本身有结构性问题，需要人介入。
- **自动化 vs 人工**：几何越界由 TextGate 在渲染时确定性拦截（自动化）；间距 scale、层次 ratio 和语义角色判断需要上下文理解（人工/Agent 审查）。两者结合：工具挡住低级错误，人工审查挡住设计判断错误。
- **尺寸三档的竖屏重算（#739）**：源规则来自 anything2explainer `reference/composition-and-light.md` §1/§6（1280×720 横屏：主角 ≥170 / 配角 60–110 / 标签 22–30），按 1080×1920 重算才可用：hero 下限取契约里的大数字地板 150（170 × 1080/1280 = 143.4，契约地板 150 高于该重算值，实际由 `SLOT_FIELDS.bigNumber.minSize` 定）；supporting 保持 60–110（我方 lead class 60–80 在带内，110 同时是空场线）；label 重锚到 #688 的可读地板 40/48（源值的 19–25px 在手机上不可读，#688 优先）。源值的**第二主角形式**（大字 ≥96px 且整行宽 ≥300px）不采纳：重算后约 81px / 253px 落在 supporting 带内，会把 60–110px 的通栏标题全部算成主角、废掉空场判据；宽度型主角属于信息图版式拓扑（`#1215`：四种拓扑展开为六种量化版式 +「多」用矩阵），由版式而不是字号定义。
- **主角光的三处偏离（#738）**：源规则用紫色 key colour 与「光层」组件；我方① 配色换成品牌令牌（amber / blue，narrative 的红色 register 沿用现有 `glowColor`），不复制其紫；② 光落在元素的 `textShadow` / `boxShadow` 上而不是额外定位层——Remotion 无布局 pass，测量主角盒子必然引入第二个真源，而 style 不参与布局，TextGate 的 fit 契约因此逐像素不变；③ 主角判定按 HITL 2026-11-09 用**模板显式声明**（`LIGHT_PLANS`）而不是 `focusAnalysis` / `protectedRegions` 自动判定——后者描述裁切位置，不是「这镜在讲什么」。`FrameGlow` 的全屏 inset 泛光被移除、只留 3px 结构线；背景 corner tint（`<Glow>`）保留为底色，但它不是光。
