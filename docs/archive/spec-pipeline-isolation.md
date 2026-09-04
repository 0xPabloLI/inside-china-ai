# Spec: 多 Pipeline 隔离架构

## 目标

将内容（场景数据+视觉模板）与基础设施（pipeline 引擎）彻底分离，支持多篇文章并行跑 pipeline，互不干扰。

## 架构

```
scripts/short-video/
├── main.mjs                       # Pipeline 引擎入口 — --content 参数
├── lib/                            # 基础设施（所有 pipeline 共享，不含任何内容）
│   ├── base-styles.mjs           # 共享 CSS（baseStyles, subtitle-bar, watermark）
│   ├── scene-renderer.mjs        # generateSceneHTML, splitSubtitles, buildSubtitleHTML
│   ├── generate-tts.mjs          # TTS 引擎
│   ├── generate-srt.mjs           # SRT/ASS 生成
│   ├── record-scenes.mjs         # Playwright 录制
│   ├── assemble.mjs              # FFmpeg 拼接 + 字幕烧录
│   └── generate-bgm.mjs          # BGM 生成
├── content/                        # 内容收纳 — 每篇文章/系列一个目录
│   ├── deepseek/                  # DeepSeek 融资轮
│   │   ├── meta.mjs              # { pipelineId: "deepseek", title: "..." }
│   │   ├── scene-data.mjs        # 口播文字、屏幕文字、场景顺序
│   │   └── scenes.mjs            # 12 个场景 HTML 生成器（从 generate-scenes.mjs 提取）
│   └── distillation/              # 蒸馏风波系列
│       ├── pt1/
│       │   ├── meta.mjs
│       │   ├── scene-data.mjs
│       │   └── scenes.mjs        # 待创建（蒸馏专用视觉模板）
│       ├── pt2/ (同上)
│       └── pt3/ (同上)
├── output/                         # 按 pipelineId 隔离
│   ├── deepseek/
│   │   ├── audio/
│   │   ├── subtitle-timing.json
│   │   ├── subtitles.ass
│   │   └── final.mp4
│   └── distillation-pt1/
│       └── ...
└── assets/                         # 共享资源（录音、logo、BGM）
```

## 运行方式

```bash
# DeepSeek
node main.mjs --content deepseek --bgm

# 蒸馏 pt1
node main.mjs --content distillation/pt1 --bgm

# 无 --content 时默认 deepseek
node main.mjs --bgm
```

## content/ 目录约定

每个内容目录必须有 3 个文件：

- `meta.mjs` — `export const meta = { pipelineId: "deepseek", title: "..." }`
- `scene-data.mjs` — `export const scenes = [...]`
- `scenes.mjs` — `export function generateScene(sceneId, duration) { return html }`（视觉模板）

## main.mjs 改动

```javascript
// 加载 content 目录
const contentDir = getArg("content") || "deepseek";
const { meta } = await import(`./content/${contentDir}/meta.mjs`);
const { scenes } = await import(`./content/${contentDir}/scene-data.mjs`);
const sceneGen = await import(`./content/${contentDir}/scenes.mjs`);

// 输出到隔离目录
const outputDir = join(__dirname, "output", meta.pipelineId);
```

## Modified Files Impact

| 文件                     | 修改                                                                                      | 风险   | 评估                                                                                    |
| ------------------------ | ----------------------------------------------------------------------------------------- | ------ | --------------------------------------------------------------------------------------- |
| `generate-scenes.mjs`    | 拆分：共享部分→lib/，DeepSeek 场景→content/deepseek/scenes.mjs                            | High   | 核心重构。验证：DeepSeek pipeline 正常出视频                                            |
| `main.mjs`               | 加 --content 参数，动态加载 content 目录                                                  | Medium | 改动入口逻辑。验证：--content deepseek 和 --content distillation/pt1 都能跑             |
| `scene-data.mjs`         | 移到 content/deepseek/scene-data.mjs（当前内容是蒸馏 pt3，需从 git 恢复原 DeepSeek 数据） | Medium | scene-data.mjs 已被其他 session 改为蒸馏 pt3。需要从 git history 恢复 DeepSeek 原始数据 |
| `scene-data-pt1/2/3.mjs` | 移到 content/distillation/pt1/2/3/scene-data.mjs                                          | Low    | 文件移动                                                                                |
| `generate-tts.mjs`       | 移到 lib/，输出路径改为 output/{pipelineId}/audio/                                        | Low    | outputDir 已是参数                                                                      |
| `assemble.mjs`           | 移到 lib/，输出路径改为 output/{pipelineId}/                                              | Low    | outputDir 已是参数                                                                      |
| `generate-srt.mjs`       | 移到 lib/，输出路径改为 output/{pipelineId}/                                              | Low    | outputPath 已是参数                                                                     |
| `record-scenes.mjs`      | 移到 lib/                                                                                 | Low    | 文件移动                                                                                |
| `generate-bgm.mjs`       | 移到 lib/                                                                                 | Low    | 文件移动                                                                                |

## Behavioral Scenarios

| #   | 场景                         | 预期行为                                                    | 验证方式                                              |
| --- | ---------------------------- | ----------------------------------------------------------- | ----------------------------------------------------- |
| 1   | `--content deepseek`         | 加载 content/deepseek/ 下 3 个文件，输出到 output/deepseek/ | 输出目录存在且有 final.mp4                            |
| 2   | `--content distillation/pt1` | 加载 content/distillation/pt1/ 下 3 个文件                  | 输出到 output/distillation-pt1/                       |
| 3   | 无 --content                 | 默认加载 content/deepseek/                                  | 同场景 1                                              |
| 4   | 两个 pipeline 并行跑         | 各自输出目录独立，无文件冲突                                | output/deepseek/ 和 output/distillation-pt1/ 同时存在 |
| 5   | content 目录缺少 scenes.mjs  | 报错退出，不产生输出                                        | console.error + exit(1)                               |
| 6   | 视觉模板和音频匹配           | 场景 HTML 中的文字与 TTS 口播文字一致                       | 人工检查                                              |
| 7   | 字幕烧录                     | subtitles.ass 在 output/{pipelineId}/ 下                    | 文件存在                                              |
| 8   | 旧 output/ 目录残留          | 不影响新 pipeline 运行                                      | 新 pipeline 只写自己的子目录                          |
