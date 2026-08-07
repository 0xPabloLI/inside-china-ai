# TikTok Profile Setup — China AI News

> 参考来源：sergebulaev/tiktok-skills `tt-profile-optimizer`（适配品牌账号）+ TikTok 2026 最佳实践。
> 创建于 2026-08-02。用于手动设置 TikTok 账号 profile。

## Profile 配置

| 要素               | 推荐值                                                                     | 操作位置            | 备注                                                                           |
| ------------------ | -------------------------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------ |
| **头像**           | `china-ai-news-mark.svg` 导出 PNG（纯图标版）                              | 编辑资料 → 更换头像 | 高对比，小圆内可读。不要用带文字的完整 logo——太小看不清                        |
| **名称（可搜索）** | `China AI News`                                                            | 编辑资料 → 名称     | 30 字符内。**名称字段被 TikTok 搜索索引**，@用户名大部分不被索引               |
| **用户名**         | `@chinaainews`                                                             | 编辑资料 → 用户名   | 短、可说、无乱数字。如果被占用，试 `@china_ai_news` 或 `@chinaainews_official` |
| **Bio（80 字符）** | `China AI news, data, and analysis. Follow for what Western media misses.` | 编辑资料 → 简介     | 80 字符硬限制。回答"关注了能看到什么"                                          |
| **链接**           | 官网 URL（chinaainews.com）                                                | 编辑资料 → 网站     | **需 1000 粉以上解锁**。1k 以下见下方变通方案                                  |
| **定位语**         | "We cover what Western media misses about China AI"                        | 内部参考，不显示    | 所有内容（bio/置顶/视频）服务这句话                                            |

## Bio 设计逻辑

当前 Bio（80 字符）：

```
China AI news, data, and analysis. Follow for what Western media misses.
```

拆解：

- `China AI news, data, and analysis` → 声明 niche（3 个关键词：news / data / analysis）
- `Follow for what Western media misses` → 给关注理由 + 差异化定位

如果需要调整，保持这个结构：**谁 + 看什么 + 为什么关注**

## 链接变通方案（1000 粉以下）

链接字段锁定时，通过以下方式引导流量：

1. **Bio 引导**：在 Bio 末尾加 "Full analysis in bio comment"
2. **置顶视频评论区**：发布后立即在置顶视频评论区放官网链接
3. **每条视频评论区**：置顶评论放文章链接（当域名上线后）

## 置顶视频策略（前 3 条）

发布 3 条视频后，长按视频 → "置顶"。按以下顺序：

| 顺序                    | 视频类型 | Hook 公式                 | 作用                          |
| ----------------------- | -------- | ------------------------- | ----------------------------- |
| **第 1 条（最强证明）** | 突发新闻 | T1 冷开场结果             | 最高播放的视频 = 最佳第一印象 |
| **第 2 条**             | 深度分析 | T4/T6 开放式问题/大胆断言 | 展示深度和独特视角            |
| **第 3 条**             | 数据揭示 | T3/T7 数字揭示/清单       | 展示数据可视化能力            |

## 七项审计清单

定期（每月）对照检查：

| #   | 要素     | 通过标准                                                    | 状态 |
| --- | -------- | ----------------------------------------------------------- | ---- |
| 1   | 头像     | 品牌 logo 纯图标，高对比，小圆内可读                        | [ ]  |
| 2   | 名称     | "China AI News"，含可搜索关键词，30 字符内                  | [ ]  |
| 3   | 用户名   | 短、可说、无乱数字                                          | [ ]  |
| 4   | Bio      | 回答"关注了能看到什么"，一个 niche 一个具体，80 字符内      | [ ]  |
| 5   | 链接     | 1k+：官网 URL。1k-：Bio 引导 + 置顶评论                     | [ ]  |
| 6   | 置顶视频 | 3 条：1 突发 + 1 深度 + 1 数据，按强度排序                  | [ ]  |
| 7   | 定位     | 一句话："We cover what Western media misses about China AI" | [ ]  |

## 参考文件

- 社区 skill：`docs/refs/tiktok-skills/skills/tt-profile-optimizer.md`（原始 7 项审计清单）
- 最佳实践：`docs/tiktok/tiktok-best-practices.md` → "品牌账号设置" section
- Logo 资产：`scripts/short-video/assets/china-ai-news-logo-image-only.png`（纯图标）
