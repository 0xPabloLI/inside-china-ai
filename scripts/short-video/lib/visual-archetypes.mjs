/**
 * Visual archetype vocabulary (#1353).
 *
 * The other half of the evergreen split. A standing claim ("the Hang Seng
 * TECH index is off 80% from its peak") does not name a picture; it names a
 * *kind* of picture. The writer knows to search "Hang Seng TECH chart" — the
 * pipeline's tokenizer can only produce "hang seng tech", which retrieves
 * logos and office towers instead of the index.
 *
 * An archetype is that missing word: a small, closed vocabulary of the visual
 * forms the channel actually needs, each with the words that identify it in a
 * claim. Closed on purpose — an open vocabulary would just be a second
 * tokenizer, and the value here is that `chart` is a *retrieval term*, not a
 * description.
 *
 * Kept as its own table rather than folded into an entity list: entities name
 * *who*, archetypes name *what the picture shows*, and the two have different
 * lifecycles and different consumers. Entity matching must not see `chart` as
 * an entity, and this table must not need an entity to exist.
 *
 * Leaf module: no imports, no I/O.
 */

/**
 * Archetype id → retrieval term plus the cues that identify it in claim text.
 *
 * `word` is the single token appended to an entity to build a query, so it
 * must be a term stock/news indexes actually match: "chart", not "candlestick
 * diagram". `cues` are matched against lowercased claim text; multi-word cues
 * match as substrings, single words as whole tokens.
 */
export const ARCHETYPES = {
  chart: {
    word: "chart",
    cues: [
      "chart",
      "graph",
      "plot",
      "candlestick",
      "k-line",
      "kline",
      "index",
      "indices",
      "benchmark",
      "trend line",
      "stock price",
      "share price",
      "股价",
      "指数",
      "走势",
      "k线",
      "行情",
    ],
  },
  skyline: {
    word: "skyline",
    cues: ["skyline", "cityscape", "downtown", "city skyline", "天际线", "城市景观", "cbd"],
  },
  office: {
    word: "office",
    cues: ["office", "headquarters", "hq", "campus", "workplace", "办公楼", "总部", "园区"],
  },
  logo: {
    word: "logo",
    cues: ["logo", "brand mark", "wordmark", "标志", "标识"],
  },
  building: {
    word: "building",
    cues: ["building", "tower", "skyscraper", "real estate", "大楼", "大厦", "写字楼"],
  },
  data_center: {
    word: "data center",
    cues: [
      "data center",
      "datacenter",
      "server farm",
      "gpu cluster",
      "数据中心",
      "机房",
      "算力中心",
    ],
  },
  factory: {
    word: "factory",
    cues: ["factory", "plant", "assembly line", "production line", "工厂", "产线", "车间"],
  },
  robot_arm: {
    word: "robot arm",
    cues: ["robot arm", "robotic arm", "manipulator", "机械臂"],
  },
  humanoid: {
    word: "humanoid robot",
    cues: ["humanoid", "bipedal", "人形机器人", "人形"],
  },
  chip: {
    word: "chip",
    cues: ["chip", "wafer", "semiconductor", "fab", "芯片", "晶圆", "半导体"],
  },
  lab: {
    word: "laboratory",
    cues: ["lab", "laboratory", "cleanroom", "实验室", "洁净室"],
  },
  warehouse: {
    word: "warehouse",
    cues: ["warehouse", "fulfillment center", "logistics hub", "仓库", "物流中心"],
  },
};

/**
 * Longest cue first, so "data center" wins over a bare "center" style match and
 * "robot arm" is not read as `humanoid`.
 */
const CUE_INDEX = Object.entries(ARCHETYPES)
  .flatMap(([id, spec]) => spec.cues.map((cue) => ({ id, cue: cue.toLowerCase() })))
  .sort((a, b) => b.cue.length - a.cue.length);

/**
 * The archetype a piece of claim text names, or null.
 *
 * Cue shapes get the match mode their language allows: multi-word and
 * hyphenated cues match as substrings — they are the specific forms
 * ("data center", "robot arm") and exact phrasing is the honest test for them.
 * CJK cues match as substrings too, because the language has no word
 * boundaries to anchor a whole-token test on ("人形机器人演示" is one token).
 * Latin single-word cues match as whole tokens, which is what stops "plant"
 * from firing on "planting" and "lab" on "label".
 *
 * @param {string|null|undefined} text
 * @returns {string|null} archetype id
 */
export function archetypeForText(text) {
  const raw = String(text ?? "").toLowerCase();
  if (!raw.trim()) return null;
  const tokens = new Set(raw.split(/[^\p{L}\p{N}-]+/u).filter(Boolean));
  for (const { id, cue } of CUE_INDEX) {
    if (/\p{Script=Han}/u.test(cue) || cue.includes(" ") || cue.includes("-")) {
      if (raw.includes(cue)) return id;
    } else if (tokens.has(cue)) {
      return id;
    }
  }
  return null;
}

/**
 * The retrieval term for an archetype id, or null for an unknown id.
 *
 * @param {string|null|undefined} id
 * @returns {string|null}
 */
export function archetypeWord(id) {
  if (!id) return null;
  return ARCHETYPES[id]?.word ?? null;
}

/**
 * Build the `entity + archetype` query phrase, or null when either half is
 * missing.
 *
 * Two halves, one phrase: "Hang Seng TECH" + "chart" → "Hang Seng TECH chart".
 * The joined form is what a search index matches; the two halves separately
 * are what a tokenizer already produces, which is the whole problem.
 *
 * @param {string|null|undefined} entity
 * @param {string|null|undefined} archetypeId
 * @returns {string|null}
 */
export function composeArchetypePhrase(entity, archetypeId) {
  const name = String(entity ?? "").trim();
  const word = archetypeWord(archetypeId);
  if (!name || !word) return null;
  return `${name} ${word}`;
}
