# Spec: 字幕渲染重构

## 背景

当前字幕用 CSS `@keyframes` 动画渲染。问题：字幕消失太快、不覆盖整个音频、gap-fill 不生效。根因：CSS 百分比动画难以精确控制显示/隐藏时机。

ASR（wav2vec2 forced alignment via text-align.py）生成的时间戳数据是正确的，问题在渲染层。

## 方案

用 JavaScript `requestAnimationFrame` 替代 CSS `@keyframes`：

- 基于实际经过时间（`performance.now()`）控制字幕显示/隐藏
- 字幕在 chunk 开始时间显示，在下一个 chunk 开始时间隐藏
- 最后一个 chunk 显示到音频结束
- 逐词高亮基于 word-level 时间戳

## 改动范围

### Modified Files Impact

| 文件                                      | 修改内容                                                                                                                             | 风险等级 | 评估                                                                    |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------- |
| `scripts/short-video/generate-scenes.mjs` | 替换 `buildSubtitleCSS` + `buildSubtitleHTML` 为 JS 渲染；保留 `splitSubtitles` + `alignWithWhisper` + `splitByWordCount` + gap-fill | High     | 核心渲染逻辑改动。验证：字幕覆盖整个音频、逐词高亮、Playwright 录制正常 |
| `scripts/short-video/generate-tts.mjs`    | 无改动                                                                                                                               | Low      | ASR 流程不变                                                            |
| `scripts/short-video/text-align.py`       | 无改动                                                                                                                               | Low      | 保留 ASR 对齐                                                           |
| `scripts/short-video/verify-video.mjs`    | 无改动                                                                                                                               | Low      | 验证逻辑不变                                                            |

### Behavioral Scenarios

| #   | 场景                       | 预期行为                         | 验证方式                         |
| --- | -------------------------- | -------------------------------- | -------------------------------- |
| 1   | 正常 chunk（2-7 词，1-3s） | 显示到下一个 chunk 开始          | JS elapsed >= next.start → hide  |
| 2   | 最后一个 chunk             | 显示到音频结束（99%）            | JS elapsed >= duration → hide    |
| 3   | chunk 间有间隙             | gap-fill 延长 endPct             | 字幕不留空隙                     |
| 4   | ASR 有词级数据             | 逐词高亮（当前词白色，其余灰色） | word.start <= elapsed < word.end |
| 5   | ASR 无词级数据             | 字符加权 fallback                | 按字符数比例分配词时间           |
| 6   | 极短音频（< 1s）           | 单 chunk 全程显示                | min duration 0.5s                |
| 7   | Playwright 录制            | JS 动画正常录制                  | 视频中字幕可见                   |
| 8   | 12 个场景                  | 每个场景独立字幕时间轴           | 各场景 duration 独立计算         |

## 实现细节

### JS 渲染逻辑（嵌入 HTML）

```javascript
// Subtitle data: [{ text, startPct, endPct, words: [{text, startPct, endPct}] }]
const SUBS = [...];
const DURATION = ${duration}; // seconds
const start = performance.now();

function tick() {
  const elapsed = (performance.now() - start) / 1000;
  const pct = (elapsed / DURATION) * 100;

  // Find current subtitle
  let current = -1;
  for (let i = 0; i < SUBS.length; i++) {
    if (pct >= SUBS[i].startPct && pct < SUBS[i].endPct) {
      current = i;
      break;
    }
  }

  // Show current, hide others
  for (let i = 0; i < SUBS.length; i++) {
    const el = document.getElementById('sub-' + i);
    if (el) el.style.opacity = (i === current) ? '1' : '0';
  }

  // Karaoke word highlighting
  if (current >= 0 && SUBS[current].words) {
    for (const w of SUBS[current].words) {
      const wEl = document.getElementById('word-' + w.id);
      if (wEl) {
        wEl.style.color = (pct >= w.startPct && pct < w.endPct) ? '#f5f5f5' : '#94a3b8';
      }
    }
  }

  if (elapsed < DURATION) requestAnimationFrame(tick);
}
tick();
```

### CSS 变化

- 删除 `@keyframes sub${i}` 动画
- 字幕元素用 `opacity: 0` 初始状态，JS 控制 `opacity: 1`
- 逐词高亮用 `color` 属性，不用 CSS animation

### 保留不变

- `splitSubtitles()` — 仍然是 ASR 优先 + fallback
- `alignWithWhisper()` — ASR 数据处理
- `splitByWordCount()` — 字符加权 fallback
- gap-fill 逻辑 — 已实现
- `text-align.py` — ASR 引擎
