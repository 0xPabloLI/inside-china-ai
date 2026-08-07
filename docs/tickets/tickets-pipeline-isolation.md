# Tickets: 多 Pipeline 隔离架构

## Ticket 1: 创建 content/ 目录结构 + 移动 scene data
**Priority**: P0
**Depends on**: 无

### 任务
1. 创建 `content/deepseek/`、`content/distillation/pt1/`、`pt2/`、`pt3/` 目录
2. 从 git history 恢复原始 DeepSeek scene-data.mjs（当前已被改为蒸馏 pt3）
3. 移动 scene-data-pt1/2/3.mjs 到对应 content 目录
4. 每个目录创建 `meta.mjs`（pipelineId 标识）

### 验收
- [ ] `content/deepseek/scene-data.mjs` 存在且是 DeepSeek 内容
- [ ] `content/distillation/pt1/scene-data.mjs` 存在
- [ ] 每个目录有 `meta.mjs`

---

## Ticket 2: 拆分 generate-scenes.mjs → lib/ + content/deepseek/scenes.mjs
**Priority**: P0
**Depends on**: Ticket 1

### 任务
1. 提取共享代码到 `lib/base-styles.mjs`（baseStyles, LOGO_SVG, BRAND_MARK_SVG, subtitle CSS）
2. 提取场景渲染逻辑到 `lib/scene-renderer.mjs`（splitSubtitles, alignWithWhisper, splitByWordCount, generateSceneHTML 框架）
3. 移动 s1-s12 场景生成器到 `content/deepseek/scenes.mjs`
4. `content/deepseek/scenes.mjs` export `generateScene(sceneId, duration)` 函数

### 验收
- [ ] `lib/base-styles.mjs` 可独立 import
- [ ] `content/deepseek/scenes.mjs` export generateScene
- [ ] `generate-scenes.mjs` 改为 re-export 或删除

---

## Ticket 3: 移动基础设施文件到 lib/
**Priority**: P1
**Depends on**: 无

### 任务
1. 移动 `generate-tts.mjs` → `lib/generate-tts.mjs`
2. 移动 `generate-srt.mjs` → `lib/generate-srt.mjs`
3. 移动 `assemble.mjs` → `lib/assemble.mjs`
4. 移动 `record-scenes.mjs` → `lib/record-scenes.mjs`
5. 移动 `generate-bgm.mjs` → `lib/generate-bgm.mjs`
6. 更新所有 import 路径

### 验收
- [ ] 所有 import 路径正确
- [ ] `node main.mjs --content deepseek` 能跑到 TTS 步骤

---

## Ticket 4: 更新 main.mjs — --content 参数 + 输出隔离
**Priority**: P0
**Depends on**: Ticket 1, 2, 3

### 任务
1. 加 `--content` 参数，默认 "deepseek"
2. 动态加载 `content/{contentDir}/meta.mjs` + `scene-data.mjs` + `scenes.mjs`
3. 输出目录改为 `output/{meta.pipelineId}/`
4. 所有子步骤（TTS、录制、拼接、字幕）输出到隔离目录
5. 移除旧的 `--scene` 参数（或保留为别名）

### 验收
- [ ] `node main.mjs --content deepseek --bgm` 产出 `output/deepseek/final.mp4`
- [ ] `node main.mjs --content distillation/pt1` 产出 `output/distillation-pt1/final.mp4`
- [ ] 两个 pipeline 并行跑不冲突
