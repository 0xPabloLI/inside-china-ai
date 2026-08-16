# Handoff: 云 GPU Fallback Pool 自动化脚本

> **创建时间**：2026-08-16
> **来源 Session**：云 GPU 配置 + 文档体系完善
> **目标**：新 session 接手后，实现云 GPU 资源 pool 的自动化 fallback 脚本

---

## 背景

本地 M2 Pro 32GB 无法跑 CUDA 模型（数字人推理等）。已配置两套免费云 GPU：

- **Colab CLI** v0.6.0（`colab run --gpu T4 script.py`，T4 16GB）
- **Kaggle CLI** v2.2.4（`kaggle kernels push`，P100/T4 16GB，30h/周）

两套均全链路验证通过。配置详情见 `docs/archive/handoff-cloud-gpu-kaggle-setup.md`。

Fallback 规则已文档化在 `docs/research/digital-human-test-progress.md` → 「云 GPU 资源 Pool 与 Fallback」章节。

## 需要实现的

一个 Node.js 脚本 `scripts/cloud-gpu/run-gpu.mjs`，接受一个 `.py` 脚本路径，自动选择可用平台执行：

### Fallback 链

```
Colab CLI（首选，一键运行）
  ↓ 失败/超时
Kaggle（push → status 轮询 → output 下载）
  ↓ 30h/周用完
Colab CDP（web-access skill 操作浏览器）
  ↓ 16GB 不够
AutoDL（告知用户手动租用）
```

### 接口设计

```bash
# 基本用法
node scripts/cloud-gpu/run-gpu.mjs <script.py> [--output <dir>] [--timeout <sec>]

# 示例
node scripts/cloud-gpu/run-gpu.mjs echomimic-v3-infer.py --output ./output --timeout 1800
```

### 实现要点

1. **Colab CLI 路径**：
   ```bash
   colab --auth=adc run --gpu T4 <script.py>
   ```
   - 超时默认 30min（1800s）
   - 成功：输出 stdout/stddev，退出码 0
   - 失败：捕获错误，进入 fallback

2. **Kaggle 路径**：
   ```bash
   # 准备 kernel-metadata.json
   kaggle kernels push -p .
   kaggle kernels status <username/kernel-name>  # 轮询
   kaggle kernels output <username/kernel-name> -p <output_dir>
   ```
   - 需要 `kernel-metadata.json`（`enable_gpu: true`, `language: python`, `kernel_type: script`）
   - 轮询间隔 30s，超时 30min
   - 测试脚本参考 `scripts/kaggle/test-gpu/`

3. **Kaggle 配额检查**：
   - 没有直接的 API 查询剩余时长
   - 间接方式：push 失败时检查错误消息是否包含配额相关关键词

4. **输出处理**：
   - Colab：stdout 直接返回
   - Kaggle：下载 output 到指定目录
   - 统一返回 `{ platform, success, outputDir, stdout, stderr, elapsedSec }`

### 不需要实现的

- **AutoDL 自动化**：付费服务，需手动租用，脚本只告知用户
- **Colab CDP fallback**：太复杂，作为最后手段告知用户手动操作

### 前置条件

- Colab CLI 已安装 + ADC 认证已完成 ✅
- Kaggle CLI 已安装 + API token 已配置 ✅
- `jupyter-kernel-client<1.0` 已降级 ✅

## 相关文档

- `docs/research/digital-human-test-progress.md` — 测试进度 + GPU 资源 Pool 与 Fallback 规则
- `docs/research/cloud-gpu-options.md` — 完整 GPU 方案对比
- `docs/archive/handoff-cloud-gpu-kaggle-setup.md` — 配置全过程
- `scripts/kaggle/test-gpu/` — Kaggle 自动化测试脚本模板
- Colab CLI SKILL.md: https://github.com/googlecolab/google-colab-cli/blob/main/skills/colab-operator/SKILL.md
