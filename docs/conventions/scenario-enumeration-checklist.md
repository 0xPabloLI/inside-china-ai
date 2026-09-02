# Scenario Enumeration Checklist

> 在 R2/R3 的决策阶段逐类检查适用场景。S1 把结论记入当前 scope 与验证计划；S2/S3 固化到 spec 的 **Scenario & Risk Verification Matrix**。每行都必须有 evidence，但不一定各自对应一个自动化测试。
>
> 与 `scenario-matrix.md` 互补：本文档定义**查什么**，scenario-matrix 定义**怎么记**。

## 用法

1. 决策阶段：逐类过一遍“要问的问题”，只保留与本次改动相关的场景并给出明确答案。
2. 记录阶段：S1 写入当前 scope/验证计划；S2/S3 写入 Scenario & Risk Verification Matrix（含 Modified Files Impact + Behavioral Scenarios）。
3. 实施阶段：确定且可自动验证的行为走 TDD；其余场景使用静态检查、runtime/real-data smoke 或 human acceptance，并保留行到 evidence 的映射。

---

## 1. Null / Undefined / Empty 边界

**要问的问题**：

- 所有 optional 字段为 `undefined` 时行为是否定义？
- 空数组（`[]`）、空字符串（`""`）、空对象（`{}`）是否独立测试？
- `0` vs `null` vs `undefined` 的语义差异是否处理？
- 使用 `??` 还是 `||` 是否符合 `0`、`false`、`""`、`null`、`undefined` 的业务语义？

**常见陷阱**：

- `value ?? defaultValue` **只在 `value` 为 `null` 或 `undefined` 时走 fallback**，会保留 `0`、`false` 和 `""`。
- `value || defaultValue` 会把 `0`、`false` 和 `""` 也视为 falsy 并走 fallback；这些值有业务意义时常导致 bug。
- Supabase 查询返回 `null` 字段 vs 字段不存在——前端需统一处理。
- `null` 表示"明确无值"（如文章无封面图），`undefined` 表示"未查询"——不可互换。

## 2. 数值精度

**要问的问题**：

- 金额计算是否用整数（分）而非浮点（元）？
- 浮点比较是否用 `|delta| < epsilon` 而非 `===`？
- 百分比计算是否明确单位（0-1 vs 0-100）？
- Supabase `numeric` 类型返回的是字符串，是否正确转换？

**常见陷阱**：

- `0.1 + 0.2 !== 0.3` — 金额计算用整数（分）避免浮点误差。
- `JSON.parse` 大整数丢精度 — 超过 `Number.MAX_SAFE_INTEGER` 用 `BigInt`。
- 百分比单位不一致（前端 0-1，后端 0-100）→ 显示 100x 偏差。

## 3. 状态转换

**要问的问题**：

- 内容状态流转是否完整（draft → published → archived → deleted）？
- 用户角色切换（visitor → authenticated → admin）时 UI 是否正确响应？
- TanStack Query 的 loading / error / success 状态组合是否覆盖？
- 组件 mount / unmount 期间的异步操作是否处理？

**常见陷阱**：

- 状态转换的中间态未处理（如 draft → published 期间的并发编辑）。
- 角色变更后 React Query cache 未清理 → 非 admin 看到 admin 数据。
- 异步操作完成后组件已 unmount → setState on unmounted component。

## 4. 并发 / 竞态

**要问的问题**：

- TanStack Query 的竞态是否自动处理？
- stale data 是否会覆盖 fresh data（staleTime 配置是否合理）？
- 多用户同时编辑同一内容时的冲突处理？
- Supabase Realtime subscription 的消息顺序保证？

**常见陷阱**：

- `Promise.all` 中一个 reject 导致整体 fail → 应用 `Promise.allSettled`。
- Realtime 消息乱序到达 → 状态不一致。用乐观更新 + 冲突检测。
- 多个 mutation 并发触发 → 后到的覆盖先到的（last-write-wins 是否可接受？）。

## 5. 失败 / 降级

**要问的问题**：

- Supabase 连接失败时前端降级路径是否定义？
- API 超时 / 5xx / 网络断开是否分别处理？
- 认证过期（JWT expired）时是否自动刷新 / 重定向登录？
- 部分数据加载失败时是否保持其余数据？

**常见陷阱**：

- 降级返回 `undefined`，消费方未处理 → crash。应返回结构一致的数据。
- 认证过期未处理 → API 返回 401 但前端无感知，用户看到空白。
- Error boundary 未覆盖异步错误 → 白屏。
- Supabase RLS 拒绝访问时返回空数组而非错误 → 前端误以为"无数据"。

## 6. 跨系统键匹配

**要问的问题**：

- 前端 ID 与 Supabase 主键格式是否一致（UUID vs string vs number）？
- 路由参数与数据库查询的 ID 是否正确传递（编码 / 解码）？
- 外键关联是否正确（article_id, subscriber_id 等）？
- Realtime channel name 与表名是否匹配？

**常见陷阱**：

- UUID 大小写不一致（Supabase 返回小写，前端比较时未标准化）。
- 路由参数 `encodeURIComponent` 后的 ID 与数据库查询不匹配。
- 外键为 `null` 时 JOIN 结果与预期不同。

## 7. 多实体组合

**要问的问题**：

- 单条记录 vs 多条记录行为是否一致？
- 空列表 vs 有数据列表 vs 加载中列表的 UI 状态？
- 分页边界（第一页 / 最后一页 / 超出范围）是否处理？
- 批量操作（批量发布 / 批量删除）是否处理部分失败？

**常见陷阱**：

- 空列表未显示 empty state → 用户看到空白。
- 分页 cursor 漏掉最后一条 / 重复某条。
- 批量操作中部分失败时整体回滚 vs 部分成功——需明确定义。

## 8. 跨 Step 接口契约

> 当前 step 产出的字段格式，下游 step 能否直接消费？

**要问的问题**：

- 当前 step 产出的字段格式，下游 step 能否直接消费？
- 当前 step 定义的 key / ID 构造方式，下游 step 是否用相同逻辑？
- 下游 step 是否依赖当前 step 未显式声明的隐式约定？
- 如果当前 step 的产出格式变化，哪些下游 step 会 break？

**验证方法**：

1. 在 grill 阶段写出当前 step 的**接口契约**（产出字段名 + 格式 + 示例值）。
2. 模拟下游 step 的消费场景：用当前 step 的产出作为输入，下游 step 能否正确匹配 / 解析？
3. 如果下游 step 尚未设计，先检查 issue 依赖链，确认下游 step 存在且会消费当前产出。

## 9. CI/CD 交互

**要问的问题**：

- 本地开发环境 vs CI 环境差异是否考虑（node 版本、env 变量）？
- 环境变量存在 vs 缺失时的行为是否定义（Supabase URL / anon key）？
- pre-commit / pre-push hook 的行为是否一致？
- 部署时 database migration 的执行顺序是否正确？

**常见陷阱**：

- 本地 `.env` 有变量但 CI 没有 → 构建通过但运行时 crash。
- Migration 顺序错误 → 外键约束失败。
- Supabase 项目切换（dev → prod）时 env 未更新 → 数据写入错误项目。

---

## 内容平台专项（按需检查）

### C1. 认证 / 授权

- 未登录用户访问 admin 路由 → 重定向登录 vs 403？
- JWT 过期 → 自动刷新 vs 重定向登录？
- Supabase RLS 策略是否覆盖所有表（anon / authenticated / admin）？
- `has_role(_user_id, 'admin')` RPC 的失败路径？
- Social login（如有）的回调 URL 是否一致？

### C2. 内容发布

- 草稿 → 发布的状态转换：并发编辑冲突？
- 发布后修改：创建新版本 vs 覆盖？版本历史是否保留？
- 定时发布：时区处理（UTC vs local）？
- 内容删除：硬删除 vs 软删除？关联数据（评论、订阅）如何处理？
- SEO meta（title / description / og:image）缺失时的 fallback？

### C3. 数据完整性

- Supabase migration 是否可回滚（up + down）？
- 外键约束 + cascade delete 是否符合预期？
- Realtime subscription 断线重连后是否同步缺失数据？
- 文件上传（Supabase Storage）的路径冲突处理？
- 数据库 `numeric` / `jsonb` 类型的前端序列化一致性？

---

## 检查清单速查（Grill 阶段快速过一遍）

```
□ 1. Null / Undefined / Empty 边界
□ 2. 数值精度（整数 vs 浮点 / 百分比单位）
□ 3. 状态转换（内容状态 / 角色 / Query 状态）
□ 4. 并发 / 竞态（TanStack Query / Realtime / 并发编辑）
□ 5. 失败 / 降级（Supabase fail / 认证过期 / RLS 拒绝）
□ 6. 跨系统键匹配（UUID / 路由参数 / 外键 / channel name）
□ 7. 多实体组合（空列表 / 分页 / 批量操作部分失败）
□ 8. 跨 Step 接口契约（产出格式 → 下游消费可行性）
□ 9. CI/CD 交互（env / migration / 项目切换）
□ C1. 认证 / 授权（JWT / RLS / 角色检查）
□ C2. 内容发布（状态转换 / 并发编辑 / 删除策略）
□ C3. 数据完整性（migration / 外键 / Realtime 断线重连）
```
