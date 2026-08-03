# Tickets: 字幕渲染重构

## Ticket 1: 替换 CSS @keyframes 为 JS requestAnimationFrame 渲染
**Priority**: P0 (核心修复)
**Depends on**: 无

### 任务
在 `generate-scenes.mjs` 中：
1. 删除 `buildSubtitleCSS()` 函数（生成 `@keyframes sub${i}`）
2. 重写 `buildSubtitleHTML()` — 不再用 CSS animation，改为：
   - 字幕元素用 `id="sub-${i}"` + `opacity: 0` 初始状态
   - 逐词 span 用 `id="word-${i}-${j}"` 
   - 末尾加 `<script>` 块：`requestAnimationFrame` 循环基于 `performance.now()` 控制显隐
3. 字幕显示规则：
   - `pct >= startPct && pct < endPct` → `opacity: 1`
   - 最后一个 chunk → `endPct = 99`（覆盖到结束）
   - 逐词高亮：`pct >= word.startPct && pct < word.endPct` → 白色，否则灰色

### 验收
- [ ] 字幕覆盖整个音频（无空隙）
- [ ] 字幕在下一个 chunk 开始时切换（不消失太快）
- [ ] 逐词高亮正常
- [ ] Playwright 录制后字幕可见

---

## Ticket 2: 改进 splitByWordCount 字符加权
**Priority**: P1 (ASR fallback 改进)
**Depends on**: 无

### 任务
在 `generate-scenes.mjs` 的 `splitByWordCount()` 中：
1. 按字符数（而非词数）分配时间权重
2. 长词（"DeepSeek's" 10 chars）比短词（"a" 1 char）分配更多时间
3. 生成词级时间戳（fallback karaoke）：chunk 内按字符比例分配

### 验收
- [ ] 无 ASR 数据时字幕仍然可用
- [ ] 长词比短词显示时间长
- [ ] 逐词高亮在 fallback 模式下工作

---

## Ticket 3: 删除旧的 CSS 动画残留
**Priority**: P2 (清理)
**Depends on**: Ticket 1

### 任务
1. 删除 `.subtitle-bar` 中残留的 `animation` 属性
2. 删除 `@keyframes wordHl` 如果不再使用
3. 确认 `subtitle-bar` 的 CSS transition 平滑

### 验收
- [ ] 无残留 CSS animation 冲突
- [ ] `npm run lint` 通过
