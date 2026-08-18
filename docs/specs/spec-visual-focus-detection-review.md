# 对 `spec-visual-focus-detection.md` 的 V6 复审

**审阅对象：** `docs/specs/spec-visual-focus-detection.md`（Revised v6）  
**结论：** **批准进入实现。** V6 已关闭 V5 的四项 P1：IdleTimer 采用单一状态源、`exit` 成为无响应控制命令、patch 格式化器只输出人工审阅摘要、golden 与 baseline fixture 被明确分离。当前没有新的 P0 或设计级阻断。下面两项 P1 属于实现稳健性，应随同首个实现 commit 完成并由测试证明。

> V6 保持了正确的 Phase 1a 边界：焦点分析是 source-space 的人工审阅辅助，写入 `media-patch.json`；它不会成为 scene-data 的未知字段，也不会自动改变 Remotion 排版。这使新功能可审计、可回滚，并与 Phase 2 的坐标变换/slot 评分解耦。

## 复审摘要

| 维度 | 判断 | 复审结论 |
|---|---|---|
| 依赖降级、requestId 和 worker reset | **通过** | 延迟加载、明确 errorCode、dispatch 异常收敛、pending Map/generation 和 late-response 隔离保持一致。 |
| Idle 生命周期 | **设计通过，P1 实现加固** | §4.2/§4.4 已收敛为一个 `IdleTimer`；但当前 watchdog 的整段 `sleep(timeout)` 不能保证“idle 60 秒”上界。 |
| `exit` 控制协议 | **通过** | `exit` 不含 requestId、不进入 pending、无 response；Node 等待自然退出 100ms 后再 SIGTERM，前后章节一致。 |
| 人工审阅输出边界 | **通过** | `apply-media-patch.mjs` 应输出注释摘要，复制进 scene-data 的 `media` 对象不含 `analysis` 或 `focusAnalysis`。 |
| Golden 回归门槛 | **通过** | 正面稳定样本成为 CI 阻断门槛；遮挡/侧脸/低光样本转入不阻断的 baseline observation。 |
| 修改范围、指针与依赖文件 | **通过** | 所有既有指针目标存在；Focus 脚本、lock、benchmark 与 fixture 目录均已作为待新增文件列入影响表。 |

## V5 问题关闭对照

| V5 问题 | V6 状态 | 依据 |
|---|---|---|
| idle activity 有两个 `last_activity` 形状 | **已关闭** | §4.2 与 §4.4 都使用 `IdleTimer.touch()`；不再存在标量/列表两种状态源。 |
| `exit` 带 requestId 却不回 envelope | **已关闭** | §4.3 定义 `exit` 为不带 requestId、无 response 的控制命令，并指定 Node 的 100ms graceful-exit / SIGTERM 行为。 |
| patch-only `focusAnalysis` 可能被复制进 scene-data | **已关闭** | §4.7 限定为 `media: {}` 上方的人工审阅注释；集成测试断言 media 对象中没有 `analysis`/`focusAnalysis`。 |
| golden fixture 既称硬门槛又允许不阻断 | **已关闭** | §6、S4/S5 和 §8 将 stable golden 定义为 CI 红线，将遮挡/侧脸/低光样本移入 baseline observation。 |

## P1：实现时应一并完成

### P1-1：IdleTimer 的轮询周期必须小于 timeout，且需要可测试的超时注入

V6 的 `IdleTimer._watchdog()` 现在执行：

```python
while not self._stopped:
    time.sleep(self.timeout)
    if time.monotonic() - self._last >= self.timeout:
        os._exit(0)
```

若 watchdog 刚开始 60 秒 sleep 后出现一次 activity，它在该次醒来时会认为仍未 idle 60 秒，随后又 sleep 整个 60 秒。因此实际退出可接近**最后活动后的 120 秒**，与 S13/S23 “idle 60s”不一致。现有 VLM `IdleTimer` 使用 `Event.wait(10)` 和锁，每 10 秒检查一次，因而不会把 timeout 翻倍。

**建议修订：** Focus 版本直接复用同一模式，或将轮询粒度定义为 `min(1.0, timeout / 10)`。同时用 `threading.Event` 取代裸 `_stopped` boolean，并用 lock 保护 `_last`。建议的验证契约为：

| 场景 | 断言 |
|---|---|
| 无活动 | 在 `IDLE_TIMEOUT ≤ elapsed ≤ IDLE_TIMEOUT + poll_interval` 内退出。 |
| 持续活动 | 每次 `touch()` 后，子进程在下一个完整 timeout 前不得退出。 |
| 测试执行 | 通过构造函数参数或 `FOCUS_IDLE_TIMEOUT_SECONDS` 注入 50–100ms 超时；不得让 CI 等待真实 60 秒。 |
| graceful exit | `timer.stop()` 后 watchdog 不再调用 `os._exit(0)`。 |

### P1-2：将 `apply-media-patch.mjs` 的输出边界写成独立可执行测试文件

§4.7 和 §8 已给出正确行为，但 §6 的修改清单只列出脚本本身，没有显式列出覆盖它的测试文件。现有 `apply-media-patch.mjs` 是面向人工复制的 formatter；输出格式一旦回归，类型系统不会阻止用户把分析对象粘入 scene-data。

建议在 §6 补一行新的测试文件（名称依项目现有约定确定，例如 `__tests__/apply-media-patch.test.mjs`），并在测试中固定以下边界：

1. `ok` / `partial` 输出摘要注释，包含 status、保护框和 saliency 可用性。
2. `degraded` / `unsupported` 输出 warning，而非空洞的可复制配置。
3. `media: { ... }` 代码块只包含现有 `MediaField` 字段，严格不含 `analysis`、`focusAnalysis`、`protectedRegions` 或 `saliency`。
4. 没有 `analysis.focusAnalysis` 的旧 patch 仍输出与当前版本兼容的 media block。

## 文件与指针核查

| 项目 | 结果 | 说明 |
|---|---|---|
| Spec、研究文档、内容管线、渲染类型、layout/verify 和 formatter | **存在** | V6 相关路径均可访问；现有 formatter 的确只输出可复制的 `media` block，故 V6 的注释摘要边界合理且必要。 |
| 现有 VLM IdleTimer | **存在** | `vlm_analyzer.py` 提供了 Event + Lock + 10 秒轮询的可复用模式；Focus 实现应复用其生命周期语义。 |
| 待新增 Focus 脚本、依赖锁和 fixtures | **尚不存在，符合设计阶段** | 已在 §6 正确列为新建文件；首个实现 commit 必须一并加入并让测试覆盖。 |

## 最终判断

**V6 是当前可实施的 Spec 基线。** 没有需要再次重构方案的 P0：命名迁移、独立 Focus 子进程、failure-safe IPC、图片坐标契约、patch-only 消费和历史 `fit` 兼容已形成闭环。

实施时应优先将 P1-1 和 P1-2 与代码一并落地；它们不改变方案范围，却能防止 idle 生命周期变得不可预测，以及避免人工复制输出悄然突破 Phase 1 的数据边界。完成自动契约、协议、集成、patch 和 smoke 测试后，再决定是否进入 Phase 2 的画布坐标变换与自动 slot 评分。

## References

[1]: https://docs.opencv.org/4.13.0/d8/d65/group__saliency.html "OpenCV Saliency API"
[2]: https://pillow.readthedocs.io/en/stable/reference/ImageOps.html#PIL.ImageOps.exif_transpose "Pillow ImageOps.exif_transpose"
