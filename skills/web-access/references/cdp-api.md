# CDP Proxy API 参考

## 基础信息

- 地址：`http://localhost:3456`
- 启动：`node ~/.agents/skills/web-access/scripts/cdp-proxy.mjs &`
- 启动后持续运行，不建议主动停止（重启需 Chrome 重新授权）
- 强制停止：`pkill -f cdp-proxy.mjs`

## API 端点

### GET /health
健康检查，返回连接状态。
```bash
curl -s http://localhost:3456/health
```

### GET /targets
列出所有已打开的页面 tab。返回数组，每项含 `targetId`、`title`、`url`。
```bash
curl -s http://localhost:3456/targets
```

### GET /new?url=URL
创建新后台 tab，自动等待页面加载完成。返回 `{ targetId }`.
```bash
curl -s "http://localhost:3456/new?url=https://example.com"
```

### GET /close?target=ID
关闭指定 tab。
```bash
curl -s "http://localhost:3456/close?target=TARGET_ID"
```

### GET /navigate?target=ID&url=URL
在已有 tab 中导航到新 URL，自动等待加载。
```bash
curl -s "http://localhost:3456/navigate?target=ID&url=https://example.com"
```

### GET /back?target=ID
后退一页。
```bash
curl -s "http://localhost:3456/back?target=ID"
```

### GET /info?target=ID
获取页面基础信息（title、url、readyState）。
```bash
curl -s "http://localhost:3456/info?target=ID"
```

### POST /eval?target=ID
执行 JavaScript 表达式，POST body 为 JS 代码。
```bash
curl -s -X POST "http://localhost:3456/eval?target=ID" -d 'document.title'
```

### POST /extract?target=ID
提取页面正文为干净 Markdown。POST body 为 JSON `{"selector":"#js_content"}`，selector 可选。

- 传 selector → 精确提取指定容器内的正文
- 不传 selector → 自动检测常见正文容器（article、main、#content、#js_content 等），取首个 innerText > 200 字符的
- 转换逻辑：H1-H6 → Markdown 标题，PRE → 代码块，A → 链接，IMG → 图片，UL/OL → 列表，TABLE → Markdown 表格，BLOCKQUOTE → 引用
- 跳过 SCRIPT/STYLE/NOSCRIPT/SVG/IFRAME/FORM 及 `display:none` / `aria-hidden` 元素
- 返回 `{"value":"# 标题\\n\\n正文内容..."}`

```bash
# 精确提取（已知网站）
curl -s -X POST "http://localhost:3456/extract?target=ID" -d '{"selector":"#js_content"}'

# 自动检测（未知网站）
curl -s -X POST "http://localhost:3456/extract?target=ID" -d '{}'

# 也接受纯 CSS 选择器字符串（非 JSON）
curl -s -X POST "http://localhost:3456/extract?target=ID" -d '#js_content'
```

与 `/eval` 的区别：`/eval` 执行任意 JS（通用），`/extract` 专做正文→Markdown 转换（省 token）。需要文章正文内容时优先用 `/extract`；需要查询特定 DOM 数据、操控元素时用 `/eval`。

### POST /click?target=ID
JS 层面点击（`el.click()`），POST body 为 CSS 选择器。自动 scrollIntoView 后点击。简单快速，覆盖大多数场景。
```bash
curl -s -X POST "http://localhost:3456/click?target=ID" -d 'button.submit'
```

### POST /clickAt?target=ID
CDP 浏览器级真实鼠标点击（`Input.dispatchMouseEvent`），POST body 为 CSS 选择器。先获取元素坐标，再模拟鼠标按下/释放。算真实用户手势，能触发文件对话框、绕过部分反自动化检测。
```bash
curl -s -X POST "http://localhost:3456/clickAt?target=ID" -d 'button.upload'
```

### POST /setFiles?target=ID
给 file input 设置本地文件路径（`DOM.setFileInputFiles`），完全绕过文件对话框。POST body 为 JSON。
```bash
curl -s -X POST "http://localhost:3456/setFiles?target=ID" -d '{"selector":"input[type=file]","files":["/path/to/file1.png","/path/to/file2.png"]}'
```

### GET /scroll?target=ID&y=3000&direction=down
滚动页面。`direction` 可选 `down`（默认）、`up`、`top`、`bottom`。滚动后自动等待 800ms 供懒加载触发。
```bash
curl -s "http://localhost:3456/scroll?target=ID&y=3000"
curl -s "http://localhost:3456/scroll?target=ID&direction=bottom"
```

### GET /screenshot?target=ID&file=/tmp/shot.png
截图。指定 `file` 参数保存到本地文件；不指定则返回图片二进制。可选 `format=jpeg`。
```bash
curl -s "http://localhost:3456/screenshot?target=ID&file=/tmp/shot.png"
```

## /eval 使用提示

- POST body 为任意 JS 表达式，返回 `{ value }` 或 `{ error }`
- 支持 `awaitPromise`：可以写 async 表达式
- 返回值必须是可序列化的（字符串、数字、对象），DOM 节点不能直接返回，需要提取属性
- 提取大量数据时用 `JSON.stringify()` 包裹，确保返回字符串
- 根据页面实际 DOM 结构编写选择器，不要套用固定模板

## 错误处理

| 错误 | 原因 | 解决 |
|------|------|------|
| `Chrome 未开启远程调试端口` | Chrome 未开启远程调试 | 提示用户打开 `chrome://inspect/#remote-debugging` 并勾选 Allow |
| `attach 失败` | targetId 无效或 tab 已关闭 | 用 `/targets` 获取最新列表 |
| `CDP 命令超时` | 页面长时间未响应 | 重试或检查 tab 状态 |
| `端口已被占用` | 另一个 proxy 已在运行 | 已有实例可直接复用 |
