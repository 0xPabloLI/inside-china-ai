# DeepInfer 开源 — 源素材与核对台账（2026-10-20）

## 一手源

| 类型 | 链接 | 时间 |
| --- | --- | --- |
| 官方公众号原文 | https://mp.weixin.qq.com/s/5MEu2eeqNfBWXlkCKTd6sg | 2026-10-20 16:54 北京 |
| 官方知乎技术报告 | https://zhuanlan.zhihu.com/p/2095560295930508953 | 编辑于 2026-10-20 19:30 |
| GitHub DeepInfer | https://github.com/deepseek-ai/DeepInfer | repo created 2026-10-16T07:47:23Z |
| GitHub deepseek-recipe | https://github.com/deepseek-ai/deepseek-recipe | repo created 2026-09-10 |
| 部署问答（README 同仓） | deepseek-ai/DeepInfer `doc/inference_deployment_qa.md` | 随仓库发布 |

## 公众号原文关键段（逐字）

> DeepSeek 长期致力于将推理性能推向极致。在此前开源一系列大模型、TileLang 编译工具及推理算子库的基础上，我们决定进一步**将内部推理框架 DeepInfer 全面开源**。

> 基于 DeepInfer，我们已实现 DeepSeek V4.1 Flash 高吞吐、低延迟的大规模推理服务。未来，DeepSeek 新模型的推理代码及后续优化也将在此持续更新。

> DeepInfer 推理框架：集成高性能算子与深度优化的推理引擎，支持分布式推理、推测解码、SWA Bounded Replay、结构化输出等能力，兼容英伟达与华为昇腾平台。

> deepseek-recipe 编解码组件：同步开源的生产级 Token 编解码组件，与 DeepSeek 官方 API 处理逻辑完整对齐。

## 数字核对表

| 数字 | 出处 | 核对结论 |
| --- | --- | --- |
| 单集群 **155 万亿 tokens/天** | 公众号原文 + 知乎 + 部署问答（英文版同句） | 一手确认。折算 ≈ 17.9 亿 tokens/秒（155e12 / 86400 = 1.794e9，计算值，非原文） |
| **$38 / GPU·小时**（谷价） | 同上 | 一手确认，原文是「整体收入」，**不是利润、不是成本** |
| KVCache 保留 **72 小时以上** | 知乎「三个目标」 | 一手确认；部署问答另给 TTL：agent 3 天 / chatbot 7 天 |
| KVCache 池 **100 PiB SSD** | 部署问答 → KV cache storage | 一手确认 |
| SWA KV **命中率 98%+**、TTL ≈180s | 知乎 → KVCache Storage | 一手确认（线上数据） |
| 变长验证 **+6% 吞吐** | 知乎 → DSpark | 一手确认（对比固定验证 5 token） |
| Decoder SWA Bounded Replay「prefill 计算量近乎减半」 | 知乎 | 一手确认（原文措辞「近乎减半」，非精确倍数） |
| Prefill 用 8 卡机 / Decode 用 64–128 卡超节点 | 知乎 + 部署问答 | 一手确认 |
| **6,309 stars**、Apache-2.0、Python | GitHub API `repos/deepseek-ai/DeepInfer`（2026-10-20 读取） | 一手确认，随时间变化 |
| deepseek-recipe 1,104 stars、MIT、Rust | GitHub API | 一手确认 |
| 平均输入 77K token / TTFT 400ms / 230 tok/s（代码 300）/ 96% 输入命中缓存 | **36kr 称「官方公布的线上统计」** | ⚠️ 未在公众号、知乎渲染文本、部署问答中检出原文；**不列入视频**，除非另行核到一手出处 |

## 开源范围：README 自陈「不包含」

> Required for a complete inference service (not included in this release):
> - A KV cache system
> - VE/Prefill/Decode disaggregation (most required engine functionality is already implemented)
> - Load balancing across data-parallel replicas for both prefill and decode

> Supported models: DeepSeek-V4.1-Flash（仅此一个）

> This open-source release provides **offline inference** with the core features needed for serving at scale.

部署问答：

> The KV cache management and load balancing components of the inference system are tightly coupled to our internal infrastructure, so that code is not yet fully open-sourced.

硬件：NVIDIA SM100 GPU / Huawei Ascend 950 NPU；构建需 CUDA 13 或 CANN 9.2。

## 二手覆盖（用于交叉核对与 source attribution）

- 华尔街见闻 https://wallstreetcn.com/articles/3784020 — 155 万亿/天、$38/卡时、双平台
- 36氪 https://www.36kr.com/p/4034109983036552 — 同上 + 77K/400ms/230 tok/s（未核到一手）
- TechWeb https://www.techweb.com.cn/it/2026-10-20/2979874.shtml — 与公众号基本同文
- mlllm.io https://mlllm.io/articles/3560-... — 英文简述，明确指出「does not include KV-cache, P/D disaggregation, or load balancing」且「operates in offline inference mode」

## 与既有内容包的去重判断

已存在 DeepSeek 包：`deepseek-v41-flash`（发布）、`deepseek-v41-flash-1017`（基准跑分）、`deepseek-flash-silent-update`（API 指纹）、`deepseek-harness-desktop`（桌面端泄露）、`deepseek-huawei-cluster`（16 万昇腾芯片订单）。

**未覆盖角度**：推理框架本身、开源范围的边界、KVCache/负载均衡这类「serving 层」的工程细节。

**同事件并行包**：`scripts/short-video/content/deepseek-deepinfer/`（2026-10-21）打的是同一事件的 headline 角度（155 万亿 tokens/天、$38/卡时、100 PiB KVCache、7 天 TTL）；本包 `deepinfer` 打的是「开源范围缺哪三块」的角度。两包共用这套数字，改数时两边一起改。
