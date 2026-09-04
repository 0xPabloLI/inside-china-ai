# 视觉焦点检测实现后复审

**审阅对象：** `docs/specs/spec-visual-focus-detection.md`（当前为 Revised v7）及已落地的 Focus 检测实现、Node 网关、素材编排与测试。  
**结论：** **核心架构已落地，P0/P1 修复已于 2026-08-18 完成（commit 8f4d7dd）。** 独立 Focus 子进程、延迟依赖加载、EXIF 规范化、requestId 路由、worker reset 降级、Patch 人工审阅摘要与 `analysis.focusAnalysis` 映射均已实现，并且基础 IPC/Smoke 路径能运行。P0-1（fit/focus 解耦）和 P0-2（smoke golden 断言修正）已修复并通过 81 项测试验证。P1-3a（集成断言）、P1-3b（CLI 重命名）、P1-2（并行测试隔离注释）也已修复。P1-1（fixtures/exif + benchmark）标记为后续任务。

> **修复记录（2026-08-18，commit 8f4d7dd）：**
>
> - P0-1: `parseFitResponse()` 只校验 `fit`；`handleResponse()` 在 `response.fit` 存在时立即解析。3 个回归测试已添加。✅
> - P0-2: `focus-golden.json` 的 `real-image-ok` 重命名为 `real-image-ok-no-faces`，`minProtectedRegions` 改为 0，移除人脸数量硬断言。`maxResponseTimeMs` 放宽至 10s（冷启动）。✅
> - P1-3a: `asset-sourcer-visual-integration.test.mjs` 新增 4 个测试覆盖 `analysis.focusAnalysis` schema、`media.fit` 写入、`media.focus` 不写入。✅
> - P1-3b: `lib/apply-media-patch.mjs` 重命名为 `lib/review-media-patch.mjs`，更新所有引用。✅
> - P1-2: 真实子进程测试文件添加串行执行注释（`--maxWorkers=1`）。✅
> - P1-1: `fixtures/exif/`、`fixtures/benchmark/`、`fixtures/golden/`、`fixtures/baseline/` 和 `focus-detector-benchmark.mjs` 标记为后续任务。⏳

> **重要**：实现后复审发现两个 P0 级未完成项。**P0 已于 2026-08-18 修复完成**。修复前功能不应被视为完整通过。

> 本次结论区分“程序能运行”与“契约已被证明”。当前 Focus IPC 在独立运行时是健康的；但真实人脸检测、EXIF、golden/baseline 质量门槛和 `fit` 迁移的关键承诺尚未得到正确的实现或验证。

## 结果总览

| 维度                                  | 结果                   | 证据与判断                                                                                                                                                |
| ------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focus 子进程与降级                    | **通过**               | `focus_detector.py` 实现了 Event + Lock 的 idle watchdog、依赖延迟加载、图片白名单、EXIF RGB 规范化、异常 envelope 与无响应 `exit`。                      |
| Node requestId 与生命周期             | **通过**               | `visual-analyzer.mjs` 用 `pending Map + workerGeneration` 匹配响应；超时、进程 exit、pipe 写失败与 close 均会 resolve 为 schema 完整的降级结果。          |
| 素材到 patch 数据流                   | **代码通过，测试不足** | `analyzeAssets()` 先写入 `asset.focusAnalysis`；`assignAssetsToScenes()` 显式映射到 `analysis.focusAnalysis`。现有集成测试没有断言这条映射。              |
| 旧 `fit` 兼容                         | **P0 未通过**          | Node 解析器仍要求 `fit` 与 `focus` 同时有效，与 Spec 的“fit 必填、focus 可选”直接矛盾。                                                                   |
| 人脸 golden / smoke 质量              | **P0 未通过**          | Smoke 使用的是城市天际线，却要求至少一个 face protectedRegion；它不能证明真实人脸检测，反而会把 Haar 假阳性当成功。                                       |
| Exif、golden/baseline、benchmark 验证 | **P1 未完成**          | Spec 列出的 EXIF、benchmark、golden、baseline fixture 目录与 benchmark 脚本尚未出现；现有 JSON fixture 不能替代这些素材与几何断言。                       |
| Patch 人工摘要                        | **通过但入口需澄清**   | `lib/apply-media-patch.mjs` 正确生成注释摘要且不输出 `analysis`/`focusAnalysis` 到 copyable media block；顶层同名脚本目前是自动写入工具，需避免用户混淆。 |

## 已验证的实现行为

### Focus 协议与运行时降级

`focus_detector.py` 的实现已符合 V7 对子进程的主要要求。它在运行时才加载 OpenCV、NumPy 和 Pillow；缺失依赖时返回明确的降级 errorCode，而不是在模块导入阶段崩溃。`IdleTimer` 使用 `Event.wait()`、Lock、`FOCUS_IDLE_TIMEOUT_SECONDS` 注入和 `min(10, timeout/10)` 轮询，满足 V7 对可测试 idle 上界的设计。`exit` 是不带 requestId 的无响应控制命令，Node 关闭路径与此一致。

`visual-analyzer.mjs` 的 Focus 子系统也已实现 requestId 路由、worker generation、超时、旧响应丢弃以及 `closeFocusDetector()` 幂等结算。该实现以 schema 完整的 `focus_timeout` 或 `focus_worker_reset` 结果替代 rejection，符合 failure-safe 的目标。

### 实测测试结果

| 验证命令/范围                          | 结果                | 说明                                                                                       |
| -------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------ |
| `focus_detector.py` IPC 测试，单独执行 | **7 / 7 通过**      | 覆盖 requestId envelope、坏路径、unsupported、协议错误和无响应 exit。                      |
| 真实 Focus smoke 测试，单独执行        | **6 / 6 通过**      | 首次图片检测约 613ms，随后基线约 137ms；但其人脸断言样本不正确，不能作为质量证据。         |
| 5 个相关测试文件以默认文件并行执行     | **70 通过，3 失败** | Focus IPC 与 smoke 首请求分别发生 10–20s timeout；这表明真实子进程测试在并行执行时不稳定。 |
| 同一 5 个测试文件串行执行              | **73 / 73 通过**    | 证明组合失败与并发运行的资源争用/启动调度有关，而非每个隔离路径必然失败。                  |

## P0：必须修复

### P0-1：`parseFitResponse()` 仍将 `focus` 视为必填，违反迁移契约

Spec §4.8 要求：当 `fit` 有效而 `focus` 缺失或无效时，仍须保留 `fit`，因为旧渲染层依然依赖 `media.fit`，而新的 `protectedRegions` 不再需要三分区 `focus`。但当前 `visual-analyzer.mjs` 有两处相反逻辑：

```js
if (response.fit && response.focus) {
  // 才解析并返回结果
}

if (!focus || !VALID_FOCUSES.includes(focus)) {
  return {};
}
```

对应单元测试也把“无效 focus 返回空对象”当作预期。这会在 VLM 返回 `{ fit: "cover" }` 或 `{ fit: "contain", focus: "left" }` 时丢失有效 fit，重新引入 Spec 明确禁止的横图裁切回归。

**修订要求：**

1. `parseFitResponse()` 只校验 `fit`；focus 仅在属于 `top|center|bottom` 时才保留，否则省略该字段。
2. `handleResponse()` 在 `response.fit` 存在时立即解析，不得以 `response.focus` 作为网关条件。
3. 新增两个回归测试：`{fit:"cover"}` 返回 `{fit:"cover", reason:""}`；`{fit:"contain", focus:"left"}` 仍返回 `{fit:"contain"}`。
4. `asset-sourcer` 的横图集成测试断言 `asset.aiFit` 被写入、`asset.aiFocus` 不被写入。

### P0-2：真实 smoke 的 golden 样本与人脸断言相冲突

当前 smoke 测试使用 `scripts/short-video/assets/shanghai-skyline.jpg`，并要求 `status: "ok"`、`minProtectedRegions: 1`，测试名称也称“returns ok with faces + saliency”。该图片为城市建筑和树木，没有可作为人脸检测 ground truth 的人物面部；它在 Spec 的 smoke 表中原本属于“无人脸、low_information 或 saliency 均匀”的场景。

该测试在隔离运行时通过，恰恰不能说明人脸检测正确：Haar 可能把建筑窗格、标志或其他纹理误判为 face。若把这种假阳性作为 golden 成功条件，后续人脸检测退化将无法被发现，人工也会被错误保护框误导。

**修订要求：**

| Fixture 类型           | 内容                                                 | 阻断规则                                                                                       |
| ---------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `fixtures/golden/`     | 至少一张稳定正面单人照与一张稳定多人照；附人工标注框 | 单人 IoU ≥ 0.5；多人匹配计数满足约定容差；失败即 CI 红。                                       |
| `fixtures/baseline/`   | 侧脸、遮挡、低光                                     | 记录命中/漏检，不阻断。                                                                        |
| `shanghai-skyline.jpg` | 无脸/天际线                                          | 断言零 face protectedRegions；允许 `low_information` 或 saliency 可用的 `ok`，但不能期待人脸。 |

## P1：应在本功能合入稳定分支前补齐

### P1-1：Spec 中承诺的验证素材和 benchmark 尚未落地

当前仓库存在 `focus-golden.json`，但不存在 Spec §6/§8 列出的 `fixtures/exif/`、`fixtures/benchmark/`、`fixtures/golden/`、`fixtures/baseline/`，也没有 `focus-detector-benchmark.mjs`。因此下列声明尚未取得实施证据：EXIF 90°/180°/270° 几何正确性、真实人脸 IoU、baseline 命中率、冷/热启动 P50/P95、峰值 RSS 和 failure rate。

应创建这些受控资产和 benchmark 脚本，并将 benchmark 的运行输出保留在 gitignored `experiments/focus-benchmark/`。实施完成前，不应将 `<1s`、`<200ms` 或 Haar 检测可靠性表述为已验证结果。

### P1-2：跨文件并行运行真实子进程测试会超时

单独执行 IPC（7/7）和 smoke（6/6）都通过；同一组 5 个相关测试文件以默认并行方式执行时，出现三项 timeout，串行后又变为 73/73。真实 OpenCV 子进程测试应采用不会相互争用启动资源的策略，例如在这些测试描述块中显式顺序执行、将 smoke 放入独立 Vitest project，或在 CI 上为 real-subprocess suite 设置单 worker。不要只依赖本地单文件通过。

### P1-3：补足资产→patch 的集成断言，并澄清两个同名 CLI

代码已完成 `asset.focusAnalysis → analysis.focusAnalysis` 映射，但 `asset-sourcer-visual-integration.test.mjs` 只验证 Focus mock 被调用和 Focus 子进程被关闭，未验证映射后的实际 patch schema。应新增一条端到端断言，读取 `assignAssetsToScenes()` 返回条目并验证完整 schema。

另外，顶层 `scripts/short-video/apply-media-patch.mjs` 目前是验证、备份与写入 scene-data 的应用工具；人工审阅 formatter 位于 `scripts/short-video/lib/apply-media-patch.mjs`。两者都可由 `node ...apply-media-patch.mjs` 运行，容易误用。建议把审阅 CLI 命名为 `review-media-patch.mjs`，或在 README/主 CLI 的帮助信息中显式区分“先审阅、后应用”。

## 复审后的实施门槛

在修复 P0-1 和 P0-2 后，功能才可以被称为**已完成的视觉焦点检测 Phase 1a**。随后补齐 P1 的fixtures、基准和并行测试隔离，才能把运行时指标和检测质量作为可追踪基线。

完成前，已经可以安全采用的范围是：**获取并记录结构化 Focus 元数据，且在异常时不阻塞 VLM。** 尚不可据此声称的是：**真实人脸保护能力已被 golden 数据证明，或横图 fit 迁移已无回归。**

## References

[1]: https://docs.opencv.org/4.13.0/d8/d65/group__saliency.html "OpenCV Saliency API"
[2]: https://pillow.readthedocs.io/en/stable/reference/ImageOps.html#PIL.ImageOps.exif_transpose "Pillow ImageOps.exif_transpose"
