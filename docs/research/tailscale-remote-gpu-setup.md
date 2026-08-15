# NVIDIA 机器部署指南：Tailscale + SSH + WSL2

> **用途**：在另一台有 NVIDIA GPU 的 Windows 机器上部署 AI 模型（HeyGem / LatentSync 等），通过 Tailscale + SSH 让 M2 Pro 远程调用。
> **创建日期**：2026-08-09
> **更新日期**：2026-08-15（修正 GPU 型号 GTX 1080、修正 SSH 公钥路径 administrators_authorized_keys、SSH 公钥已配置验证通过、新增当前配置状态速查）

---

## 当前配置状态（2026-08-15 检查）

| 配置项 | 状态 | 说明 |
|--------|------|------|
| Tailscale（Windows 端） | ✅ 在线 | IP `100.114.x.x`，设备 `hostname-redacted` |
| Tailscale（Mac 端） | ✅ 在线 | IP `100.71.x.x`，设备 `Mac-hostname-redacted` |
| P2P 直连 | ✅ | ICMP `<1ms`，NAT Cone（`MappingVariesByDestIP: false`），UDP 可用 |
| OpenSSH 服务 | ✅ Running | `sshd` Automatic 启动，端口 22 |
| SSH 公钥认证 | ✅ 已配置 | 公钥在 `C:\ProgramData\ssh\administrators_authorized_keys`，ACL 正确（SYSTEM + Administrators） |
| 防休眠 | ✅ | AC 电源：睡眠=永不、休眠=永不、显示器=永不 |
| GPU 驱动 | ✅ | GTX 1080 8GB，Driver 551.61，CUDA 12.4 |
| WSL2 | ✅ 已装 | Ubuntu 22.04.1 LTS，WSL2，内核 6.18.33.2 |
| WSL2 GPU | ✅ 可见 | WSL2 内 `nvidia-smi` 正常 |
| CUDA Toolkit（WSL2） | ❌ 未装 | `nvcc` 未找到（Step 3.3） |
| Python/Conda/PyTorch（WSL2） | ❌ 未装 | 只有系统 Python 3.10.6（Step 3.4） |
| Docker | ❌ 未装 | Windows 和 WSL2 内均无（Step 4） |

### Mac 端如何 SSH 连接

公钥已配置在 Windows 端的 `C:\ProgramData\ssh\administrators_authorized_keys`（Administrator 账户专用路径，由 `sshd_config` 的 `Match Group administrators` 块指定）。Mac 端只要有对应私钥即可连接：

```bash
# 在 Mac 上执行
ssh Administrator@100.114.x.x "hostname"
# 应返回 hostname-redacted

# 查 GPU
ssh Administrator@100.114.x.x "nvidia-smi"

# 进入 WSL2
ssh Administrator@100.114.x.x "wsl -d Ubuntu"
```

> **认证方式**：公钥认证（非密码）。Mac 的私钥 `~/.ssh/id_rsa` 与 Windows 端 `administrators_authorized_keys` 中的公钥配对。Administrator 账户无密码，OpenSSH 拒绝空密码登录，公钥是唯一远程认证方式。
>
> **注意**：公钥文件中目前有两把 key（从 GitHub 拉取），如需限制为仅 Mac 的 key，手动只保留指纹 `SHA256:Xk8jizoK9/z/LGTFeEh5j246buoypgppFF+i9o7Muno` 的那一把。

---

## 网络拓扑

```
Mac (macOS, FlClash TUN + Tailscale)
  Tailscale IP: 100.71.x.x
  公网 IP: REDACTED (NAT, Cone 类型)
  │
  │  WireGuard 隧道
  │  P2P 直连（打洞成功）或 DERP 中继（打洞失败时兜底）
  │
  ▼
Windows GPU (hostname-redacted)
  Tailscale IP: 100.114.x.x
  用户名: Administrator（空密码）
  GPU: GTX 1080 8GB
```

## 前提条件

- 一台有 NVIDIA GPU 的机器（当前：**GTX 1080 8GB**，Pascal 架构，Driver 551.61，CUDA 12.4）
- 操作系统：**Windows 11**（通过 WSL2 运行 Ubuntu 22.04，无需重装系统）
- NVIDIA 驱动已安装在 Windows 主机上（`nvidia-smi` 能正常输出）
- **网络**：GPU 机器与 Mac 在同一家庭网络（可不同子网）

### GTX 1080 8GB 显存兼容性

| 模型 | VRAM 需求 | 1080 8GB | 质量 | 说明 |
|------|----------|----------|------|------|
| LatentSync 1.5 | 8GB | ✅ 刚好 | ⭐⭐ | 256px，Mac 已测，效果不达标 |
| HeyGem Lite | 8GB | ✅ 刚好 | ⭐⭐⭐ | Docker 单容器，ONNX 唇同步 |
| SadTalker | ~6GB | ✅ | ⭐⭐ | Mac 已测，效果差 |
| Wav2Lip | ~4GB | ✅ | ⭐⭐ | 2020 老模型，贴片感 |
| Sonic | 12GB | ❌ 不够 | ⭐⭐⭐⭐⭐ | ComfyUI 版可能有显存优化，不保证 |
| LatentSync 1.6 | 18GB | ❌ | ⭐⭐⭐⭐⭐ | Mac 32GB 都 OOM |
| Hallo2 | 20GB+ | ❌ | ⭐⭐⭐⭐ | |

> **结论**：GTX 1080 8GB（Pascal 架构，2016 年）显存够用但架构老——不支持 FlashAttention 2、bf16 等新特性，部分新模型（如 VoxCPM2 需 CUDA 12.0+ 但依赖 Ampere+ 架构的 bf16）可能不兼容。能跑 LatentSync 1.5 和 HeyGem Lite 验证管线，但高质量模型需要 12GB+ 显存 + 更新架构。建议升级到 RTX 4060 Ti 16GB / 4070 12GB / 4090 24GB，或用云端 GPU（AutoDL / RunPod RTX 4090 ~$0.3-0.5/h）。

---

## Step 1: Mac 端 Tailscale + Clash 集成

### 1.1 安装 Tailscale

```bash
# Homebrew 安装
brew install tailscale
sudo tailscale up
```

- IP `100.71.x.x`，设备名 `Mac-hostname-redacted`
- 账号：`REDACTED@`
- NAT 类型：Cone（`MappingVariesByDestIP: false`），UDP 可用，打洞基础条件满足

验证：
```bash
tailscale netcheck
# UDP: true, MappingVariesByDestIP: false → NAT 友好
```

### 1.2 FlClash TUN 集成（当前使用的 Clash 客户端）

Mac 上实际运行的是 **FlClash**（不是 Clash Verge）。FlClash 使用 TUN 模式 + fake-ip DNS，会与 Tailscale 冲突——fake-ip 劫持 DNS 返回假 IP，tailscaled 控制面绕过 TUN 直连物理网卡，拿到假 IP 后无法连接协调服务器。

**配置文件**：`~/Library/Application Support/com.clash-client/config.yaml`（备份在同目录 `config.yaml.bak`）

已做两处修改：

1. **DNS 层 — fake-ip-filter 加 Tailscale 域名**：

   ```yaml
   dns:
     enhanced-mode: "fake-ip"
     fake-ip-range: "198.18.0.1/16"
     fake-ip-filter:
       - "dns.msftnsci.com"
       - "www.msftnsci.com"
       - "www.msftconnecttest.com"
       - "+.tailscale.com"    # ← 新增
       - "+.tailscale.io"     # ← 新增
   ```

   原因：让 tailscale.com 域名返回真实 IP，tailscaled 走路由表 → TUN → Clash → 代理 → 协调服务器。

2. **路由层 — TUN route-exclude 加 Tailscale 网段**：

   ```yaml
   tun:
     enable: true
     stack: "mixed"
     auto-route: true
     route-exclude-address:
       - 100.64.0.0/10    # ← 新增，排除 Tailscale CGNAT 网段
   ```

   原因：TUN 的 auto-route 用 `0.0.0.0/1 + 128.0.0.0/1` 覆盖整个 IPv4 空间。加排除后，发往 100.x.x.x 的流量绕过 TUN 走 Tailscale 的 utun 接口。

   > **注意**：`route-exclude-address` 在 mihomo `mixed` 栈下可能对 WireGuard UDP 打洞包不完全生效。Tailscale 数据隧道（100.x → utun0）不受影响，但打洞阶段的 UDP 包（发往对端公网 IP）可能仍被 TUN 拦截。如果打洞失败，需用 Plan B（见 Step 5）。

修改后重启 FlClash：`pkill -f FlClashCore && open -a FlClash`

### 1.3 Clash Verge Merge 覆写同步

如果切换到 Clash Verge，其 Merge 覆写文件也已同步配置了相同的排除规则。

**文件**：`~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/profiles/Merge.yaml`

```yaml
# Profile Enhancement Merge Template for Clash Verge

profile:
  store-selected: true

dns:
  use-system-hosts: false
  fake-ip-filter:
    - '+.tailscale.com'
    - '+.tailscale.io'

tun:
  route-exclude-address:
    - 100.64.0.0/10
```

两个客户端切换时无需额外配置。

### 1.4 验证 Mac 端

```bash
tailscale netcheck          # UDP: true, MappingVariesByDestIP: false → NAT 友好
curl -sI https://google.com  # HTTP/2 200 → 外网代理正常
tailscale status             # 确认设备在线
```

---

## Step 2: Windows GPU 端配置

### 2.1 安装 Tailscale

1. 下载 https://tailscale.com/download/windows
2. 安装后系统托盘出现 Tailscale 图标 → 右键 → `Log in`
3. 浏览器打开 → 用**与 Mac 相同的账号**（`REDACTED@`）登录
4. 在 Tailscale 管理后台（https://login.tailscale.com/admin/machines）批准新设备
5. 验证：在 Mac 上 `ping 100.114.x.x`

> **如果 GPU 机器在国内且无代理**：可能遇到和 Mac 一样的连接问题。Windows GUI 版 Tailscale 通常能读系统代理设置，比 macOS CLI 版兼容性好。如仍连不上，在 GPU 机器上安装 Clash 或类似代理工具，并配置 `fake-ip-filter` 排除 `*.tailscale.com`。

### 2.2 配置 SSH 公钥（必须）

Windows 的 Administrator 账户无密码，OpenSSH 默认拒绝空密码远程登录。需在 Windows 上配置 Mac 的公钥到 `administrators_authorized_keys`。

> ⚠️ **Administrator 账户的公钥路径与普通用户不同**：Windows OpenSSH 的 `sshd_config` 末尾有一行 `AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys`，这是 Administrator 组用户的专用公钥路径。**放在 `C:\Users\Administrator\.ssh\authorized_keys` 不会生效**。

**前提**：Windows OpenSSH 服务已开启（端口 22）。如未开启，在管理员 PowerShell 中执行：
```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
```

**方式 A — 从 GitHub 拉取（推荐，最简单）**：

在 Windows 上以**管理员身份**打开 PowerShell，执行：

```powershell
# 从 GitHub 拉取公钥到 Administrator 专用路径（不是 ~/.ssh/authorized_keys）
Invoke-WebRequest -Uri "https://github.com/0xPabloLI.keys" -OutFile "C:\ProgramData\ssh\administrators_authorized_keys" -UseBasicParsing

# 修复权限（Windows 对此敏感，不做公钥认证不生效）
icacls "C:\ProgramData\ssh\administrators_authorized_keys" /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"
```

> GitHub 的 `.keys` 页面（`github.com/<用户名>.keys`）是官方 API，公开返回用户上传的所有 SSH 公钥。Mac 的公钥指纹：`SHA256:Xk8jizoK9/z/LGTFeEh5j246buoypgppFF+i9o7Muno`。
>
> **安全提示**：从 GitHub 拉取时会获取所有 key。如只需 Mac 的，手动只复制第一个 key 到 `administrators_authorized_keys`。用 `from=` 限制来源 IP 可进一步收紧：
> ```
> from="100.71.x.x" ssh-rsa AAAA...（你的 Mac key）
> ```

**方式 B — 手动复制**：

在 Mac 上执行 `cat ~/.ssh/id_rsa.pub`，复制输出。在 Windows 上创建 `C:\ProgramData\ssh\administrators_authorized_keys`，粘贴公钥，然后执行上面的 `icacls` 命令修权限。

**验证**：

```powershell
# 确认公钥格式有效（应输出指纹）
ssh-keygen -l -f "C:\ProgramData\ssh\administrators_authorized_keys"

# 确认 ACL 权限（应只有 Administrators 和 SYSTEM）
Get-Acl "C:\ProgramData\ssh\administrators_authorized_keys" | Select-Object -ExpandProperty AccessToString

# 确认 sshd_config 读取此路径
Get-Content "C:\ProgramData\ssh\sshd_config" | Select-String "AuthorizedKeysFile"
# 应有两行：.ssh/authorized_keys（普通用户）和 __PROGRAMDATA__/ssh/administrators_authorized_keys（Administrator）
```

> ✅ **已配置并验证通过**（2026-08-15）：公钥已拉取到 `C:\ProgramData\ssh\administrators_authorized_keys`，ACL 权限正确（SYSTEM + Administrators FullControl），`ssh-keygen -l -f` 确认两把 key 格式有效。

### 2.3 防止 Windows 休眠（必须）

Windows 休眠后 Tailscale 断线，Mac 无法连接。在管理员 PowerShell 中执行：

```powershell
# 禁止睡眠（接通电源时永不睡眠）
powercfg /change standby-timeout-ac 0

# 禁止关闭显示器（可选，设为 0 = 永不关闭）
powercfg /change monitor-timeout-ac 0

# 禁止硬盘休眠
powercfg /change hibernate-timeout-ac 0

# 确认设置
powercfg /query
```

> 如果用电池供电的笔记本，还需 `powercfg /change standby-timeout-dc 0`。台式机不需要。

### 2.4 设置 Tailscale 开机自启

Windows 版 Tailscale 默认开机自启。确认方法：系统托盘 → Tailscale 图标 → 右键 → Preferences → 勾选 "Run on startup"。

### 2.5 验证

Windows 配置完成后，在 **Mac 上**执行：

```bash
# 检查 Windows 是否在线
tailscale status

# 测试 SSH 连接
ssh Administrator@100.114.x.x "hostname"

# 测试 P2P 直连
tailscale ping 100.114.x.x
# → "pong from ... via DERP(...)" = 走中继（延迟高）
# → "pong from ... via direct" = P2P 直连（延迟低）

# 查 GPU 信息
ssh Administrator@100.114.x.x "nvidia-smi"
```

---

## Step 3: WSL2 + CUDA 环境（Windows GPU 机器）

WSL2（Windows Subsystem for Linux 2）在 Windows 内运行真正的 Linux 内核，NVIDIA 官方支持 CUDA on WSL2，**不需要重装系统**。

### 3.1 启用 WSL2

```powershell
# 以管理员身份运行 PowerShell

# 安装 WSL2 + Ubuntu 22.04（一条命令）
wsl --install -d Ubuntu-22.04

# 如果已装过 WSL1，升级到 WSL2
wsl --set-version Ubuntu-22.04 2
wsl --set-default-version 2
```

重启电脑后，Ubuntu 22.04 会自动启动，设置用户名和密码。

### 3.2 在 WSL2 中验证 NVIDIA GPU

NVIDIA 的 Windows 驱动自带 WSL2 GPU 支持，**不需要在 WSL2 内单独装 NVIDIA 驱动**。

```bash
# 在 WSL2 终端中
nvidia-smi
# 应该看到 GTX 1080 的信息，CUDA Version 列显示驱动支持的 CUDA 版本
```

> ⚠️ 如果 `nvidia-smi` 报错 `command not found`：确保 Windows 上的 NVIDIA 驱动版本 ≥ 470（从 https://www.nvidia.com/Download/index.aspx 下载最新 Game Ready 或 Studio 驱动）。

### 3.3 安装 CUDA Toolkit（WSL2 内）

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装基础工具
sudo apt install -y build-essential wget curl git

# 下载 CUDA 12.1（PyTorch 2.x 兼容版本）
wget https://developer.download.nvidia.com/compute/cuda/repos/wsl-ubuntu/x86_64/cuda-keyring_1.1-1_all.deb
sudo dpkg -i cuda-keyring_1.1-1_all.deb
sudo apt update
sudo apt install -y cuda-toolkit-12-1

# 配置环境变量
echo 'export PATH=/usr/local/cuda-12.1/bin:$PATH' >> ~/.bashrc
echo 'export LD_LIBRARY_PATH=/usr/local/cuda-12.1/lib64:$LD_LIBRARY_PATH' >> ~/.bashrc
source ~/.bashrc

# 验证
nvcc --version
# 应显示 cuda 12.1
```

### 3.4 安装 Python + PyTorch

```bash
# 安装 miniconda
wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh
bash Miniconda3-latest-Linux-x86_64.sh
# 按提示安装，完成后重启终端

# 创建 AI 环境
conda create -n ai python=3.11 -y
conda activate ai

# 安装 PyTorch with CUDA 12.1
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121

# 验证 CUDA
python -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'Device: {torch.cuda.get_device_name(0)}'); print(f'VRAM: {torch.cuda.get_device_properties(0).total_mem / 1024**3:.1f} GB')"
# 应输出: CUDA available: True, Device: NVIDIA GeForce GTX 1080, VRAM: 8.0 GB
```

### 3.5 WSL2 文件系统注意事项

```bash
# ✅ 快：在 WSL2 内部文件系统操作
cd ~/
mkdir -p projects/ai-models
cd projects/ai-models

# ⚠️ 慢：从 WSL2 访问 Windows 文件（跨文件系统）
# /mnt/c/Users/你的用户名/... 性能会慢 5-10 倍
# 模型文件、数据集请放在 WSL2 内部（~/），不要放在 /mnt/c/

# 从 Windows 访问 WSL2 文件：
# 在 Windows 资源管理器地址栏输入: \\wsl$\Ubuntu-22.04\home\你的用户名\
```

### 3.6 WSL2 网络与端口

WSL2 使用 NAT 网络模式，端口需从 Windows 转发到 WSL2：

```bash
# WSL2 内启动的服务（如 Jupyter Lab :8888, HeyGem :8383）
# 从 Windows 访问: localhost:8888（WSL2 自动转发到 Windows localhost）

# 从 Mac 访问 WSL2 内的服务:
# 需要在 Windows 上做端口转发（PowerShell 管理员）:
# netsh interface portproxy add v4tov4 listenport=8383 listenaddress=0.0.0.0 connectport=8383 connectaddress=$(wsl hostname -I)
```

> **更简单的方案**：在 WSL2 内安装 Tailscale，直接获得 Tailscale IP，无需端口转发。

### 3.7 WSL2 内安装 Tailscale（可选）

```bash
# 安装
curl -fsSL https://tailscale.com/install.sh | sh

# 启动 tailscaled（WSL2 内需手动启动，无 systemd）
sudo tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock &

# 登录
sudo tailscale up
```

> **WSL2 注意**：WSL2 默认无 systemd，`tailscaled` 需手动启动。可写一个启动脚本：
> ```bash
> echo '#!/bin/bash
> sudo tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock &>/dev/null &
> sleep 2
> tailscale up
> ' | sudo tee /usr/local/bin/ts-start.sh
> sudo chmod +x /usr/local/bin/ts-start.sh
> ```
> 每次打开 WSL2 终端时运行 `ts-start.sh` 即可。

---

## Step 4: 安装 Docker + 部署 HeyGem

### 4.1 安装 Docker

**方式 A：Docker Desktop（简单）**
1. 安装 Docker Desktop: https://www.docker.com/products/docker-desktop/
2. 设置 → Resources → WSL Integration → 勾选 Ubuntu-22.04
3. 设置 → Resources → GPU → 勾选 Enable GPU support

**方式 B：WSL2 内直接装 Docker（更灵活）**
```bash
sudo apt update
sudo apt install docker.io docker-compose
sudo usermod -aG docker $USER
# 重新登录使 docker 组生效
```

### 4.2 安装 NVIDIA Container Toolkit

```bash
distribution=$(. /etc/os-release;echo $ID$VERSION_ID) \
&& curl -s -L https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list | sudo tee /etc/apt/sources.list.d/nvidia-container-toolkit.list

sudo apt update
sudo apt install nvidia-container-toolkit
sudo systemctl restart docker
```

验证：
```bash
docker run --rm --gpus all nvidia/cuda:11.8-base-ubuntu22.04 nvidia-smi
```

### 4.3 部署 HeyGem

**完整版（推荐 RTX 4070 12GB+）**：
```bash
git clone https://github.com/GuijiAI/HeyGem.ai.git
cd HeyGem.ai/deploy
docker pull guiji2025/fun-asr
docker pull guiji2025/fish-speech-ziming
docker pull guiji2025/heygem.ai
mkdir -p /home/$USER/heygem_data/face2face
mkdir -p /home/$USER/heygem_data/voice/data
# 修改 docker-compose.yml 中的路径
docker-compose up -d
```

**Lite 版（适合 GTX 1080 8GB）**：
```bash
git clone https://github.com/GuijiAI/HeyGem.ai.git
cd HeyGem.ai/deploy
docker pull guiji2025/heygem.ai
mkdir -p /home/$USER/heygem_data/face2face
# 修改 docker-compose-lite.yml 中的路径
docker-compose -f docker-compose-lite.yml up -d
```

验证：
```bash
docker ps
curl http://localhost:8383/
```

### 4.4 从 Mac 远程调用

```bash
export NVIDIA_IP=100.114.x.x
curl http://$NVIDIA_IP:8383/

# 克隆数字人（一次性）
curl -X POST http://$NVIDIA_IP:8383/api/clone -F "video=@avatar.mp4"

# 生成说话视频
curl -X POST http://$NVIDIA_IP:8383/api/generate \
  -F "model_id=你的model_id" \
  -F "audio=@scene-1.mp3"
```

---

## Step 5: P2P 打洞优化

如果 FlClash TUN 的 route-exclude 没有完全生效，WireGuard UDP 打洞包仍被 TUN 拦截，导致 P2P 打洞失败（走 DERP 中继，延迟 ~450ms）。

### 诊断

```bash
# 检查 NAT 类型
tailscale netcheck
# MappingVariesByDestIP: false → Cone NAT（友好）
# MappingVariesByDestIP: true  → Symmetric NAT（打洞困难）

# 测试 P2P 连通性
tailscale ping 100.114.x.x
# → "via DERP(...)" = 走中继（延迟高）
# → "via direct"    = P2P 直连（延迟低）
```

### Plan A：route-exclude（已在 Step 1.2 配置）

TUN 配置 `route-exclude-address: 100.64.0.0/10`。Tailscale 数据隧道（100.x → utun0）不受影响。但打洞阶段的 UDP 包可能仍被 TUN 拦截。

### Plan B：手动排除 Tailscale WireGuard 端口

```bash
# 查看 Tailscale 使用的本地 UDP 端口
sudo lsof -iUDP -P | grep tailscaled

# 在路由表中为对端公网 IP 添加直连路由（绕过 TUN）
# 需要先从 tailscale status --json 获取对端公网 IP
sudo route add -host <对端公网IP> -interface en0
```

> 注意：此路由在重启或网络切换后失效，需重新添加。可写成脚本自动执行。

### Plan C：切换 Clash 为系统代理模式

在 FlClash 中关闭 TUN 模式，改用系统代理模式。Tailscale 打洞包不再被 TUN 拦截，P2P 直连大概率成功。代价：终端命令需手动设 `export https_proxy=http://127.0.0.1:7890`。

---

## 常见问题

### Q: Docker 镜像下载很慢？

使用国内镜像加速：
```json
// /etc/docker/daemon.json
{
  "registry-mirrors": ["https://docker.mirrors.ustc.edu.cn"]
}
```

### Q: 显存不够？

用 Lite 版（方案 B），只运行一个 Docker 容器，8GB 够用。

### Q: Tailscale 连不上？（Clash fake-ip 问题）

**症状**：`tailscale up` 不弹出登录 URL，终端无输出，一直卡住。

**根因**：Clash 的 fake-ip DNS 模式把 `controlplane.tailscale.com` 解析成假 IP（如 `198.18.0.213`）。tailscaled 控制面绑定物理网卡，绕过 Clash TUN，直连假 IP → 超时。

**解决方案**：见 Step 1.2 — 在 Clash 配置中添加 `fake-ip-filter` 排除 `*.tailscale.com` / `*.tailscale.io`。

> **注意**：更新 Clash 订阅可能覆盖 `fake-ip-filter` 配置。FlClash 直接改 `config.yaml`；Clash Verge 在 Merge 覆写文件中持久化（见 Step 1.3）。

### Q: Windows 上的 Docker 路径格式

Windows 的 docker-compose.yml 中路径用 `D:/heygem_data` 格式（正斜杠），不是反斜杠。

### Q: Windows SSH 空密码被拒？

Windows OpenSSH 默认 `PermitEmptyPasswords no`。解决方案：配置 SSH 公钥（见 Step 2.2），不依赖密码。

---

## 安全注意事项

| 事项 | 说明 |
|------|------|
| `administrators_authorized_keys` 只放一把公钥 | 从 GitHub 拉取时会获取所有 key。如只需 Mac 的，手动只复制第一个。路径是 `C:\ProgramData\ssh\administrators_authorized_keys`（Administrator 账户专用） |
| `from=` 限制来源 IP | 在 key 前加 `from="100.71.x.x"` 限制只有 Mac 的 Tailscale IP 能登录 |
| Windows 防火墙 | OpenSSH 端口 22 已开放，确认防火墙规则仅允许 Tailscale 网段（100.64.0.0/10）访问 |
| 空密码风险 | Administrator 无密码，本地登录无阻拦。已配置 SSH 公钥认证（见 Step 2.2），远程登录不依赖密码。建议设密码或至少锁屏 |
| DERP 中继安全性 | DERP 服务器无法解密数据（WireGuard 端到端加密），但能看到流量大小和时间 |

---

## Design Decisions & References

- **为什么用 Tailscale 而不是端口转发**：Tailscale 不需要公网 IP，NAT 穿透自动处理，加密传输，两台机器在任何网络环境下都能互通。
- **为什么用 Lite 版**：Lite 版只运行一个 Docker 容器（face2face），显存需求降到 8GB，适合 GTX 1080。
- **FlClash vs Clash Verge**：Mac 上实际运行的是 FlClash（`/Applications/FlClash.app`），不是 Clash Verge。两者配置文件不同：FlClash 改 `~/Library/Application Support/com.clash-client/config.yaml`；Clash Verge 改 Merge 覆写文件。两个都已配置 Tailscale 排除规则。
- **fake-ip-filter 机制**：Clash fake-ip 模式劫持 DNS 返回假 IP（198.18.x.x）。tailscaled 控制面绕过 TUN 直连物理网卡，拿到假 IP 后无法连接协调服务器。加 filter 后 tailscale.com 域名返回真实 IP，tailscaled 走路由表 → TUN → Clash → 代理 → 控制服务器。详见 [[memory:17863207144245540241]]。
- **route-exclude-address 局限性**：mihomo `mixed` 栈下 route-exclude 对 Tailscale 数据隧道有效，但对 WireGuard UDP 打洞包可能不完全生效。打洞失败的兜底方案见 Step 5。
- **GitHub keys 作为公钥分发**：`github.com/<用户名>.keys` 是官方 API，公开返回用户上传的 SSH 公钥。Windows 上用 `Invoke-WebRequest` 一行命令拉取，比手动复制更可靠。
- **Administrator 账户公钥路径**：Windows OpenSSH 对 Administrator 组用户有特殊规则——`sshd_config` 末尾的 `AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys` 覆盖了默认的 `.ssh/authorized_keys` 路径。因此 Administrator 账户的公钥必须放在 `C:\ProgramData\ssh\administrators_authorized_keys`，而不是 `C:\Users\Administrator\.ssh\authorized_keys`。这是 Windows OpenSSH 的已知陷阱，官方文档 https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement 有说明。
- **WSL2 方案选择**：GPU 机器是 Windows 11，选择 WSL2 + Ubuntu 22.04 而非重装原生 Linux。原因：(1) 不需要重装系统；(2) NVIDIA 官方支持 CUDA on WSL2；(3) 大部分 AI 模型官方 requirements 是 Ubuntu。
- **HeyGem GitHub**: https://github.com/GuijiAI/HeyGem.ai
- **Tailscale 官网**: https://tailscale.com
- **WSL2 CUDA 官方文档**: https://docs.nvidia.com/cuda/wsl-user-guide/index.html
