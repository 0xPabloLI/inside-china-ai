# Source Material: 微信文章 — 模型通往现实：通义开放 Qwen4 架构预览

> 存放约定见 `docs/content-pipeline.md` Stage 1a。本文为用户提供的原始素材摘录（关键 Qwen 部分），
> 全部事实已在 Stage 0 通过 Qwen 官方博客 + Hugging Face 模型卡双源验证。
> 原文链接：https://mp.weixin.qq.com/s/oxxfPVL35ExmfZiknoAmSQ
> 公众号：嗨创青年社区 HIC（二手报道）

## 文章核心内容（Qwen 部分）

- 8 月 26 日，阿里通义千问团队发布 **Qwen3.8-Flash-Next** 开放权重模型，官方定位为 **Qwen4 所用模型结构的先导预览**。
- 官方博客《Qwen3.8-Flash-Next：全新架构，迈向极致性价比》。
- 开源权重多模态 MoE 模型；围绕 **Attention、Residual、Embedding、Optimization** 四个方向系统升级。
- 参数：主模型 125B + 51B N-gram Embedding，每 token 激活 6B；MTP 模块约 4B（以 HF 模型卡为准）。
- 上下文：原生 262,144 token，YaRN 扩展至 1,000,000。
- 架构：
  - Gated DeltaNet + Qwen Sparse Attention（QSA）混合：每 4 层中 3 层 GDN（压缩历史），1 层全局 Attention（精准检索）；QSA 用压缩式轻量 Indexer 在 micro-block 粒度筛选重要上下文。
  - Gated Residual：Residual Stream 扩展为 4 条并行分支，动态 Gate 控制读写。
  - N-gram Embedding：局部上下文查表扩展容量，可卸载到 Host Memory 异步 Prefetch。
  - Muon Optimizer + 重新拟合的 Scaling Law。
- 效率：相比 Qwen3.7-Plus，训练开销约 **1/9**；QSA Attention Kernel 在 1M token 上 prefill 最高 **7.6×**、decode 最高 **4.9×** 加速；90% Prefix Cache 命中下 1M 上下文 prefill 吞吐达 Qwen3.7-Plus 的 **8.6×**。
- 权重：Hugging Face + ModelScope；生产版 **Qwen3.8-Flash** 在千问AI平台提供服务（默认 1M 上下文 + 内置官方工具），定价每百万 token 输入 0.8 元、输出 2.7 元。
- 文章同期还报道了 Anthropic MHS（AI 硬件交互规范）——本条内容不进入本次 Qwen 视频。

## Stage 0 补充的一手来源

| 来源 | URL | 用途 |
|------|-----|------|
| Qwen 官方博客 | https://qwen.ai/blog?id=qwen3.8-flash-next | 所有数字的一手来源 |
| Hugging Face 模型卡 | https://huggingface.co/Qwen/Qwen3.8-Flash-Next | 架构规格表 + 基准测试（2026-08-26T12:32 发布） |
| GitHub 仓库 | https://github.com/QwenLM/Qwen3.8-Flash-Next | README + tech_report.pdf |
| TechNode | https://technode.com/2026/08/26/alibabas-qwen-to-open-source-qwen3-8-flash-next-previewing-qwen4-architecture/ | 英文媒体佐证 |
| The Decoder | https://the-decoder.com/alibaba-releases-qwen3-8-flash-next-targeting-ultimate-cost-efficiency/ | 英文媒体佐证 |
| marktechpost | https://www.marktechpost.com/2026/08/26/alibabas-qwen-team-releases-qwen3-8-flash-next-a-125b-multimodal-moe-with-6b-active-parameters-previewing-the-qwen4-architecture/ | 英文媒体佐证 |
