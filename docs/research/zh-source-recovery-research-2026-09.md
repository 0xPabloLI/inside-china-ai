# 中文失效源恢复调研 — weibo_hot / xinzhiyuan / zhidx / baidu_news（2026-09-07）

> 背景：#140 P5 体检确认 4 源失效。研究问题：各自是否存在可程序化接入的替代端点/API/RSS/镜像；若无 → 放弃。方法：活探针（Tier 1）+ Web 检索交叉。

## Executive Summary

4 源两两分野：**weibo_hot 与 zhidx 有可用替代通道，已落地**（zhidx 走 WordPress REST API、weibo_hot 走 60s 公共热榜 API）；**xinzhiyuan 与 baidu_news 放弃**（前者主机欠费停放，后者资讯索引功能性死亡）。

## 各源裁决

### 1. zhidx（智东西）— ✅ WordPress REST API（已落地）

- 活探针：`https://www.zhidx.com/wp-json/wp/v2/posts?search=<kw>&per_page=20` 返回完整 JSON（title.rendered / link / date / excerpt.rendered），带代理与直连均通，数据新鲜（探针当日 2026-09-06 发布的文章即在其中）。
- 该站是 WordPress——wp-json 是官方 REST 层，比 CDP 抓 XHR 页面更稳、更快、结构更稳。
- 落地：zhidx 源 apiSearch 化（Layer 0），原 CDP 脚本保留为 fallback 层。
- Tier 1（实测双路径）。

### 2. weibo_hot（微博热搜）— ✅ 第三方热榜 API（已落地）

- 登录墙现状：`s.weibo.com` 重定向 Sina Visitor System；`m.weibo.cn` 容器 API 302 要 cookie——官方移动端也绕不开登录。
- 活探针命中两个免凭证公共 API：
  - **60s API**：`https://60s.viki.moe/v2/weibo` → `{code:200, data:[{title, hot_value, link}]}`，开源项目（github.com/vikiboss/60s），可自托管兜底。
  - **codelife**：`https://api.codelife.cc/api/top/list?lang=cn&id=KqndgxeLl9` → 同构数据。
- 风险与缓解：第三方 API 存活率是真实风险（调研过程中 pearktrue API 即因「套餐到期」死亡、vvhan/oioweb 超时）。缓解：60s 开源可自托管 + source-health streak 机制（#200）在 API 死亡时自动亮灯。
- 落地：weibo_hot apiSearch 化（60s API 主），CDP 层保留（登录后仍可用）。
- Tier 1（实测）+ Tier 2（开源仓库）。

### 3. xinzhiyuan（新智元）— ❌ 放弃

- 活探针：HTTPS 直连与走代理均 HTTP 000（连接失败）；HTTP 403。
- 关键证据（Tier 1）：**DNS 解析到 `overdue.aliyun.com`**——阿里云欠费/过期停放页。主机已欠费，站点名存实亡。
- 注意：新智元作为媒体仍活跃（微信公号等），但其独立站不可达；已有 wechat2rss_zhinengyuan（新智元公众号 RSS）覆盖同源内容——**信息无损失**。

### 4. baidu_news（百度资讯搜索）— ❌ 放弃

- 活探针：`baidu.com/ns`（rtt=1/4）、`tn=news`、`news.baidu.com/ns` 三变体均返回空壳（rtt=1 仅 218 字节，无任何结果容器），连「人工智能」热词都「找到相关资讯 0 个」。
- Web 检索：无官方停运公告，但有强旁证——百度近年持续收缩非核心产品（百度脑图 2026-03 停服等）[1][2]，2026 Q1 搜索广告收入同比 -22% [3]、MEG 密集重组 [4]。
- 裁决：功能性死亡（Tier 1 实测）+ 收缩趋势旁证（Tier 2），放弃。若未来恢复，source-health streak 机制与台账可随时重新接入。
- 代价评估：baidu_news 的中文新闻覆盖已由 RSS 众源（机器之心/新智元/量子位等 12 个 wechat2rss feed）+ sogou_weixin 覆盖，损失有限。

## Open Questions

- 60s API 若长期失效：自托管（开源）还是切 codelife——留给运行数据决定。
- xinzhiyuan 若续费复活：DNS 恢复即 health 转绿（源保留在 registry，零成本观察）。

## Sources

1. https://www.zhidx.com/wp-json/wp/v2/posts — 活探针，WordPress REST 实测 — Tier 1
2. https://60s.viki.moe/v2/weibo — 活探针 + https://github.com/vikiboss/60s 开源仓库 — Tier 1
3. https://api.codelife.cc/api/top/list?lang=cn&id=KqndgxeLl9 — 活探针 — Tier 1
4. DNS `www.xinzhiyuan.com → overdue.aliyun.com` — 活探针 — Tier 1
5. https://www.baidu.com/ns?rtt=1 空壳 218 字节 — 活探针 — Tier 1
6. [2026，百度又一个产品要关掉了 - 新浪财经](https://t.cj.sina.cn/articles/view/7692741104/1ca85e9f0001015h3q) — Tier 2
7. [百度搜索广告收入 Q1 同比 -22% - DoNews](https://www.donews.com/article/detail/8828/101660.html) — Tier 2
8. [百度 MEG 组织架构调整 - moomoo 新闻](https://www.moomoo.com/hans/news/post/71154345) — Tier 2
