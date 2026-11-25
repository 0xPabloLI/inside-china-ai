# 中国 AI 公司关系图谱（#248，2026-09-12）

> **机器可读 SSOT**：`scripts/short-video/lib/data/company-relations.json`（70 实体）。管线消费经 `lib/company-relations.mjs`：`resolveEntityHashtag` / `howToPresent` / `buildEntityHashtagMap`（caption-utils）/ `buildModelBrandKeys`（caption 模型品牌白名单）/ `buildEntityColorAliases`（prompt-injection）。本文件是人读视图与裁决依据，不重复存数据。
>
> **下游票**：无下游：本文件是 #248 的裁决记录，本次仅同步既有的模型品牌标签双锚裁决，无需新票承接。

## 数据来源

1. `docs/research/china-ai-hashtag-mapping.md`（2026-08-26，60+ 实体 7 层级）——Tier 结构、实体→hashtag 的既有定案，本图谱的骨架。
2. #242/#245 交付证据（commit `8e2cc06`）——ant-group/alibaba/amd 映射与「映射在 seam 处继承母公司 tag」的规则。
3. #248 票面要求的新增子公司：lingbot（LingBot-World→蚂蚁灵波→ant-group→alibaba，来源 #245/#248 票面）、longcat（Meituan，票面示例）、bilibili/xiaohongshu（票面示例清单）。
4. 海外认知度分级：编辑判断（基于各品牌在 US TikTok 受众的可见度：是否有过 viral 时刻、是否在英文科技媒体常态出现），三级 high/mid/low，逐条记录在 JSON 的 `overseasAwareness` 字段。**非调研测量值**——如需量化（提及量/搜索量）应另开调研票。

## 解析规则

### hashtag（tag 用哪个）

沿用 #245 确立的规则：**自身 hashtag 有流量就用自身，否则继承母公司**。已在 JSON 的 `hashtag` 字段中解析为最终值：

- 有自有流量的子公司保留自身 tag：`kling→#kling`、`doubao→#doubao`、`gemini→#gemini`、`sora→#sora`
- 海外无认知的子公司继承母公司：`ant-group→#alibaba`、`mimo→#xiaomi`、`lingbot→#alibaba`、`longcat→#meituan`
- 特例（映射文档既有裁决）：`openai→#chatgpt`（流量 tag）、`llama→#meta`、`moonshot→#kimi`
- 模型品牌双锚例外（2026-11-16 用户裁决）：`glm→#glm`，JSON 以 `modelBrand: true` 标记该实体可作为模型品牌标签源。母公司标签 `#zhipu` 仍由 `zhipu` 实体独立产出，两者并列出现在 caption；继承规则对其余实体不变。适用于 caption 标签派生，不改变写稿表述（glm 仍按低认知度用 "Parent's Brand" 句式）。

### 写稿表述（怎么称呼它）

`howToPresent(entity)`：低认知度实体返回 "Parent's Brand" 句式——

| 实体      | 表述                        | 认知度               |
| --------- | --------------------------- | -------------------- |
| ant-group | **Alibaba's Ant Group**     | low（#245 用户反馈） |
| lingbot   | Alibaba's Ant Group LingBot | low                  |
| doubao    | ByteDance's Doubao AI       | low                  |
| hunyuan   | Tencent's Hunyuan           | low                  |
| glm       | Zhipu's GLM model           | low                  |

高认知度（alibaba/bytedance/tencent/baidu/huawei/xiaomi/deepseek/openai/google/meta/nvidia/capcut 等）直接用本名。

### 首次报道实体的收录与背景（2026-11-20）

首次进入管线的新公司（以及首次出现的模型家族）必须同时完成两件事：

1. **收录**：在 `scripts/short-video/lib/data/company-relations.json` 增加实体记录（`hashtag`、`matchKeys`、`aliases`、`overseasAwareness`、`presentation`），并在 `docs/refs/entity-registry.yaml` 增加公司与模型/人物条目。前者供 caption、实体色和检索消费；后者供 RAG 实体链接与后续研究复用。
2. **背景**：脚本/文章第一次出现该公司时，必须给一句定位——`who + where + why it matters`，而不是假设观众认识它。已有报道历史的公司不重复讲背景。

例：Phancy（`phancy`，原第四范式，2014 年成立、2023 年港交所 6682 上市）首次进入视频时，Scene 2 用一句 `The company is Phancy Group, formerly Fourth Paradigm. It listed in Hong Kong in 2023 and sells enterprise AI.` 完成定位。

### 实体色继承（B-roll prompt）

`buildEntityColorAliases()`：沿 parent 链向上找最近的 `colorKey`（ENTITY_COLORS 六家：deepseek/huawei/zhipu/baidu/alibaba/tencent）。新增继承：pangu/ascend→huawei、yuanbao→tencent、lingbot→alibaba、tongyi/wan/z-image/dingtalk/quark→alibaba、wenxin/apollo→baidu。

## 消费方与一致性

- `caption-utils.mjs` 的 `ENTITY_HASHTAG_MAP` 改为从 SSOT 派生（原字面量在 `company-relations.test.mjs` 以 golden 全量锁定——**零行为漂移**已验证）。
- `prompt-injection.mjs` 的 `ENTITY_ALIASES` 同样派生（legacy 12 键锁定 + 新增继承键）。
- 任何实体增改：**只改 JSON**，两个消费方与测试自动跟随；schema 校验（parent 引用、环检测、matchKey 唯一）在测试中强制。

## 覆盖范围

70 实体：Tier 1 大厂 32（含子公司/品牌）、Tier 2 创业公司 12（含 Phancy）、Tier 3 芯片 3（+amd）、Tier 4 机器人 5、Tier 5 自动驾驶 3、Tier 6 国际对照 11、平台品牌 3。另含模型品牌 `phai`；≥60 验收达成；后续新实体直接追加 JSON 记录。
