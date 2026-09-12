# 中国 AI 公司关系图谱（#248，2026-09-12）

> **机器可读 SSOT**：`scripts/short-video/lib/company-relations.json`（68 实体）。管线消费经 `lib/company-relations.mjs`：`resolveEntityHashtag` / `howToPresent` / `buildEntityHashtagMap`（caption-utils）/ `buildEntityColorAliases`（prompt-injection）。本文件是人读视图与裁决依据，不重复存数据。

## 数据来源

1. `docs/research/china-ai-hashtag-mapping.md`（2026-08-26，60+ 实体 7 层级）——Tier 结构、实体→hashtag 的既有定案，本图谱的骨架。
2. #242/#245 交付证据（commit `8e2cc06`）——ant-group/alibaba/amd 映射与「映射在 seam 处继承母公司 tag」的规则。
3. #248 票面要求的新增子公司：lingbot（LingBot-World→蚂蚁灵波→ant-group→alibaba，来源 #245/#248 票面）、longcat（Meituan，票面示例）、bilibili/xiaohongshu（票面示例清单）。
4. 海外认知度分级：编辑判断（基于各品牌在 US TikTok 受众的可见度：是否有过 viral 时刻、是否在英文科技媒体常态出现），三级 high/mid/low，逐条记录在 JSON 的 `overseasAwareness` 字段。**非调研测量值**——如需量化（提及量/搜索量）应另开调研票。

## 解析规则

### hashtag（tag 用哪个）

沿用 #245 确立的规则：**自身 hashtag 有流量就用自身，否则继承母公司**。已在 JSON 的 `hashtag` 字段中解析为最终值：

- 有自有流量的子公司保留自身 tag：`kling→#kling`、`doubao→#doubao`、`gemini→#gemini`、`sora→#sora`
- 海外无认知的子公司继承母公司：`ant-group→#alibaba`、`mimo→#xiaomi`、`lingbot→#alibaba`、`glm→#zhipu`、`longcat→#meituan`
- 特例（映射文档既有裁决）：`openai→#chatgpt`（流量 tag）、`llama→#meta`、`moonshot→#kimi`

### 写稿表述（怎么称呼它）

`howToPresent(entity)`：低认知度实体返回 "Parent's Brand" 句式——

| 实体 | 表述 | 认知度 |
| --- | --- | --- |
| ant-group | **Alibaba's Ant Group** | low（#245 用户反馈） |
| lingbot | Alibaba's Ant Group LingBot | low |
| doubao | ByteDance's Doubao AI | low |
| hunyuan | Tencent's Hunyuan | low |
| glm | Zhipu's GLM model | low |

高认知度（alibaba/bytedance/tencent/baidu/huawei/xiaomi/deepseek/openai/google/meta/nvidia/capcut 等）直接用本名。

### 实体色继承（B-roll prompt）

`buildEntityColorAliases()`：沿 parent 链向上找最近的 `colorKey`（ENTITY_COLORS 六家：deepseek/huawei/zhipu/baidu/alibaba/tencent）。新增继承：pangu/ascend→huawei、yuanbao→tencent、lingbot→alibaba、tongyi/wan/z-image/dingtalk/quark→alibaba、wenxin/apollo→baidu。

## 消费方与一致性

- `caption-utils.mjs` 的 `ENTITY_HASHTAG_MAP` 改为从 SSOT 派生（原字面量在 `company-relations.test.mjs` 以 golden 全量锁定——**零行为漂移**已验证）。
- `prompt-injection.mjs` 的 `ENTITY_ALIASES` 同样派生（legacy 12 键锁定 + 新增继承键）。
- 任何实体增改：**只改 JSON**，两个消费方与测试自动跟随；schema 校验（parent 引用、环检测、matchKey 唯一）在测试中强制。

## 覆盖范围

68 实体：Tier 1 大厂 32（含子公司/品牌）、Tier 2 创业公司 11、Tier 3 芯片 3（+amd）、Tier 4 机器人 5、Tier 5 自动驾驶 3、Tier 6 国际对照 11、平台品牌 3。≥60 验收达成；后续新实体直接追加 JSON 记录。
