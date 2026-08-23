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

## 代理问题（FlClash TUN + Python requests）— 未解决

### 根因（三层）

1. **Python `requests` 读 macOS 系统代理**：FlClash 设了系统代理 `127.0.0.1:7890`（`scutil --proxy` 可见）。Python `urllib.request.getproxies()` 在 macOS 上直接读系统配置，即使 `HTTPS_PROXY=""` 也无效。设 `NO_PROXY="*"` 可绕过。

2. **FlClash TUN fake-ip 路由间歇性失败**：`colab.research.google.com` 走 fake-ip（198.18.0.x），TUN 拦截 TCP 连接后转发到代理。GET 通常通，POST 间歇性 `RemoteDisconnected` / `ConnectTimeout`。多次请求后彻底失效。

   **修复**：在 FlClash profile 的 `dns:` 下添加 `fake-ip-filter`（让 colab/googleapis 走真实 IP）+ `nameserver-policy`（用海外 DNS 解析）。Profile 路径：`~/Library/Application Support/com.follow.clash/profiles/<id>.yaml`。改 `config.yaml`（运行时合成配置）会被订阅更新覆盖，改 profile 才持久。改后需重启 FlClash。

3. **FlClash 代理端口处理 AuthorizedSession POST 请求时断连**（未解决）：即使 colab 走真实 IP + 显式代理 `HTTPS_PROXY="http://127.0.0.1:7890"`，Colab CLI 的 `AuthorizedSession`（携带 `Authorization: Bearer ya29...` 长 token header）的 POST 请求仍被代理断开（`ProxyError: Unable to connect to proxy, RemoteDisconnected`）。普通 `requests.post` 不带 auth header 时能成功。`Connection: close` header 没解决（不是 keep-alive 问题）。**这是 FlClash 代理本身的 bug**，不是配置问题。

### 已尝试的方案

| 方案 | 结果 | 原因 |
|------|------|------|
| `HTTPS_PROXY=""` | ❌ ProxyError | Python 读系统代理，env var 无效 |
| `NO_PROXY="*"` | ✅ 绕过代理，但 TUN fake-ip 间歇性失败 | TUN 对 fake-ip 的 TCP 路由不稳定 |
| FlClash profile `fake-ip-filter` + `nameserver-policy` | ✅ DNS 走真实 IP | 需改 profile（不是 config.yaml），重启 FlClash |
| `NO_PROXY="colab.research.google.com"` + `HTTPS_PROXY=http://127.0.0.1:7890` | ❌ POST RemoteDisconnected | TUN 对真实 IP 的 keep-alive 连接不稳定 |
| `Connection: close` header patch | ❌ 仍 RemoteDisconnected | 不是 keep-alive 问题，是代理对 auth header 的处理 bug |
| 纯代理 `HTTPS_PROXY=http://127.0.0.1:7890`（真实 IP） | ❌ POST ProxyError | FlClash 代理断开带 auth header 的 POST 请求 |

### 可能的后续方向

- 切换 FlClash 代理节点（当前节点可能对大 header 有限制）
- 关闭 FlClash TUN 模式，只用系统代理（HTTP 代理模式可能没有这个问题）
- 用其他代理客户端（如 Surge、Clash Verge Rev）
- 在不使用代理的环境下运行（如直连 VPS）

### FlClash 配置文件层级

- `profiles/<id>.yaml`（订阅源）→ `config.yaml`（运行时合成）。改 `config.yaml` 被覆盖，改 profile 才持久
- `database.sqlite` 的 `rules` 表存路由规则覆写（UI「覆写」功能），不存 DNS 配置
- FlClash 无 API 热重载（external-controller 在 config 中被设为空），改配置后需重启 FlClash
- **pyc 缓存**：改 Python 包源码后需删除 `__pycache__/*.pyc`，否则 Python 加载旧缓存

### 运行命令（当前最佳配置）

```bash
# 清理 zombie assignments
HTTPS_PROXY="http://127.0.0.1:7890" HTTP_PROXY="http://127.0.0.1:7890" python3 -c "
import sys; sys.path.insert(0, '/opt/homebrew/lib/python3.14/site-packages')
from colab_cli.common import state
from colab_cli.auth import AuthProvider
state.auth_provider = AuthProvider.ADC
for a in state.client.list_assignments():
    state.client.unassign(a.endpoint)
"

# 运行脚本（可能需要多次重试）
HTTPS_PROXY="http://127.0.0.1:7890" HTTP_PROXY="http://127.0.0.1:7890" colab --auth=adc run --gpu T4 script.py
```

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
