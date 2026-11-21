/**
 * Shot recipe cards (#733, S1) — one editorial card per (visualType, layout)
 * the renderer can actually draw.
 *
 * Why this layer exists: `scenes/` is organised by narrative role (hook,
 * narrative, data, contrast …), and each role carries several layouts, but
 * nothing said which layout a given beat should use. The renderer knows how to
 * draw 21 combinations; the writer had to rediscover that surface from the
 * components every pack. This module turns the render contract into an
 * addressable catalogue: the card *identity* and its slot/typography groups
 * are derived from `REMOTION_SLOT_MAP` / `resolveRenderLayout`, so the cards
 * cannot drift from the pixels; only the editorial note (`when`,
 * `prerequisite`, `notFor`) and the demo anchor are authored here.
 *
 * Boundaries (S1):
 * - **No renderer changes.** Cards describe combinations the renderer already
 *   draws. A layout that is not in the slot map has no card, by construction.
 * - **No new Scene Data field.** Selecting a card is a Stage 3 authoring
 *   decision, not a second copy of the layout inside scene-data: the layout
 *   field already records it, and `recipeIdForScene` reads that.
 * - **No beat/sub-shot layer.** The SHOTBOOK-style semantic beat (拍) is S2 of
 *   #733; it needs a sub-scene structure and must not be smuggled in as a card
 *   field.
 * - **Hook selection is not restated.** Which hook layout opens the pack is
 *   decided by `lib/hook-layout.mjs` (#1480); the hook cards register the
 *   render contract and point there.
 *
 * Text-first / contain-band facts are not re-derived: they come from
 * `scene-rules.isTextFirstLayoutScene` (#761) and `text-slots.allowsContainFit`
 * (#1075), the predicates the gates themselves use.
 *
 * @module shot-recipes
 */

import { REMOTION_SLOT_MAP, allowsContainFit, resolveRenderLayout } from "./text-slots.mjs";
import { isTextFirstLayoutScene } from "./scene-rules.mjs";

/**
 * Editorial notes keyed by `"<visualType>/<layout>"`.
 *
 * Each note answers, for a beat the writer is about to place:
 *   - `when`         what this recipe is for, in the pack's own vocabulary
 *   - `prerequisite` what must be true before it can be used (mechanically
 *                    checkable where the gate already checks it)
 *   - `notFor`       the neighbouring recipe that should be used instead
 *   - `demo`         where a real, rendered example lives: a published pack
 *                    slug, or a `scene-gate-fixture` scenario id
 *   - `demoGap`      only when no rendered example exists; the reason is
 *                    recorded instead of inventing one
 *
 * `docs/video-script-writing-guide.md` carries the long-form authoring rules
 * this prose condenses (media routing #761, contain bands #1075, chart
 * grammar #1398).
 */
export const RECIPE_NOTES = Object.freeze({
  "narrative/media-bottom-bar": {
    when: "一拍讲清一个动作加结果，且有一张必须看清的画面（官方 demo、页面截图、K 线），文案短到能坐进画面下沿。",
    prerequisite:
      "素材是证据角色且 provenance 可追；company/action/result 能压进字幕带以上；fit 可写 contain（此版式有 contain 带）。",
    notFor:
      "需要并列两组事实（用 contrast/split）、画面必须整屏观看（用 fullscreen），或只有氛围图（用 stacked-cards）。",
    demo: { pack: "alibaba-ai-megabet" },
  },
  "narrative/media-split": {
    when: "主体（产品、人物、设备）在左、解释在右，画面是竖构图或主体居中留白，文字需要半幅宽度。",
    prerequisite:
      "素材主体落在画面中线、裁成半幅不掉信息；action/result 文案短；没有横屏图表或宽表格。",
    notFor: "横屏图表、录屏、需要读细节的截图（裁掉一半等于没给）；文案超过两行半。",
    demo: { pack: "doubao-work" },
  },
  "narrative/media-overlay": {
    when: "画面本身就是这一拍的主角（现场录屏、发布会实拍、满屏演示），上下各留一条文字带回扣叙事。",
    prerequisite: "素材满幅可读；文案只做旁白式回扣；overlay 约 0.55，保证白字对比。",
    notFor: "图表、表格、需要逐字读的截图；文案承担主要信息量的解释拍。",
    demo: { pack: "ant-lingbot-world-13b" },
  },
  "narrative/stacked-cards": {
    when: "纯文本叙事：两到三张卡片并置，讲清「谁、做了什么、结果如何」，不需要图像证据。",
    prerequisite:
      "不声明 assetNeed、不绑 media.evidence（#761 文本优先版式）；media 只能是氛围底图或 null；卡片文案各自独立成句。",
    notFor: "任何需要观众看清的画面（图表、截图、demo）；四张以上卡片（改用 info-card/array）。",
    demo: { pack: "alibaba-ai-megabet" },
  },
  "hook/hero-center": {
    when: "开场第一拍。走数字先行还是主张先行由 `hook-layout` 的判据决定（#1480），本卡只登记渲染契约。",
    prerequisite:
      "bigNumber 与 hookText/revealText 二选一，不可同镜并存；数字是可溯源的跨档量级，主张须在 30 秒内兑现。",
    notFor: "铺垫式开场、3 秒内立不住的主张、把型号（GPT-5.5 / H100）当量级。",
    demo: { pack: "alibaba-ai-megabet" },
  },
  "hook/media-led": {
    when: "画面即证据的开场：官方 demo 首帧、K 线、模型卡截图，画面占主角，数字退到下方条。",
    prerequisite:
      "必须绑定 media 且 mediaRole 为 evidence（或原生 K 线）；素材 provenance 可追；只能数字先行——claim 槽在此版式未注册。",
    notFor: "没有素材、素材只是氛围图或 logo、主张要靠一句文案才成立的开场。",
    demo: { pack: "zhipu-valuation" },
  },
  "stat-reveal/hero-center": {
    when: "一个数字就是这一拍的全部信息，配一句读法和来源。",
    prerequisite:
      "bigNumber 必填；label/subtext/source 可选但建议带来源；该模板不画媒体背景，不要绑画面。",
    notFor: "需要并列多项数据或图型关系（用 data/chart）、需要画面证据的拍。",
    demo: { pack: "baidu-token-exchange" },
  },
  "stat-reveal/set-piece": {
    when: "数字要当布景演：count-up 落点、一条对比铁轨、结论，适合「从 X 到 Y」的量级故事。",
    prerequisite:
      "bigNumber 与 subtext 同时存在才启用（subtext 是对比基准），否则渲染回退 hero-center；基准须真实可核。",
    notFor: "没有基准的单点数字（用 hero-center）、需要趋势或分布的图型。",
    demo: { fixture: "topology-set-piece" },
  },
  "cta/hero-center": {
    when: "结尾固定一拍：品牌 lockup 加一句 action，把观众送到下一步。",
    prerequisite: "brand 与 tagline 必填；action 一句话，topic 可选；只出现在最后一拍。",
    notFor: "中段提前要关注或转发（会打断叙事）、多重 CTA 并列。",
    demo: { pack: "alibaba-ai-megabet" },
  },
  "quote/hero-center": {
    when: "对手或官方的原话本身就是证据（发布会、财报、访谈），需要 attribution 才成立。",
    prerequisite: "quote 必填且逐字可核；source 必填；verified 只在已核对原始出处时打开。",
    notFor: "我方改写的主张、转述二手评论、没有出处的金句。",
    demo: { pack: "unitree" },
  },
  "context/hero-center": {
    when: "解释「为什么会这样」的一段因果：徽章定调、标题、一行 context、detail 补充。",
    prerequisite: "title 与 context 必填；detail 不承担新事实；一拍只讲一条因果。",
    notFor: "并列多条要点（用 info-card）、需要数字或图型支撑的拍。",
    demo: { pack: "kimi-sandbox" },
  },
  "context/flow": {
    when: "三到四步因果链：badge、title、context、detail 自上而下当节点读，适合政策、供应链、技术栈的传导。",
    prerequisite: "title 必填；节点按顺序有依赖关系，不是并列清单；每节点一句。",
    notFor: "并列要点（info-card/array）、单点解释（context/hero-center）。",
    demo: { pack: "baidu-token-exchange" },
  },
  "contrast/hero-center": {
    when: "两栏对照：左是被比较的一方，右是结论一方，把差距摆在一屏里。",
    prerequisite:
      "title/left/right 必填；左右各自成句且量纲可比；media 只能当暗化背景，禁止 assetNeed 与 evidence（#761）。",
    notFor: "需要读数图表或截图证据的对比（用 data/chart 或两个 data 拍）；三方以上比较。",
    demo: { pack: "light-society" },
  },
  "contrast/split": {
    when: "分栏对照：左右各成一列，首条当列首大字，适合「旧 vs 新」「他 vs 我」的结构化差异。",
    prerequisite: "与 hero-center 同一套文本与媒体约束；左右条目数尽量对齐，首条能当列首。",
    notFor: "条目数悬殊、需要逐条解释的长文案。",
    demo: { pack: "deepseek-15b-round" },
  },
  "data/hero-center": {
    when: "一个大数字配环形注释和一句读法，是数据拍最轻的形态。",
    prerequisite: "stat 必填；label/subtext/source 可选；circle 只控制注释环，不是文本字段。",
    notFor: "两个以上数字的并列、任何图型关系（用 chart 或 chart-card）。",
    demo: { pack: "baidu-token-market" },
  },
  "data/year-source": {
    when: "年份或编号是这一拍的主体（代际、届次、编号），配机构 pill 和一张不低于 240px 的卡片。",
    prerequisite:
      "stat 与 subtext 同时存在才启用（缺 subtext 回退 hero-center）；机构名与年份都要可核。",
    notFor: "普通量级数字（用 hero-center）、需要趋势或对比的数据。",
    demo: { pack: "deepinfer" },
  },
  "data/chart-card": {
    when: "只有一张真实图表图片（官方图、论文图、截图）能说明关系，且该图型不在原生支持范围。",
    prerequisite:
      "绑定受信图表素材并保留来源；info 字段不可用（原生图表走 chart）；图里能读清坐标轴与单位。",
    notFor: "能用原生图型画出来的关系（bar/line/…）、纯装饰的示意图。",
    demo: { fixture: "topology-chart-card" },
  },
  "data/chart": {
    when: "数据关系可原生渲染：量级、排名、随时间变化、占比、偏差、分布，且行数据可核。",
    prerequisite:
      "info.relationship 与 info.chart 在允许矩阵内；unit/source 齐；magnitude/ranking 的基线为 0；占比合计约 100%。",
    notFor: "correlation/flow/spatial（v2 未原生支持，回退 chart-card）、行数据来源不可追的拍。",
    demo: { pack: "china-us-token-divide" },
  },
  "info-card/hero-center": {
    when: "背景图加要点卡，一屏讲清两三条并列信息（公司背景、能力清单）。",
    prerequisite: "title/subtitle/points 全部必填；每条要点一句、互不重叠；背景图只能是氛围。",
    notFor: "需要逐条演示、需要数字对比或因果链的拍。",
    demo: { pack: "unitree" },
  },
  "info-card/array": {
    when: "要点数量本身就是信息：交错卡片阵列加数量点阵，适合四条以上的清单或能力矩阵。",
    prerequisite: "title 与 points 必填，subtitle 可选；点数要能一眼数清（不超过 8 条）。",
    notFor: "两条以内的要点（用 hero-center）、需要解释每一条的拍。",
    demo: { pack: "deepinfer" },
  },
  "fullscreen/media": {
    when: "整屏只给画面：演示录屏、现场实拍，文字只剩 source 标注（字幕由 ASS 烧录，不归模板）。",
    prerequisite:
      "media.mode 为 fullscreen（或 visualType 为 fullscreen）；素材满幅、关键信息不落在字幕带；source 必填。",
    notFor: "需要文字解释、需要图表读数的拍；正文镜头不要默认开这个模式（overlay 会被归零）。",
    demo: { fixture: "baseline-fullscreen" },
  },
});

/** Canonical id for a rendered scene: `visualType/resolvedLayout`. */
export function recipeIdForScene(scene) {
  if (!scene?.visualType) return null;
  // `media.mode: "fullscreen"` is dispatched to FullscreenMedia before the
  // layout switch (ShortVideo.renderScene), whatever the visualType says.
  if (scene.media?.mode === "fullscreen") return "fullscreen/media";
  return `${scene.visualType}/${resolveRenderLayout(scene)}`;
}

/**
 * The catalogue, derived from the render contract and joined with the notes.
 *
 * A combo that exists in `REMOTION_SLOT_MAP` but has no note still gets an
 * entry (with `missingNote: true`) — so a newly added layout surfaces as a
 * validation error instead of silently shrinking the catalogue.
 */
export function recipeCatalog(slotMap = REMOTION_SLOT_MAP) {
  const catalog = [];
  for (const [visualType, layouts] of Object.entries(slotMap)) {
    for (const [layout, groups] of Object.entries(layouts)) {
      const id = `${visualType}/${layout}`;
      const notes = RECIPE_NOTES[id];
      catalog.push({
        id,
        visualType,
        layout,
        slots: {
          rendered: [...groups.rendered],
          optional: [...groups.optional],
          control: [...groups.control],
          intentionallyOmitted: [...groups.intentionallyOmitted],
        },
        media: {
          textFirst: isTextFirstLayoutScene({ visualType, layout }),
          // `fullscreen/media` is the `media.mode: "fullscreen"` path: the whole
          // frame is the picture, so a contained letterbox is legal (#1075).
          containBand:
            visualType === "fullscreen"
              ? allowsContainFit({ visualType, layout, media: { mode: "fullscreen" } })
              : allowsContainFit({ visualType, layout }),
        },
        ...(notes ?? {}),
        missingNote: !notes,
      });
    }
  }
  return catalog;
}

export function findRecipe(id, catalog = recipeCatalog()) {
  return catalog.find((recipe) => recipe.id === id) ?? null;
}

/**
 * Structural validation, pure (no fs): breaks when a card's identity is not a
 * renderable combo, when the editorial note is incomplete, or when the demo
 * anchor is malformed. Demo *resolution* (does that pack/scenario really render
 * this combo) belongs to the CLI, which owns the filesystem and the corpus.
 */
export function validateRecipeCatalog(catalog = recipeCatalog()) {
  const errors = [];
  const ids = new Set();

  for (const recipe of catalog) {
    if (ids.has(recipe.id)) errors.push(`duplicate recipe id: ${recipe.id}`);
    ids.add(recipe.id);

    if (recipe.missingNote) {
      errors.push(
        `${recipe.id}: no editorial note — add when / prerequisite / notFor / demo to RECIPE_NOTES`,
      );
      continue;
    }
    for (const field of ["when", "prerequisite", "notFor"]) {
      if (typeof recipe[field] !== "string" || recipe[field].trim() === "") {
        errors.push(`${recipe.id}: ${field} is missing`);
      }
    }
    if (recipe.demo && recipe.demoGap) {
      errors.push(`${recipe.id}: demo and demoGap are mutually exclusive`);
    }
    if (!recipe.demo && !recipe.demoGap) {
      errors.push(`${recipe.id}: needs a demo anchor (pack or fixture) or a demoGap reason`);
    }
    if (recipe.demo) {
      const keys = Object.keys(recipe.demo);
      if (keys.length !== 1 || !["pack", "fixture"].includes(keys[0])) {
        errors.push(`${recipe.id}: demo must be {pack: "<slug>"} or {fixture: "<scenario>"}`);
      } else if (!String(recipe.demo[keys[0]]).trim()) {
        errors.push(`${recipe.id}: demo ${keys[0]} is empty`);
      }
    }
  }

  // Coverage: every renderable combo must be addressable.
  const addressed = new Set(catalog.map((recipe) => recipe.id));
  for (const [visualType, layouts] of Object.entries(REMOTION_SLOT_MAP)) {
    for (const layout of Object.keys(layouts)) {
      const id = `${visualType}/${layout}`;
      if (!addressed.has(id)) errors.push(`${id}: renderable combo has no card`);
    }
  }

  return { ok: errors.length === 0, errors, cards: catalog.length };
}
