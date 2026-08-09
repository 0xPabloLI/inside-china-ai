# NVIDIA 机器部署指南：Tailscale + HeyGem

> **用途**：在另一台有 NVIDIA GPU 的机器上部署 HeyGem，通过 Tailscale 让 M2 Pro 远程调用。
> **创建日期**：2026-08-09

---

## 前提条件

- 一台有 NVIDIA GPU 的机器（RTX 4060 8GB 或 RTX 4070 12GB 均可）
- 操作系统：Ubuntu 22.04 或 Windows 10+
- Docker 已安装（或准备安装）
- NVIDIA 驱动已安装（`nvidia-smi` 能正常输出）

---

## Step 1: 安装 Tailscale

Tailscale 让两台机器组虚拟内网，不需要公网 IP 或端口转发。

### Ubuntu/Linux

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock &
sudo tailscale up
```

### Windows

1. 下载 https://tailscale.com/download/windows
2. 安装后打开，点击 "Log in"
3. 用同一个 Tailscale 账号登录（和 M2 Pro 上相同的账号）

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

### Windows

1. 安装 Docker Desktop: https://www.docker.com/products/docker-desktop/
2. 确保在 Docker Desktop 设置中启用了 GPU 支持

### 安装 NVIDIA Container Toolkit（Linux）

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

### Q: Tailscale 连不上？

1. 确认两台机器都登录了同一个 Tailscale 账号
2. `tailscale status` 检查对端是否在线
3. 检查防火墙是否放行了 8383 端口

### Q: Windows 上的 Docker 路径格式

Windows 的 docker-compose.yml 中路径用 `D:/heygem_data` 格式（正斜杠），不是反斜杠。

---

## Design Decisions & References

- **为什么用 Tailscale 而不是端口转发**：Tailscale 不需要公网 IP，NAT 穿透自动处理，加密传输，两台机器在任何网络环境下都能互通。
- **为什么用 Lite 版**：Lite 版只运行一个 Docker 容器（face2face），显存需求降到 8GB，适合 RTX 4060。ASR 和 TTS 可以在 M2 Pro 上本地用 F5-TTS 替代。
- **HeyGem GitHub**: https://github.com/GuijiAI/HeyGem.ai
- **Tailscale 官网**: https://tailscale.com
