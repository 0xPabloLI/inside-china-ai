# 源素材：蚂蚁灵波开源 LingBot-World 2.0 轻量版（1.3B）

> 来源：微信公众号《量子位》2026-09-10
> URL: https://mp.weixin.qq.com/s/fOoXddwWjKixTbrMQiyd8Q
> 作者：金磊 发自 凹非寺 / 量子位 | 公众号 QbitAI

## 核心事实

- **蚂蚁灵波**开源 **LingBot-World 2.0 轻量版**，参数规模 **1.3B**，面向消费级单卡 GPU 设计，可本地实时世界生成。
- 2026 年 7 月开源的是 **14B 主模型**，能做到小时级持续生成、丰富动作和事件交互，720p/60fps 高清实时体验。
- "1.3B" 这个数字在 7 月论文摘要里已出现伏笔。
- 上周 **IFA 柏林消费电子展**开幕演讲上，**AMD 高级副总裁 Jack Huynh** 点名了 3 个开源模型（智谱、千问、LingBot-World），用 LingBot-World 2.0 做 Demo，评价：**"This is the future of Personal AI."**

## 技术路线（从 14B 到 1.3B 不是先做大再砍小）

1. **Causal World 预训练**：模型生成当前状态时只能依赖过去已发生的视觉信息 + 用户到此为止的输入（因果）。自回归模型会把刚生成的结果当后续输入，误差会一路放大 → 长时生成纹理变糊、几何变形、场景漂移。
2. **MoBA（Mixture of Bidirectional and Autoregressive Attention Mask）**：在 Teacher Forcing Mask 里加入一部分双向 Attention，增加正则，缓解长上下文过拟合和画质退化。训练出高质量 Backbone。
   - 与 MAGI、HY-World 1.5 对比：5 秒到 60 秒，LingBot-World 2.0 在纹理、几何结构、场景连贯性上更稳定。
3. **蒸馏**：
   - **一致性蒸馏（Consistency Distillation）**：把 Teacher 多步去噪轨迹压缩到少数几步，Student 用更少计算完成生成，保留动作条件动态能力。
   - **DMD（Distribution Matching Distillation）**：让 Student 在自己的长时 self-rollout 轨迹上继续训练，减少长时自回归累计漂移。

## 三次开源节奏（围绕"门槛"）

| 时间 | 版本 | 回答的问题 |
|------|------|-----------|
| 2026 年 1 月 | LingBot-World 1.0 | 能不能做出来 |
| 2026 年 7 月 | LingBot-World 2.0 14B | 能不能做得久、做得真 |
| 今天 | LingBot-World 2.0 1.3B | 能不能让更多人跑起来 |

## 部署工程栈（14B 版本）

编译器级注意力 Kernel 优化、动态 KV 缓存调度、异步流媒体传输、混合并行推理策略。

## 链接

- 官网：https://technology.robbyant.com/lingbot-world-v2
- 模型：https://huggingface.co/collections/robbyant/lingbot-world-v2
- 代码：https://github.com/robbyant/lingbot-world-v2
- 论文：https://arxiv.org/pdf/2607.07534

## 关键引用

> "This is the future of Personal AI." — Jack Huynh, AMD SVP, IFA Berlin

## Demo 场景

1. 第一人称射击（雪地科幻场景，移动+转动视角+开火，爆炸/火焰/能量护盾反馈）
2. 《奥德赛》第三人称视角（巨型木马、城墙、火光，角色移动场景持续展开）
3. 中国小镇、欧洲乡村等环境长时间探索