# MuAPI 异步任务模式调研 — SamurAIGPT/Generative-Media-Skills `/core`（2026-09-06）

> 来源：https://github.com/SamurAIGPT/Generative-Media-Skills （MIT，~4.2k stars，活跃维护）。调研对应 issue #207。
> 方法：GitHub API 拉取 `/core` 全部 18 个文件 + `/library` 3 个代表性 SKILL.md 全文（3d-logo-animation、youtube-thumbnail、social-media-video）。
> **边界（硬性）**：本文只提炼模式。不注册 MuAPI、不付费、不安装 `muapi-cli`、不新增任何 npm 依赖。所有引用的源码均为 MIT 许可的 bash 脚本，仅作为机制参考。
> 决策级结论：§6 取舍表；落地建议需另开独立 issue（见 §7）。

## 1. 仓库概览

仓库分三层，全部围绕"Agent 读 SKILL.md → 照单执行 CLI"的思路：

| 层 | 内容 | 机制 |
|---|---|---|
| `/core/platform` | setup + 结果轮询 | `setup.sh`（auth）、`check-result.sh`（按 request_id 轮询/单查） |
| `/core/media` `/core/edit` | 生成/编辑原语 | 8 个 bash 脚本，每个都是「提交→request_id→轮询→outputs[0]」的同构实现 |
| `/library` | 41 个配方 SKILL.md | 纯文档：Inputs 表 + Steps 分阶段正文，Agent 自己串联 `/core` 的 CLI |

关键洞察：**异步编排逻辑不在库代码里，而在 SKILL.md 的文字协议里**；`/core` 只提供薄薄的任务原语。两个模式分别对应 §2 和 §3。

## 2. 模式一：统一异步任务 API（提交 → task ID → 轮询 → 结果）

### 2.1 模式图

```
┌────────────── Agent / 批处理脚本 ──────────────┐
│                                                │
│  ① submit   POST {base}/{endpoint}             │
│     payload 按 schema 动态裁剪                  │
│          │                                     │
│          ▼                                     │
│  ② request_id ──── 若 --async：立即输出 JSON 返回，│
│          │         Agent 干别的事/落盘/断点续传   │
│          ▼  否则同步轮询                         │
│  ③ poll loop (每 POLL_INTERVAL=5s)              │
│     GET /predictions/{request_id}/result        │
│          │   status: queued/processing/...      │
│          │   （状态变化时打 stderr 进度行）        │
│    ┌─────┼──────────┐                          │
│    ▼     ▼          ▼                          │
│ completed   failed    timeout(MAX_WAIT)        │
│  outputs[0] .error    打印 request_id + 提示     │
│  → 下载/open  exit 1   "check-result.sh --id"   │
│  stdout 输出原始 JSON  │              exit 1     │
└──────────┼──────────┴──────────────────────────┘
           │ stdout = 机器可读 JSON，stderr = 人读日志
           ▼
  ④ check-result.sh --id <ID> [--once|--timeout N]
     → 任务与轮询分离，任何一次轮询中断都可恢复
```

### 2.2 机制细节（源码级）

**同构脚本族**：`core/media/generate-video.sh`、`generate-image.sh`、`image-to-video.sh`、`core/edit/edit-image.sh` 等全部实现同一状态机，只是 endpoint/payload 不同。以 `core/media/generate-video.sh` 为准：

- **提交**：`curl -X POST "${MUAPI_BASE}/${ENDPOINT}"`，返回 `.request_id`。提交侧错误（`.error` 或 `.detail`）立即 exit 1，**不进入轮询**——错误分类只有两类：提交失败（同步、快速失败）与执行失败（`status=failed`，含 `.output.error`）。
- **轮询**：固定间隔 `POLL_INTERVAL=5`（图片 3s），上限 `MAX_WAIT=600/300s`，无指数退避、无 jitter——它们判定这是 Agent 场景，宁可简单。`LAST_STATUS` 变化才打日志，避免刷屏。
- **双模式**：`--async` 只拿 request_id 就返回；默认同步等完。同脚本还有 `--status ID` / `--result ID` 单查子命令。
- **输出协议**：最终结果 JSON 一律走 **stdout**，进度/成功提示走 **stderr**，配 `--json` 静音 stderr——下游可以用管道 `| jq` 无损消费。
- **超时语义**：超时不是失败，exit 1 时**回显 request_id** 和恢复命令（"Check: bash check-result.sh --id ..."），把「未完成的任务」显式交还调用方。
- **轮询与提交分离**：`core/platform/check-result.sh --id X [--once|--timeout|--json|--jq]` 是独立入口，README 的编排建议就是 `--no-wait --jq '.request_id'` 提交、干别的事、再 `muapi predict wait` 收割。

**两种多模型接入方式**（同仓两种并存）：

1. **schema 驱动**（`generate-video.sh` / `generate-image.sh`）：模型→endpoint→参数集全部从根目录 `schema_data.json` 读（`jq '.input_schema.schemas.input_data.endpoint_url'` + `properties | keys[]`），payload 只放模型声明支持的字段；模型不支持 `aspect_ratio` 时按查表映射成 `width/height` 像素。改一个模型 = 改一行数据，不改脚本。
2. **case 映射**（`image-to-video.sh`）：16 个模型名硬编码 `case $MODEL in ... ENDPOINT=...`，payload 差异（veo3 用 `images_list` 数组、kling 支持 `last_image` 尾帧）在构建处 if-else。模型少且参数异构时更直白。

**没有做的**：无重试、无并发控制、无队列、无任务持久化（request_id 只存在于 stdout/Agent 记忆里）。作者把可靠性完全交给了「Agent 会重试、会记录」这一前提。

## 3. 模式二：SKILL.md 配方格式（Inputs + Steps，Agent 照单串联）

三个样本的公共骨架完全一致：

```markdown
---
slug: muapi-3d-logo-animation
name: ...
version: "1.0.0"
description: 一句话能力描述
acceptLicenseTerms: true
---
# 标题 + 一句话定位

## Inputs
| Name | Type | Required | Default | Description |
| logo_image | image_url | yes | — | ... |
| material_style | text | no | glossy glass and chrome | ... |

## Steps
### Phase A — ...（阶段化，每阶段产出是下一阶段的输入）
1. **步骤名** — `muapi image edit` (model=`nano-banana-2-edit`)：
   - Reference Image: `{{logo_image}}`        ← 占位符显式注入
   - Prompt: `...完整提示词模板，含 {{material_style}}...`
   - Aspect ratio: 1:1 or 4:3
（每阶段之间插入人工确认点：Present to the user for approval.）

## Trigger Keywords
`3d logo`, ...

---
## Notes for the Executing Agent（固定页脚，三件套）
- 本配方是 LLM-orchestrated：读阶段→补齐缺失输入→调 CLI；key 未配置先跑 auth。
- 无 CLI 别名的模型回退裸 curl POST + `muapi predict wait <request_id>`。
- 调用前把 `{{input_name}}` 占位符替换为真实输入。
```

值得注意的设计选择：

- **Steps 不是代码而是"调用规格"**：指定「用哪个 CLI 子命令 + model= + 哪些参数 + 来自哪个输入占位符」，执行细节（轮询、上传本地文件、错误处理）全部下沉到 `/core` 脚本，SKILL.md 零代码。
- **`{{placeholder}}` 显式数据流**：阶段间传递的就是输入名，Agent 不需要理解内部状态。
- **人工确认点是配方的正文一部分**（"Present the 3D logo to the user for approval"），与 HITL 同构。
- **页脚三件套标准化**：每个配方结尾复制同一段「执行者须知」，保证任何 Agent 读到都有相同的兜底路径（CLI 缺失→裸 API；key 缺失→setup）。
- 复杂配方（`library/social/social-media-video/SKILL.md`）会带 **决策表**：什么场景选什么模式（t2v/i2v/first-last）、什么用途选什么模型、平台规格表、prompt 检查清单——把领域判断写成表格让 Agent 查表而非自由发挥。

## 4. 对照我们的管线

`scripts/short-video/` 现状（均只读头部确认）：

- `lib/render-remotion.mjs`：Remotion 渲染编排——查 node_modules→拼 props→`npx remotion render` 子进程→ffmpeg 一次收尾。已经是「提交+等待」一体，但等待的是本地子进程，无 request_id 概念，天然不需要轮询。
- `lib/tts/cache.mjs`（#198）：sha1(engine name+config+text) 缓存，sidecar meta，**fail-open**（meta 不可读/键不匹配→重算）。
- `lib/vlm-cache.mjs`（#189/#100）：统一 envelope `{ok, data, error, meta:{model,promptVersion,pipelineVersion,...}}`，**失败结果永不落盘**，原子写（tmp+rename），版本号入缓存键。
- `lib/b-roll/orchestrator.mjs`：`planScenes` 纯路由（skip/generate + reason）→ report.mjs 缓存/轮次规则 → gate.mjs 评分 → 报告落盘；"never throws for expected failure modes"。
- `verify-remotion-frames.mjs`：exit 0/1 的像素级验证门。

对比结论：我们的管线**在缓存与失败语义上比对方成熟**（envelope、版本键、fail-open、纯函数路由都是对方没有的），但在**远端异步任务的"可恢复中断"上对方更完整**——我们没有把「远端任务 ID 落盘 + 独立轮询入口」作为一等原语，而这是 Kaggle/Modal 场景（`docs/research/cloud-gpu-options.md` 硬件路由）迟早要面对的：Kaggle kernel 提交后进程可能退出，30 分钟后再来收割。

## 5. 可套用的接口草案（不新增依赖，纯 Node .mjs）

若未来为 Kaggle/Modal/云端生成引入远端异步任务，按对方模式 + 我们的 envelope 约定做一层薄原语（示意，非实现授权）：

```
scripts/short-video/lib/remote-task.mjs
  submitTask({ stage, provider, payload })  → { requestId, endpoint }
  pollTask(requestId, { intervalMs=5_000, maxWaitMs=600_000 })
      → { ok:true, data } | { ok:false, error:{ kind:'failed'|'timeout', requestId } }
  resumeTask(taskId)   // 从落盘的 task 文件恢复轮询
  // task 登记：{contentDir}/remote-task-{stage}.json（沿用 b-roll/report.mjs 的落盘风格）
  // 结果遵守 #100 envelope：{ ok, data, error, meta:{ provider, requestId, durationMs } }
  // stdout 只出 JSON，日志走 stderr（与现有脚本一致）
  // 超时时 error 里必须带 requestId → resumeTask 可恢复，与 check-result.sh 语义对齐
```

要点（均源自 §2 机制）：任务 ID 必须落盘（对方靠 Agent 记忆，我们要靠文件）；轮询与提交拆成两个 CLI 入口（对应 `--async` 与 `check-result.sh --id`）；错误只分「提交失败/执行失败/超时」三类，超时可恢复不算终态。

SKILL.md 配方格式对我们的可套用面较窄：我们已有 `short-video-pipeline` skill + `docs/content-pipeline.md`（含 HITL），流程文档的「Inputs+Steps+占位符」骨架可借鉴用于**新增云端生成阶段**的文档（阶段化步骤 + 人工确认点写进正文），不需要引入 frontmatter/Trigger Keywords 那套。

## 6. 取舍表

| 对方机制 | 判定 | 理由 |
|---|---|---|
| submit → request_id → 轮询 → 结果的统一状态机 | **直接可用（思想）** | Kaggle/Modal 远端任务同构；配合现有 envelope 落地 |
| 任务 ID 落盘 + 独立轮询入口（check-result.sh / `--async`） | **直接可用** | 补我们「远端任务中断可恢复」缺口；Kaggle kernel 必需 |
| 错误三分类（提交失败/执行失败/超时可恢复） | **直接可用** | 简单充分，与我们 "never throws for expected failure" 一致 |
| stdout=JSON / stderr=日志、`--json` 静音 | **直接可用** | 我们管线已同惯例，保持即可 |
| schema_data.json 驱动端点/参数裁剪 | **暂不抄** | 我们多模型接入面小（本地 MLX/MPS + 少量云），数据驱动白增一层间接；模型多了再议 |
| envelope / 版本键 / fail-open 缓存 / 纯函数路由 | **不用抄** | 对方没有，我们的 vlm-cache、tts/cache、b-roll 已更成熟 |
| muapi-cli、`muapi predict wait`、19 个 MCP 工具 | **不抄** | 绑定 MuAPI 付费服务；本调研不注册、不付费、不装 CLI |
| bash 实现（每个脚本复制一遍轮询循环） | **不抄** | 我们是 Node .mjs；且对方代码重复度高是反例，应抽成单文件 lib |
| `--view`（macOS open）、`media_outputs/` 临时命名、每脚本 source .env | **不抄** | 与 `docs/media-asset-management.md` 及现有 env 约定冲突 |
| SKILL.md frontmatter/Trigger Keywords/acceptLicenseTerms | **不抄** | 我们有 skill 体系与 content-pipeline，两套格式并存徒增维护 |
| 配方的「Inputs 表 + 阶段化 Steps + {{占位符}} + 人工确认点」骨架 | **按需借鉴** | 仅在新增云端生成阶段的管线文档中使用 |

## 7. 落地建议（**需开独立 issue**，本文不动任何代码）

若确认要接 Kaggle 免费 GPU 的异步提交-收割流程（`docs/research/cloud-gpu-options.md` 路由），建议开独立 issue 实现 §5 的 `lib/remote-task.mjs`：

1. 先做最小闭环：`submit` + 落盘 task 文件 + `resume` 三个函数，轮询逻辑内联在 resume 里（对应对方 check-result.sh 的 `--once`/`--timeout` 两档）。
2. 错误 envelope 沿用 #100 格式，`error.kind: 'submit'|'failed'|'timeout'`，timeout 必带 requestId。
3. 不引入任何新依赖；Kaggle/Modal 的 API 调用按工具准入流程另行评审（proposal-review），本文不推荐具体服务。
4. 在 `docs/content-pipeline.md` 新增云端生成阶段时，套用配方骨架写阶段化 Steps（含 HITL 确认点），不引入新文档格式。
