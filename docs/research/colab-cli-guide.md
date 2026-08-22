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

## 代理问题（FlClash TUN + Python requests）

### 根因

两层问题：

1. **Python `requests` 读 macOS 系统代理**：FlClash 设了系统代理 `127.0.0.1:7890`（`scutil --proxy` 可见）。Python `urllib.request.getproxies()` 在 macOS 上直接读系统配置，即使 `HTTPS_PROXY=""` 也无效。FlClash 代理端口处理 fake-ip + 转发的组合失败，导致 `ProxyError`。

2. **FlClash TUN fake-ip 路由间歇性失败**：`colab.research.google.com` 走 fake-ip（198.18.0.x），TUN 拦截 TCP 连接后转发到代理。GET 请求通常能通，但 POST 请求（如 `_post_assignment`）间歇性 `RemoteDisconnected` / `ConnectTimeout`。多次请求后 fake-ip 路由可能彻底失效。

### 解决方案（两层修复）

**第一层：`NO_PROXY="*"` 绕过系统代理**

```bash
NO_PROXY="*" HTTPS_PROXY="" HTTP_PROXY="" colab --auth=adc run --gpu T4 script.py
```

> 注意：`NO_PROXY="colab.research.google.com"` 可能不匹配（`requests` 的 `NO_PROXY` 匹配规则与预期不同），用 `NO_PROXY="*"` 最可靠。但这只是绕过 Python 代理设置，不走 `127.0.0.1:7890`，流量仍走 TUN fake-ip 路由。

**第二层：FlClash profile 添加 `fake-ip-filter`（永久修复）**

修改 FlClash **profile 文件**（不是 `config.yaml`——后者是生成的，重启会被覆盖）：

- Profile 路径：`~/Library/Application Support/com.follow.clash/profiles/<id>.yaml`
- 在 `dns:` 下添加：

```yaml
dns:
    # ... 已有配置 ...
    fake-ip-filter:
        - "dns.msftnsci.com"
        - "www.msftnsci.com"
        - "www.msftconnecttest.com"
        - "+.modal.com"
        - "+.colab.research.google.com"
        - "+.googleapis.com"
    nameserver-policy:
        "+.modal.com": ["https://dns.cloudflare.com/dns-query", "https://dns.google/dns-query"]
        "+.colab.research.google.com": ["https://dns.cloudflare.com/dns-query", "https://dns.google/dns-query"]
        "+.googleapis.com": ["https://dns.cloudflare.com/dns-query", "https://dns.google/dns-query"]
```

> `fake-ip-filter` 让指定域名走系统 DNS 解析真实 IP（不走 fake-ip），`nameserver-policy` 让这些域名用海外 DNS 解析（避免 DNS 污染）。域名走真实 IP + 代理规则（`DOMAIN-KEYWORD,google,国际机场`），代理处理真实 IP 不会有 fake-ip 的 bug。

修改后需**重启 FlClash** 使配置生效。同步修改 `config.yaml`（运行时配置）可立即生效（如果 FlClash 检测到文件变化）。

> **FlClash 配置文件层级**：`profiles/<id>.yaml`（订阅源 profile）→ `config.yaml`（运行时合成配置）。改 `config.yaml` 会被订阅更新覆盖，改 profile 才是持久的。FlClash 数据库 `database.sqlite` 中的 `rules` 表存储路由规则覆写（UI 中的「覆写」功能），但不存储 DNS 配置。

## Zombie Assignment 清理

**现象**：`colab run`/`colab new` 报 `TooManyAssignmentsError: Precondition Failed`（HTTP 412），但 `colab sessions` 显示无活跃 session。

**原因**：之前失败的请求在 Google 服务器端留下了未释放的 VM assignment（zombie）。CLI 的 `sessions` 命令只显示已建立的连接，看不到这些 zombie。

**清理方法**：直接用 Python 调用 Colab CLI 内部 API：

```bash
NO_PROXY="*" HTTPS_PROXY="" HTTP_PROXY="" python3 -c "
import sys; sys.path.insert(0, '/opt/homebrew/lib/python3.14/site-packages')
from colab_cli.common import state
from colab_cli.auth import AuthProvider
state.auth_provider = AuthProvider.ADC
assignments = state.client.list_assignments()
print(f'Found {len(assignments)} assignments')
for a in assignments:
    print(f'  {a.endpoint}')
    state.client.unassign(a.endpoint)
    print(f'    -> cleaned')
"
```

## MCP 集成

Colab MCP 已配置在 CatPaw 全局 MCP 设置中（`mcopilot_mcp_settings.json`）。
配置：`uvx git+https://github.com/googlecolab/colab-mcp`，timeout 30s。

## Design Decisions & References

- Colab CLI SKILL.md: https://github.com/googlecolab/google-colab-cli/blob/main/skills/colab-operator/SKILL.md
- 配置全过程记录：`docs/archive/handoff-cloud-gpu-kaggle-setup.md`
