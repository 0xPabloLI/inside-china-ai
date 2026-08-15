# Handoff: Cloud GPU 免费资源配置 + Kaggle 自动化

> **创建时间**：2026-08-15
> **来源 Session**：cloud-gpu-options 调研 + Lightning AI 操作尝试
> **目标**：新 session 接手后，帮用户完成 Kaggle 注册 + API 配置 + Colab 验证 + AutoDL 账号准备

---

## 背景

用户要跑数字人模型（LatentSync 1.6, Sonic, Hallo2/3），本地设备（M2 Pro 32GB + GTX 1080 8GB）无法满足。已调研完成免费/付费云 GPU 方案，文档在 `docs/research/cloud-gpu-options.md`（已更新）。

**当前状态**：
- Lightning AI：已注册，5 credits，但免费额度是**一次性的**（用完就没了），且 "New App" 返回 403。账号可能需要联系 support（support code: 03920104）
- Kaggle：**未注册**，无 API key
- Colab：未验证是否有 Google 账号 GPU 访问权限
- AutoDL：未注册

---

## 待完成任务

### 1. Kaggle 注册 + API 配置（最高优先）

**为什么 Kaggle 是主力**：30h/周免费 GPU（T4 ×2 16GB 或 P100），**每周刷新**，长期可用。

**步骤**：
1. 用户访问 https://www.kaggle.com/ → 用 Google 账号登录
2. 完成手机号验证（必须，否则无法用 GPU）
3. 获取 API key：
   - 点击右上角头像 → Settings → API → Create New Token
   - 下载 `kaggle.json`（含 username + key）
   - 放到 `~/.kaggle/kaggle.json`，`chmod 600 ~/.kaggle/kaggle.json`
4. 安装 CLI：`pip install kaggle`
5. 验证：`kaggle competitions list`（应返回竞赛列表）

**Kaggle 自动化能力**：
- `kaggle kernels push -p <dir>` — 推送 Notebook 到 Kaggle（可指定 GPU accelerator）
- `kaggle kernels status <username/kernel-name>` — 查看运行状态
- `kaggle kernels output <username/kernel-name> -p <dir>` — 下载输出
- `kaggle datasets create -p <dir>` — 上传数据集（用于持久存储模型权重）
- `kaggle datasets download -d <username/dataset-name>` — 下载数据集

**自动化跑数字人推理的流程**：
1. 本地准备 Notebook（.ipynb）：安装依赖 → clone 代码 → 下载模型权重 → 运行推理 → 输出结果
2. `kaggle kernels push -p .`（指定 `"accelerator": "GPU_T4_X2"` in kernel-metadata.json）
3. `kaggle kernels status` 轮询等待完成
4. `kaggle kernels output` 下载结果视频

### 2. Colab 验证

- 用户访问 https://colab.research.google.com/ → 用 Google 账号登录
- 创建新 Notebook → Runtime → Change runtime type → GPU (T4)
- 验证能分配到 GPU

**Colab 限制**：免费 T4 不固定时长，空闲 90min 断连，每日有动态限制。仅做临时测试。

**Colab 自动化**：无官方 CLI，但可用：
- `colab-automate` 第三方工具（不稳定）
- Selenium/Playwright 自动化（复杂，不推荐）
- **推荐**：手动操作 Colab，自动化用 Kaggle

### 3. AutoDL 注册（付费备选）

**为什么 AutoDL 是付费首选**：国内最便宜，按分钟计费，支付宝支付，国内访问快。

**价格对比**（24GB GPU，跑数字人足够）：
| 平台 | GPU | 价格 | 折合人民币 |
|------|-----|------|-----------|
| **AutoDL** | RTX 4090 24GB | ¥1.88/h | ¥1.88/h |
| **AutoDL** | RTX 3090 24GB | ¥1.32/h | ¥1.32/h |
| Vast.ai | RTX 4090 24GB | ~$0.35/h | ~¥2.5/h |
| Lightning AI | L4 24GB | $0.48/h | ~¥3.4/h |
| RunPod | RTX 4090 24GB | $0.69/h | ~¥4.9/h |

**AutoDL GPU 质量不比 Lightning AI 差**：
- AutoDL RTX 4090 半精算力 165.2 TFLOPS > Lightning AI L4 ~120 TFLOPS
- AutoDL RTX 4090 带宽 1008 GB/s > Lightning AI L4 ~300 GB/s
- AutoDL 是独享物理机，Lightning AI 是虚拟化实例
- 两者都完整支持 CUDA 12.x，数字人模型兼容性无差异

**AutoDL 步骤**：
1. 访问 https://www.autodl.com/ → 手机号注册
2. 支付宝充值（最低 ¥10 起充）
3. 算力市场 → 选 RTX 4090 → 创建实例
4. SSH 连接或 JupyterLab 操作

**AutoDL 自动化**：有 API（需控制台获取 token），可创建/启停实例。

### 4. Lightning AI 账户问题

**当前问题**：
- "Cannot create new app. Please, contact support. Support code: 03920104"
- 用户反映登录不上去

**分析**：
- CDP 操作不会导致 ban（只是正常的页面导航和点击）
- "Cannot create new app" 在 CDP 操作前就存在（免费方案限制）
- 登录不上去可能是：session 过期 / Chrome 重启后 cookie 丢失 / 平台临时问题

**建议操作**：
1. 用户自己发邮件给 support@lightning.ai（Agent 不应代发）
2. 邮件内容模板：
   ```
   Hi Lightning AI Support,

   I'm getting "Cannot create new app. Support code: 03920104" 
   when trying to create a new app. I'm on the free tier with 5 credits.
   
   Also having trouble logging in today.
   
   My username: <redacted>
   Email: [user's email]
   
   Could you help?
   ```
3. 如果 Lightning AI 不回复或不解决，直接用 Kaggle + AutoDL 替代

---

## 用户是否给过 Kaggle API key

**没有**。用户没有给过 Kaggle API key。当前 `~/.kaggle/kaggle.json` 不存在，`kaggle` CLI 未安装。

## 用户是否给过 Lightning API key

用户给过 Lightning AI API key（已配置在 `.env.local`、`~/.zshrc`、`~/.lightning/credentials.json` 中）。但该 key 权限不足，无法创建 Studio/App（403 error）。

---

## 推荐的下一步操作顺序

1. **Kaggle 注册**（手动，用户操作浏览器）→ 获取 API key → 配置 CLI
2. **Colab 验证**（手动，快速验证 T4 可用）
3. **AutoDL 注册**（手动，付费备选）
4. **Lightning AI 联系 support**（用户自己发邮件）
5. **Kaggle 自动化测试**（Agent 帮忙）：用 Kaggle CLI 推送一个测试 Notebook，验证 GPU 分配和自动化流程

---

## Suggested Skills

- `web-access`：用户 Chrome CDP 操作（Kaggle 注册引导、AutoDL 页面查看）
- `research`：调研 Kaggle API 具体参数和 Notebook 格式要求
- `handoff`：如果需要再拆分任务

## 相关文档

- `docs/research/cloud-gpu-options.md` — 完整 GPU 方案对比（已更新 2026-08-15，含 AutoDL vs Lightning AI GPU 质量对比）
- `docs/research/digital-human-solutions-m2-pro.md` — 数字人模型评估
- `docs/research/tailscale-remote-gpu-setup.md` — GPU 机器远程部署

## 已完成的工作

- ✅ 从 Chrome Secure Preferences 复原 28 个插件（含 MetaMask）到 Preferences 文件
- ✅ 设置 LaunchAgent 自动恢复插件
- ✅ Lightning AI 定价页面完整抓取（确认免费额度是一次性）
- ✅ Lightning AI 官方文档阅读（AI Studio、Quickstart、FAQ）
- ✅ AutoDL 定价页面完整抓取（含 GPU 算力排名）
- ✅ `docs/research/cloud-gpu-options.md` 已更新（修正 Lightning AI 额度性质 + Kaggle 提升为主力推荐 + 新增 AutoDL vs Lightning AI GPU 质量对比）
- ✅ Memory 已更新（修正 Lightning AI 免费额度为一次性）
