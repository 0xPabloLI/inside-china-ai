# Colab CLI 操作指南

> **创建时间**：2026-08-21
> **目的**：Colab CLI 的安装、认证、使用方式和限制
> **状态**：✅ 已验证（v0.6.0，ADC 认证，全链路通过）

---

## 安装

```bash
pip3 install --break-system-packages google-colab-cli
```

**兼容性修复**：需降级 `jupyter-kernel-client<1.0`（v1.0.1 API 变更导致 `KernelClient` 找不到）：
```bash
pip3 install --break-system-packages 'jupyter-kernel-client<1.0'
```

## 认证（ADC）

```bash
gcloud auth application-default login \
  --scopes=openid,cloud-platform,userinfo.email,colaboratory
```

完成后 `~/.config/gcloud/application_default_credentials.json` 生成，Colab CLI 用 `--auth=adc` 自动读取。

## 常用命令

| 命令 | 用途 | 示例 |
|------|------|------|
| `colab run` | 一键运行脚本（provision → execute → teardown） | `colab --auth=adc run --gpu T4 script.py` |
| `colab new` | 创建新 session（保持运行） | `colab --auth=adc new --gpu T4 --session my-session` |
| `colab exec` | 在已存在的 session 中执行命令 | `colab --auth=adc exec --session my-session "python script.py"` |
| `colab install` | 在 session 中安装依赖 | `colab --auth=adc install --session my-session pip bitsandbytes` |
| `colab download` | 从 session 下载文件 | `colab --auth=adc download --session my-session output.mp4` |

### `colab run` 详解（最常用）

```bash
colab --auth=adc run --gpu T4 script.py
```

**流程**：provision VM → 执行脚本 → 自动 teardown

**优点**：一行命令完成，不需要手动管理 session
**缺点**：执行完自动销毁，下载产物需要用 `colab new` + `exec` + `download` 分步操作

### `colab run` + `--keep` 模式（长任务）

```bash
# 1. 创建持久 session
colab --auth=adc new --gpu T4 --session echomimic-nf4

# 2. 安装依赖
colab --auth=adc install --session echomimic-nf4 pip bitsandbytes accelerate

# 3. 执行脚本
colab --auth=adc exec --session echomimic-nf4 "python /content/script.py"

# 4. 下载产物
colab --auth=adc download --session echomimic-nf4 output.mp4

# 5. 销毁 session
colab --auth=adc delete --session echomimic-nf4
```

## GPU 选项

| GPU | 命令参数 | VRAM | CPU RAM | 套餐 |
|-----|---------|------|---------|------|
| T4 | `--gpu T4` | 14.6GB | 12GB（免费）/ 32GB（Pro $10/月） | 免费 |
| L4 | `--gpu L4` | 22.5GB | 32GB | Pro |
| A100 | `--gpu A100` | 40GB | 52GB | Pro+ $50/月 |

> Colab 的 T4 是**单卡**（不像 Kaggle 可通过 metadata 申请双卡）。

## Colab vs Kaggle 对比

| 维度 | Kaggle | Colab CLI |
|------|--------|-----------|
| GPU 分配 | T4 ×2（metadata） | T4 单卡 |
| CPU RAM | 29GB（固定） | 12GB（免费）/ 32GB（Pro） |
| 免费额度 | 30h/周刷新 | 不固定，空闲 90min 断连 |
| 自动化 | CLI push → status → output | `colab run` 一键 |
| 模型数据 | Dataset 挂载（`/kaggle/input/`） | 需从 HuggingFace/Drive 下载 |
| 脚本格式 | 自包含单文件 | 自包含单文件（同样需要） |
| 时长限制 | 12h/kernel | 90min 空闲断连（Pro 24h） |

## Colab 脚本 vs Kaggle 脚本

两者**都需要自包含单文件**——区别在于数据获取方式：

- **Kaggle**：模型打包成 Dataset，挂载到 `/kaggle/input/`（只读），脚本直接读取
- **Colab**：脚本运行时从 HuggingFace `snapshot_download` 下载模型（Colab 有快速互联网）

所以 Colab 脚本结构和 Kaggle 脚本一样，只是模型路径不同：
- Kaggle: `/kaggle/input/echomimicv3-flash/...`
- Colab: `/content/models/flash/...`（运行时从 HuggingFace 下载）

## 限制

- **免费版**：T4 14.6GB，12GB CPU RAM，不固定时长，空闲 90min 断连
- **Pro $10/月**：T4/P100，32GB CPU RAM（对 bitsandbytes 量化关键）
- **Pro+ $50/月**：A100 40GB，52GB CPU RAM
- Pro ($10/月) 和 Gemini Advanced ($20/月) 是不同产品，Gemini 不含 Colab Pro+

## MCP 集成

Colab MCP 已配置在 CatPaw 全局 MCP 设置中（`mcopilot_mcp_settings.json`）。

## Design Decisions & References

- Colab CLI SKILL.md: https://github.com/googlecolab/google-colab-cli/blob/main/skills/colab-operator/SKILL.md
- 配置全过程记录：`docs/archive/handoff-cloud-gpu-kaggle-setup.md`
