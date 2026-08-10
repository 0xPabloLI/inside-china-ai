# NVIDIA 机器部署指南：WSL2 + Tailscale + HeyGem

> **用途**：在另一台有 NVIDIA GPU 的 Windows 机器上通过 WSL2 部署 AI 模型（HeyGem / LatentSync 等），通过 Tailscale 或 SSH 让 M2 Pro 远程调用。
> **创建日期**：2026-08-09
> **更新日期**：2026-08-10（新增 WSL2 + CUDA 安装步骤、Clash 集成、内网直连方案、RTX 4060 兼容性说明）

---

## 前提条件

- 一台有 NVIDIA GPU 的机器（当前：**RTX 4060 8GB**）
- 操作系统：**Windows 11**（通过 WSL2 运行 Ubuntu 22.04，无需重装系统）
- NVIDIA 驱动已安装在 Windows 主机上（`nvidia-smi` 能正常输出）
- **网络**：GPU 机器与 Mac 在同一家庭网络（可不同子网）

### RTX 4060 8GB 显存兼容性

| 模型 | VRAM 需求 | 4060 8GB | 质量 | 说明 |
|------|----------|----------|------|------|
| LatentSync 1.5 | 8GB | ✅ 刚好 | ⭐⭐ | 256px，Mac 已测，效果不达标 |
| HeyGem Lite | 8GB | ✅ 刚好 | ⭐⭐⭐ | Docker 单容器，ONNX 唇同步 |
| SadTalker | ~6GB | ✅ | ⭐⭐ | Mac 已测，效果差 |
| Wav2Lip | ~4GB | ✅ | ⭐⭐ | 2020 老模型，贴片感 |
| Sonic | 12GB | ❌ 不够 | ⭐⭐⭐⭐⭐ | ComfyUI 版可能有显存优化，不保证 |
| LatentSync 1.6 | 18GB | ❌ | ⭐⭐⭐⭐⭐ | Mac 32GB 都 OOM |
| Hallo2 | 20GB+ | ❌ | ⭐⭐⭐⭐ | |

> **结论**：4060 8GB 能跑 LatentSync 1.5 和 HeyGem Lite 验证管线，但高质量模型需要 12GB+ 显存。可考虑升级到 RTX 4060 Ti 16GB / 4070 12GB / 4090 24GB，或用云端 GPU（AutoDL / RunPod RTX 4090 ~$0.3-0.5/h）。

---

## Step 0: WSL2 + CUDA 环境（Windows GPU 机器）

WSL2（Windows Subsystem for Linux 2）在 Windows 内运行真正的 Linux 内核，NVIDIA 官方支持 CUDA on WSL2，**不需要重装系统**。

### 0.1 启用 WSL2

```powershell
# 以管理员身份运行 PowerShell

# 安装 WSL2 + Ubuntu 22.04（一条命令）
wsl --install -d Ubuntu-22.04

# 如果已装过 WSL1，升级到 WSL2
wsl --set-version Ubuntu-22.04 2
wsl --set-default-version 2
```

重启电脑后，Ubuntu 22.04 会自动启动，设置用户名和密码。

### 0.2 在 WSL2 中验证 NVIDIA GPU

NVIDIA 的 Windows 驱动自带 WSL2 GPU 支持，**不需要在 WSL2 内单独装 NVIDIA 驱动**。

```bash
# 在 WSL2 终端中
nvidia-smi
# 应该看到 RTX 4060 的信息，CUDA Version 列显示驱动支持的 CUDA 版本
```

> ⚠️ 如果 `nvidia-smi` 报错 `command not found`：确保 Windows 上的 NVIDIA 驱动版本 ≥ 470（从 https://www.nvidia.com/Download/index.aspx 下载最新 Game Ready 或 Studio 驱动）。

### 0.3 安装 CUDA Toolkit（WSL2 内）

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

### 0.4 安装 Python + PyTorch

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
# 应输出: CUDA available: True, Device: NVIDIA GeForce RTX 4060, VRAM: 8.0 GB
```

### 0.5 WSL2 文件系统注意事项

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

### 0.6 WSL2 网络与端口

WSL2 使用 NAT 网络模式，端口需从 Windows 转发到 WSL2：

```bash
# WSL2 内启动的服务（如 Jupyter Lab :8888, HeyGem :8383）
# 从 Windows 访问: localhost:8888（WSL2 自动转发到 Windows localhost）

# 从 Mac 访问 WSL2 内的服务:
# 需要在 Windows 上做端口转发（PowerShell 管理员）:
# netsh interface portproxy add v4tov4 listenport=8383 listenaddress=0.0.0.0 connectport=8383 connectaddress=$(wsl hostname -I)
```

> **更简单的方案**：在 WSL2 内安装 Tailscale，直接获得 Tailscale IP，无需端口转发。详见 Step 1。

---

## Step 1: 安装 Tailscale

Tailscale 让两台机器组虚拟内网，不需要公网 IP 或端口转发。

> **Mac 端状态（已完成 ✅）**
> - Tailscale 已通过 Homebrew formula 安装（v1.102.2）
> - Tailscale IP：`100.71.x.x`，设备名：`Mac-hostname-redacted`
> - 账号：`REDACTED@`
> - **Clash 集成已配置**：在 Clash Verge 的 `clash-verge.yaml` 中添加了 `fake-ip-filter` 排除 `*.tailscale.com` / `*.tailscale.io`，解决了 tailscaled 无法连接控制服务器的问题。详见下方「Tailscale 连不上」FAQ。

### Ubuntu/Linux（含 WSL2）

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
sudo tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock &>/dev/null &
sleep 2
tailscale up
' | sudo tee /usr/local/bin/ts-start.sh
sudo chmod +x /usr/local/bin/ts-start.sh
> ```
> 每次打开 WSL2 终端时运行 `ts-start.sh` 即可。
>
> **优势**：在 WSL2 内装 Tailscale 可直接获得 Tailscale IP，无需 Windows 端口转发。Mac 可直接访问 WSL2 内的服务。

### Windows（当前 GPU 机器系统）

1. 下载 https://tailscale.com/download/windows
2. 安装后系统托盘出现 Tailscale 图标 → 右键 → `Log in`
3. 浏览器打开 → 用**与 Mac 相同的账号**（`REDACTED@`）登录
4. 在 Tailscale 管理后台（https://login.tailscale.com/admin/machines）批准新设备
5. 验证：在 Mac 上 `ping <GPU的Tailscale IP>`

> **如果 GPU 机器在国内且无代理**：可能遇到和 Mac 一样的连接问题（tailscaled 连不上 controlplane.tailscale.com）。Windows GUI 版 Tailscale 通常能读系统代理设置，比 macOS CLI 版兼容性好。如仍连不上：
> 1. 在 GPU 机器上安装 Clash 或类似代理工具
> 2. 在 Clash 配置中添加 `fake-ip-filter` 排除 `*.tailscale.com` / `*.tailscale.io`
> 3. 重启 Clash 和 Tailscale

### 验证

```bash
tailscale status
# 应该能看到两台机器的 IP，类似：
# 100.x.x.x  m2-pro
# 100.y.y.y  nvidia-machine
```

记下 NVIDIA 机器的 Tailscale IP（`100.y.y.y` 格式），后面要用。

---

## Step 2: 安装 Docker（如果没有）

### Ubuntu

```bash
sudo apt update
sudo apt install docker.io docker-compose
sudo usermod -aG docker $USER
# 重新登录使 docker 组生效
```

### Windows + WSL2（推荐）

**方式 A：Docker Desktop（简单）**
1. 安装 Docker Desktop: https://www.docker.com/products/docker-desktop/
2. 设置 → Resources → WSL Integration → 勾选 Ubuntu-22.04
3. 设置 → Resources → GPU → 勾选 Enable GPU support

**方式 B：WSL2 内直接装 Docker（更灵活）**
```bash
# 在 WSL2 终端中
sudo apt update
sudo apt install docker.io docker-compose
sudo usermod -aG docker $USER
# 重新登录使 docker 组生效
```

### 安装 NVIDIA Container Toolkit（Linux / WSL2）

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
# 应该能看到 GPU 信息
```

---

## Step 3: 部署 HeyGem

### 方案 A：完整版（推荐 RTX 4070 12GB+）

```bash
git clone https://github.com/GuijiAI/HeyGem.ai.git
cd HeyGem.ai/deploy

# 下载 Docker 镜像
docker pull guiji2025/fun-asr
docker pull guiji2025/fish-speech-ziming
docker pull guiji2025/heygem.ai

# 修改 docker-compose.yml 中的路径
# 把 d:/heygem_data 改为 Linux 路径，例如 /home/用户名/heygem_data
mkdir -p /home/$USER/heygem_data/face2face
mkdir -p /home/$USER/heygem_data/voice/data

# 启动
docker-compose up -d
```

### 方案 B：Lite 版（适合 RTX 4060 8GB）

```bash
git clone https://github.com/GuijiAI/HeyGem.ai.git
cd HeyGem.ai/deploy

# 只需要一个镜像
docker pull guiji2025/heygem.ai

# 修改 docker-compose-lite.yml 中的路径
# 把 d:/heygem_data 改为 Linux 路径
mkdir -p /home/$USER/heygem_data/face2face

# 启动
docker-compose -f docker-compose-lite.yml up -d
```

### 验证 HeyGem 服务

```bash
# 检查服务状态
docker ps
# 应该看到 heygem-gen-video 容器在运行

# 测试 API
curl http://localhost:8383/
# 应该返回 API 响应
```

---

## Step 4: 从 M2 Pro 远程调用

在 M2 Pro 上，通过 Tailscale IP 访问 NVIDIA 机器的 HeyGem API：

```bash
# 替换 100.y.y.y 为 NVIDIA 机器的 Tailscale IP
export NVIDIA_IP=100.y.y.y

# 测试连通性
curl http://$NVIDIA_IP:8383/

# 使用 HeyGem API（具体接口参数请参考 HeyGem 文档）
# 典型流程：
# 1. 上传一段 10 秒视频做克隆（一次性）
# 2. 上传音频/文字生成说话视频
```

---

## Step 5: HeyGem 使用流程

### 1. 克隆数字人（一次性）

准备一段 10 秒左右的正面说话视频，通过 API 上传：

```bash
# 上传视频做克隆
curl -X POST http://$NVIDIA_IP:8383/api/clone \
  -F "video=@avatar.mp4"
# 返回 model_id
```

### 2. 生成说话视频（每次使用）

```bash
# 方式 A：文字驱动
curl -X POST http://$NVIDIA_IP:8383/api/generate \
  -F "model_id=你的model_id" \
  -F "text=你好，这是一段测试" \
  -F "voice=clone"

# 方式 B：音频驱动
curl -X POST http://$NVIDIA_IP:8383/api/generate \
  -F "model_id=你的model_id" \
  -F "audio=@scene-1.mp3"
# 返回视频文件
```

---

## 常见问题

### Q: Docker 镜像下载很慢？

使用国内镜像加速：
```bash
# 在 /etc/docker/daemon.json 中添加
{
  "registry-mirrors": ["https://docker.mirrors.ustc.edu.cn"]
}
```

### Q: 显存不够？

用 Lite 版（方案 B），只运行一个 Docker 容器，8GB 够用。

### Q: Tailscale 连不上？（Clash fake-ip 问题）

**症状**：`tailscale up` 不弹出登录 URL，终端无输出，一直卡住。

**根因**：如果机器上运行了 Clash Verge（或类似代理工具）且开启了 fake-ip DNS 模式，Clash 会把 `controlplane.tailscale.com` 解析成假 IP（如 `198.18.0.213`）。tailscaled 的控制面 socket 绑定到物理网卡，绕过 Clash TUN，直连假 IP → 超时。

**解决方案**：在 Clash 配置中添加 `fake-ip-filter`，让 `*.tailscale.com` 返回真实 IP：

```yaml
# 文件位置（Clash Verge Rev）：
# ~/Library/Application Support/io.github.clash-verge-rev.clash-verge-rev/clash-verge.yaml
dns:
  fake-ip-filter:
    - '+.tailscale.com'
    - '+.tailscale.io'
    - '*.tailscale.com'
    - '*.tailscale.io'
```

通过 Clash API 热重载：
```bash
curl -X PUT http://127.0.0.1:9097/configs \
  -H "Content-Type: application/json" \
  -d '{"path": "<config_path>"}'
```

重启 tailscaled 后再 `tailscale up`，登录 URL 应正常弹出。

> **注意**：更新 Clash 订阅可能覆盖 `fake-ip-filter` 配置。需在 Clash Verge 的「覆写」(Override) 功能中持久化此规则。

**其他排查步骤**：
1. 确认两台机器都登录了同一个 Tailscale 账号
2. `tailscale status` 检查对端是否在线
3. 检查防火墙是否放行了 8383 端口

### Q: Windows 上的 Docker 路径格式

Windows 的 docker-compose.yml 中路径用 `D:/heygem_data` 格式（正斜杠），不是反斜杠。

---

## 备用方案：内网直连（SSH，无需 Tailscale）

如果两台机器在同一家庭网络，也可以不装 Tailscale，直接用 SSH 内网直连。

### Windows 开启 OpenSSH 服务

```powershell
# 以管理员身份运行 PowerShell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic

# 防火墙放行
New-NetFirewallRule -Name sshd -DisplayName 'OpenSSH Server' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22

# 查看 IP
ipconfig
# 找到以太网适配器的 IPv4 地址，如 192.168.1.x
```

### Mac 端 SSH 密钥配置

```bash
# 生成密钥（如已有可跳过）
ssh-keygen -t ed25519

# 将公钥传到 Windows
ssh-copy-id username@192.168.1.x
```

### 使用

```bash
# SSH 直连
ssh username@192.168.1.x

# 端口转发——在 Mac 上访问 GPU 机器的 Jupyter Lab
ssh -L 8888:localhost:8888 username@192.168.1.x
```

> **安全性**：SSH 端到端加密，传输安全。主要风险是 WiFi 密码被破解，用 WPA2/WPA3 + SSH 密钥认证足够安全。
>
> **推荐策略**：Tailscale + 内网直连都配。平时在家用内网直连（低延迟），出门在外用 Tailscale。两者不冲突。

---

## Design Decisions & References

- **为什么用 Tailscale 而不是端口转发**：Tailscale 不需要公网 IP，NAT 穿透自动处理，加密传输，两台机器在任何网络环境下都能互通。
- **为什么用 Lite 版**：Lite 版只运行一个 Docker 容器（face2face），显存需求降到 8GB，适合 RTX 4060。ASR 和 TTS 可以在 M2 Pro 上本地用 F5-TTS 替代。
- **Clash fake-ip-filter 集成（2026-08-10）**：Mac 上 Clash Verge 的 fake-ip DNS 模式阻止了 tailscaled 控制面连接。通过在 `dns` 段添加 `fake-ip-filter` 排除 `*.tailscale.com`，让 DNS 返回真实 IP，tailscaled 通过 TUN 路由表 → Clash → 代理 → 控制服务器。详见 [[memory:17863207144245540241]]。
- **新增内网直连方案（2026-08-10）**：GPU 机器是 Windows，在同一家庭网络。新增 SSH 内网直连作为 Tailscale 的备用方案，两者不冲突可同时使用。
- **WSL2 方案选择（2026-08-10）**：GPU 机器是 Windows 11，选择 WSL2 + Ubuntu 22.04 而非重装原生 Linux。原因：(1) 不需要重装系统，零成本试水；(2) NVIDIA 官方支持 CUDA on WSL2；(3) 大部分 AI 模型官方 requirements 是 Ubuntu，WSL2 原生兼容。如果后续遇到 WSL2 独有的兼容性问题，再考虑装原生 Ubuntu。
- **RTX 4060 8GB 限制说明（2026-08-10）**：8GB 显存只能跑 LatentSync 1.5（256px，质量不足）和 HeyGem Lite。高质量模型（LatentSync 1.6 需 18GB、Sonic 需 12GB、Hallo2 需 20GB+）均无法运行。文档新增显存兼容性表格，标注各模型的 VRAM 需求和 4060 可行性。
- **HeyGem GitHub**: https://github.com/GuijiAI/HeyGem.ai
- **Tailscale 官网**: https://tailscale.com
- **WSL2 CUDA 官方文档**: https://docs.nvidia.com/cuda/wsl-user-guide/index.html
