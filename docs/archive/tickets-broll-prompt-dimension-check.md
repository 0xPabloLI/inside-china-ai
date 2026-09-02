# Tickets — B-roll Prompt Dimension Check

> Spec: `docs/specs/spec-broll-prompt-dimension-check.md` · Parent capability: B-roll generation
> Follow-up（本 spec 之外）: GitHub **#166** — 八维常量注入第二层
> 场景矩阵编号（S1–S21）对应 spec §Section 2: Behavioral Scenarios

---

# T1 — NEGATIVE 语义组检测打通全链路

**What to build:** 从 agent 视角：我写一个 `b-roll` scene 的 prompt，如果 NEGATIVE 维度缺了某个语义组，preflight 要直接告诉我缺哪一组，并给出该组的推荐词，而不是等我烧完一轮 GPU 才从 VLM 的打分理由里猜。

本 ticket 是 tracer bullet，一次性打通「scene 输入 → 缺组判定 → warn 输出 → 注册进共享入口 → 单测」全链路。完成即有可见成果：`qwen4-preview` 的 scene 5 与 scene 6 各报一条 warn，scene 8 静默。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] 新增纯函数，输入 scene 数组，返回与既有检查同构的 `{level, category, check, detail, fix}[]`，category 沿用 `Media`，check 名定为 `B-roll prompt dimensions`
- [x] 作用范围：仅当 scene 的 `mediaStrategy` 属生成类策略（`b-roll` / `asset-then-broll`）**且** `aiVideo.prompt` trim 后非空才检查；其余一律静默返回空数组（S7 S8）
- [x] 空或纯空白的 prompt 跳过，不重复既有 contract check 的 fail（S9 S10）
- [x] NEGATIVE 语义组常量导出为三组同义词表：TEXT / HANDS / ARTIFACT（不含 FACE 组，理由见 spec）
- [x] 按 `\b` 词边界匹配每个同义词，大小写不敏感由正则 `i` flag 保证（S12 由 T3 验证）
- [x] prompt 三组齐全且无数字时不产生任何输出（S1 S4）
- [x] 缺组时 warn，detail 点名缺失的组名与 scene id，组名按 TEXT→HANDS→ARTIFACT 固定顺序、逗号分隔（S2 S3 S5 S6）
- [x] fix 文案给出缺失组的推荐词，可复制粘贴
- [x] 多个 scene 各自有问题时每个 scene 一条，按 scene 原顺序输出（S18）
- [x] 追加为检查注册表数组最后一项，所有现有调用方自动获得（S19）
- [x] 级别恒为 warn，不阻断渲染

---

# T2 — 阿拉伯数字检测与合并输出

**What to build:** 从 agent 视角：我在 prompt 里写进一个数据值（如 `8.6x`）时，preflight 要提醒我这个数字 T2V 画不出来，应该进 `texts` 层；但如果我写的是元素数量（如 `3 glowing layers`），提醒要说明这种情况可以忽略，别让我学会无视它。

**Blocked by:** T1

**Status:** ready-for-agent

- [x] 对 prompt 做数字检测，命中即记为一个问题（S14）
- [x] 只检测阿拉伯数字，不检测英文数词——`Two parallel lanes` 不得报警（S16）
- [x] 元素数量的阿拉伯数字（`3 glowing layers`）仍报 warn，fix 文案同时说明「数据值应进 texts 层 / 元素数量可忽略」两种可能（S15）
- [x] 同一 prompt 既缺组又含数字时，**只输出一条** warn，detail 合并两类问题（S17）
- [x] 不区分「数据型 vs 数量型」的语义，规则保持为纯正则

---

# T3 — 匹配稳健性边界

**What to build:** 从 agent 视角：我用 `no texture` 描述材质时，检查不能误以为我已经声明了文字防护；我用大写 `No Hands` 或单数 `no hand` 时，检查要正常识别。一句话：词表判定不能因为大小写和词形就漏掉真实缺口，也不能因为子串巧合就放过真实缺口。

**Blocked by:** T2

**Status:** ready-for-agent

- [x] `no texture` 不得被计为 TEXT 组已覆盖——词边界匹配，专门用例保护（S11）
- [x] 大写形式（`No Hands`）正常识别——正则 `i` flag 保证大小写不敏感（S12）
- [x] 单数形式（`no hand`）正常识别——同义词表单复数齐全（S13）
- [x] 同义词表覆盖 spec 定义的全部词条
- [x] 备注：S11/S12/S13 在 T1 实现下即为 green（词边界与 `i` flag 在 T1 已落地），本 ticket 的价值是固化回归保护，而非 red→green 循环

---

# T4 — 真实 fixture 固化 + 文档 + 运行时验证

**What to build:** 从 maintainer 视角：当前手工 NEGATIVE 互不一致这个事实，要固化成回归测试——将是谁补全了 prompt，这条测试会变红，提醒同步更新预期。同时 HITL 面板要能真的看到这两条新 warn，且管线不被阻断。

**Blocked by:** T3

**Status:** ready-for-agent

- [x] 真实 `qwen4-preview` scene 列表全量跑：scene 5 报缺 ARTIFACT、scene 6 报缺 TEXT + ARTIFACT、scene 8 静默（S20）
- [x] 测试注释写明「这是当前状态的固化」——prompt 被补全时需同步更新预期，不是回归 bug
- [x] `docs/video-workflow.md` §“The 8-dimension prompt” 补充校验说明（已过 `writing-for-agents` 判定）
- [x] 运行时验证：`verify-video.mjs --pre --content qwen4-preview` 新增 2 条 warn 且 **exit code 仍为 0**（S21）——实测 PASS 63 / WARN 4 / FAIL 0
- [x] `npx eslint` 对两个改动文件通过（1 处 prettier 已 `--fix`）
- [x] `npx tsc --noEmit` 通过
- [x] `npm run build` 通过
- [x] 偏差说明：全仓库 `npm run lint` 未跑——受 issue **#164** 阻塞（`eslint.config.js` 未 ignore `experiments/.venv`，45+ 分钟不收敛）。已改为 lint 本次改动的两个文件
