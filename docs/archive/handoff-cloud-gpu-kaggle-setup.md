# Handoff: Cloud GPU 免费资源配置 + Kaggle 自动化

> **创建时间**：2026-08-15
> **来源 Session**：cloud-gpu-options 调研 + Lightning AI 操作尝试
> **目标**：新 session 接手后，帮用户完成 Kaggle 注册 + API 配置 + Colab 验证 + AutoDL 账号准备

---

## 背景

用户要跑数字人模型（LatentSync 1.6, Sonic, Hallo2/3），本地设备（M2 Pro 32GB + GTX 1080 8GB）无法满足。已调研完成免费/付费云 GPU 方案，文档在 `docs/research/cloud-gpu-options.md`（已更新）。

**最终状态**：
- Kaggle：✅ 已配置（CLI v2.2.4 + API token，全链路验证通过，P100 16GB）
- Colab：✅ 已验证（T4 16GB，Google 账号 qingshun.li@gmail.com 已登录，CDP 可控制）
- Lightning AI：⏸️ 用户暂停（5 credits 一次性额度，403 问题未解决）
- AutoDL：⏸️ 用户暂停（未注册）

---

## 任务完成情况

### 1. ✅ Kaggle 注册 + API 配置（已完成）

**为什么 Kaggle 是主力**：30h/周免费 GPU（T4 ×2 16GB 或 P100），**每周刷新**，长期可用。

**完成情况**：
- 用户已自行注册 Kaggle（username: `xPabloLI`）
- API token 已在 `~/.zshrc` 中：`export KAGGLE_API_TOKEN=<KGAT_ token>`（脱敏，实际值在 ~/.zshrc）
- Agent 安装了 Kaggle CLI：`pip3 install --break-system-packages kaggle`（v2.2.4）
- 配置了 `~/.kaggle/kaggle.json`（`chmod 600`）
- 验证通过：`kaggle competitions list` 正常返回竞赛列表
- `kaggle config view` 确认：username=bpabloli, auth_method=ACCESS_TOKEN

**Kaggle 自动化能力**：
- `kaggle kernels push -p <dir>` — 推送 Notebook 到 Kaggle（可指定 GPU accelerator）
- `kaggle kernels status <username/kernel-name>` — 查看运行状态
- `kaggle kernels output <username/kernel-name> -p <dir>` — 下载输出
- `kaggle datasets create -p <dir>` — 上传数据集（用于持久存储模型权重）
- `kaggle datasets download -d <username/dataset-name>` — 下载数据集

**自动化跑数字人推理的流程**：
1. 本地准备 Notebook（.py script）：安装依赖 → clone 代码 → 下载模型权重 → 运行推理 → 输出结果
2. `kaggle kernels push -p .`（`kernel-metadata.json` 中 `enable_gpu: true`）
3. `kaggle kernels status` 轮询等待完成
4. `kaggle kernels output` 下载结果视频

> **注意**：Kaggle CLI 不支持指定 GPU 型号（T4 vs P100），由后端调度分配。当前测试中分配到的是 P100。
> **PyTorch 兼容性**：Kaggle 默认 PyTorch 2.10+cu128 不支持 P100 (sm_60)。需要在 Notebook 中手动安装 `torch==2.4.1+cu121`。
> 测试脚本在 `scripts/kaggle/test-gpu/`。

### 2. ✅ Colab 验证（已完成）

**完成情况**：
- 用户手动验证 T4 GPU 可用（Untitled0.ipynb）
- Agent 通过 CDP 验证：Google 账号 qingshun.li@gmail.com 已登录，能创建 Notebook、读写 cell、执行代码
- Colab 有内置 terminal（左侧工具栏 → 终端），可执行命令行操作
- **CDP 自动化可用**：Agent 可通过 web-access skill 自动操作 Colab（创建 Notebook → 写代码 → 执行 → 读输出）

**Colab 限制**：
- 免费版 T4 16GB，不固定时长，空闲 90min 断连
- 无外部 CLI（不能从本地终端 `colab run`），操作通过浏览器或 CDP
- **无付费升级 GPU**：Pro $10/月 还是 16GB（T4+P100）；Pro+ $50/月 才有 A100 40GB
- Pro ($10/月) 和 Gemini Advanced ($20/月) 是不同产品，Gemini 不含 Colab Pro+

**Colab vs Kaggle 分工**：
- **Colab**：交互式调试、参数调优（通过 CDP 或手动操作）
- **Kaggle**：自动化批量推理（CLI push → status → output），30h/周

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

## Kaggle API key 来源

用户已自行注册 Kaggle 并获取 API token。Token 存储在 `~/.zshrc`（`KAGGLE_API_TOKEN`），Agent 据此创建了 `~/.kaggle/kaggle.json`。

## 用户是否给过 Lightning API key

用户给过 Lightning AI API key（已配置在 `.env.local`、`~/.zshrc`、`~/.lightning/credentials.json` 中）。但该 key 权限不足，无法创建 Studio/App（403 error）。

---

## 推荐的下一步操作顺序

1. ~~**Kaggle 注册**~~ ✅ 已完成
2. ~~**Kaggle 自动化测试**~~ ✅ 已完成（见下方测试结果）
3. ~~**Colab 验证**~~ ✅ 已完成（用户手动验证，T4 可用，Untitled0.ipynb）
4. ~~**AutoDL 注册**~~ ⏸️ 用户暂停（暂时只用 Kaggle + Colab）
5. ~~**Lightning AI 联系 support**~~ ⏸️ 用户暂停

---

## 下一步

Handoff 任务已全部完成（3 个 ✅ + 2 个 ⏸️），本文档可归档。新 session 应参考：
- `docs/research/cloud-gpu-options.md` — GPU 方案对比（已更新含 Colab Pro/Pro+ 说明）
- `docs/research/digital-human-test-progress.md` — 测试进度追踪（末尾有云 GPU 测试计划 + 推荐优先级）
- `scripts/kaggle/test-gpu/` — Kaggle 自动化测试脚本模板

## 相关文档

- `docs/research/cloud-gpu-options.md` — 完整 GPU 方案对比（已更新 2026-08-15，含 AutoDL vs Lightning AI GPU 质量对比）
- `docs/research/digital-human-solutions-m2-pro.md` — 数字人模型评估
- `docs/research/tailscale-remote-gpu-setup.md` — GPU 机器远程部署

## Kaggle 自动化测试结果（2026-08-15）

**测试 Kernel**：`xpabloli/test-gpu-availability`（3 个版本迭代）

| 项目 | 结果 |
|------|------|
| GPU 分配 | Tesla P100-PCIE-16GB (16GB VRAM) |
| NVIDIA Driver | 580.159.04, CUDA 13.0 |
| 默认 PyTorch | 2.10.0+cu128（**不兼容 P100 sm_60**） |
| 兼容 PyTorch | 2.4.1+cu121（手动安装，~142s） |
| Compute test | ✅ 100x matrix multiply (2000×2000), 5.86 TFLOPS FP32 |
| 全链路验证 | ✅ push → status 轮询 → output 下载 |

**关键发现**：
1. Kaggle 当前给免费用户分配 **P100**（非 T4），GPU 型号不可指定
2. P100 算力 sm_60，需手动安装 PyTorch 2.4.1+cu121（默认 2.10 只支持 sm_70+）
3. 自动化全链路（CLI push → status polling → output download）工作正常
4. 测试脚本保存在 `scripts/kaggle/test-gpu/`

**对数字人模型的影响**：
- P100 16GB 可跑 LatentSync（需 ~12GB）、Sonic（需 ~8GB），但 Hallo2/3 可能不够（需 24GB+）
- 16GB 显存可能需要用 `torch.cuda.amp` 混合精度优化
- 如需 24GB+ GPU，等 Kaggle 分配到 T4×2 或使用 AutoDL

## 已完成的工作

- ✅ 从 Chrome Secure Preferences 复原 28 个插件（含 MetaMask）到 Preferences 文件
- ✅ 设置 LaunchAgent 自动恢复插件
- ✅ Lightning AI 定价页面完整抓取（确认免费额度是一次性）
- ✅ Lightning AI 官方文档阅读（AI Studio、Quickstart、FAQ）
- ✅ AutoDL 定价页面完整抓取（含 GPU 算力排名）
- ✅ `docs/research/cloud-gpu-options.md` 已更新（修正 Lightning AI 额度性质 + Kaggle 提升为主力推荐 + 新增 AutoDL vs Lightning AI GPU 质量对比）
- ✅ Memory 已更新（修正 Lightning AI 免费额度为一次性）
- ✅ **Kaggle CLI 安装**（v2.2.4, `pip3 install --break-system-packages kaggle`）
- ✅ **Kaggle API 配置**（`~/.kaggle/kaggle.json`，token 来自 `~/.zshrc` 的 `KAGGLE_API_TOKEN`）
- ✅ **Kaggle 自动化测试**（3 轮迭代：v1 属性名 bug → v2 P100 不兼容确认 → v3 安装兼容 PyTorch + compute test 通过）
- ✅ 测试脚本保存：`scripts/kaggle/test-gpu/`（`test_gpu.py` + `kernel-metadata.json`）
