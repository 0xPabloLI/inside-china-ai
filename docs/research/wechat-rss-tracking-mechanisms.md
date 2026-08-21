# 微信公众号 RSS 获取机制与边界

## 核心结论

RSS 并不是微信公众号原生提供的订阅协议。对任意第三方公众号而言，困难不是生成 RSS XML，而是持续获得“该账号有哪些新文章”的可靠清单。公众号文章详情页只在文章 URL 已知时可读，不能公开枚举任意公众号的完整或增量历史。因此，非官方 RSS 服务都需要一个额外的文章目录上游：项目可公开证实的上游通常是微信读书中的公众号入口、普通微信会话可访问的网页/相关入口，或服务方未披露的内部采集系统。

官方能力只覆盖自有或管理员明确授权的公众号：拥有可用 AppID/AppSecret 与发布能力的运营方可以轮询已发布内容列表，并自行按消息/文章标识去重后转换为 RSS。它不是面向普通读者的“订阅任意公众号”接口。[1] [2]

## 项目和服务的上游路径

| 方案 | 可证实的上游 | 增量与 RSS 机制 | 会话/稳定性边界 |
|---|---|---|---|
| **Wechat2RSS** | 维护者部署资料明确为微信读书中的公众号内容入口。 | 服务管理公众号任务、保留历史文章和发布时间、按历史更新预测检查时间并至少每日检查；新记录输出 RSS/JSON Feed。 | 私有部署需微信读书授权及服务扫码登录；公开免费实例的内部账号/接口实现未完整公开。 |
| **WeWe RSS** | 源码明确调用微信读书平台的公众号映射和文章分页接口。 | 定时刷新，按文章 ID 写库去重，数据库生成 RSS/Atom/JSON。 | 需要微信读书扫码会话；仓库已归档，上游接口、限频和会话风险高。 |
| **We-MP-RSS** | 有普通网页采集模式与可选 `weread_mp` 模式。 | 定时任务拉取记录、写库去重并生成 Atom/RSS。 | 需要扫码会话；不存在可证实的、面向任意公众号且长期承诺的官方历史文章 API。 |

## 自建与账号风险

自建系统通常将流程分为四层：维护上游会话或文章目录、定时读取文章列表、按文章 ID 或规范化 URL 存储与去重、从本地数据库渲染 RSS。自建不会获得新的平台授权；它只将上游会话、限频、数据缺失与故障修复责任转到使用者手中。

若方案使用普通微信或微信读书账号会话访问非官方内容目录，则账号有被会话失效、访问受限或采取其它限制措施的风险。风险大小取决于平台规则、访问频率、账号状态和上游实现，无法从项目代码保证为零。当前项目不使用账号、扫码会话或私有抓取器；它只消费公开 Wechat2RSS Feed，因此把采集层风险留在第三方服务端，但第三方 Feed 仍可能失效或延迟。

## 本项目的边界

本项目将 Wechat2RSS 视为 **第三方公共 RSS 提供者**，而不是微信官方 API。注册表中每个来源必须标注：`provider: wechat2rss`、`access: public-rss`、`official: false`、`stability: third-party` 和 `freshnessWindowDays: 14`。项目不会假设 Wechat2RSS 的私有内部采集实现，也不会依赖或指导规避访问控制的方法。

## References

[1]: https://developers.weixin.qq.com/doc/service/api/public/api_freepublish_batchget "微信公众平台：已发布内容列表接口"
[2]: https://developers.weixin.qq.com/doc/oplatform/Third-party_Platforms/2.0/Third_party_platform_authorization_process.html "微信开放平台：第三方平台授权流程"
[3]: https://github.com/ttttmr/Wechat2RSS "Wechat2RSS 项目与部署资料"
[4]: https://github.com/rachelos/we-mp-rss "We-MP-RSS 项目"
[5]: https://github.com/cooderl/wewe-rss "WeWe RSS 项目"
