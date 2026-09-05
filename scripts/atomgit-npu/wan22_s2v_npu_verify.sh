#!/bin/bash
# Wan2.2-S2V-14B NPU 910B 验证脚本（最小核时方案）
# 
# 在 AtomGit Notebook (ubuntu22-cann8.5-py311-torch2.8) 终端中运行：
#   bash /mnt/workspace/wan22_s2v_npu_verify.sh
#
# 方案：5 steps × 1 clip，仅验证能跑通，不追求画质
# 预估核时：~2-4 核时（4vCPU 配置，~30-60min）
# 模型下载到 /mnt/workspace/ 持久化，下次不用重新下载

set -e
START_TIME=$(date +%s)

echo "=========================================="
echo "Wan2.2-S2V-14B NPU 910B 验证"
echo "开始时间: $(date)"
echo "=========================================="

# ── 1. CANN 环境变量 ──
echo "[1/8] 设置 CANN 环境..."
if [ -f /usr/local/Ascend/ascend-toolkit/latest/bin/atb ]; then
    export ASCEND_TOOLKIT_HOME=/usr/local/Ascend/ascend-toolkit/latest
elif [ -f /usr/local/Ascend/ascend-toolkit/set_env.sh ]; then
    source /usr/local/Ascend/ascend-toolkit/set_env.sh
else
    echo "  ⚠️ 未找到 ASCEND_TOOLKIT_HOME，尝试常见路径..."
    for p in /usr/local/Ascend/ascend-toolkit/latest /usr/local/Ascend/latest /opt/Ascend/ascend-toolkit/latest; do
        if [ -f "$p/bin/atb" ] || [ -f "$p/set_env.sh" ]; then
            export ASCEND_TOOLKIT_HOME=$p
            [ -f "$p/set_env.sh" ] && source "$p/set_env.sh"
            echo "  找到: $p"
            break
        fi
    done
fi
export PATH=$ASCEND_TOOLKIT_HOME/bin:$PATH
export LD_LIBRARY_PATH=$ASCEND_TOOLKIT_HOME/lib64:$LD_LIBRARY_PATH
echo "  ASCEND_TOOLKIT_HOME=$ASCEND_TOOLKIT_HOME"

# ── 2. 检查 torch_npu ──
echo "[2/8] 检查 torch_npu..."
python3 -c "import torch_npu; print(f'  torch_npu OK, version: {torch_npu.__version__}')" 2>/dev/null || {
    echo "  torch_npu 未安装，正在安装..."
    pip install torch-npu==2.8.0 2>/dev/null || pip install torch_npu
}
python3 -c "
import torch
import torch_npu
print(f'  PyTorch: {torch.__version__}')
print(f'  NPU available: {torch.npu.is_available()}')
if torch.npu.is_available():
    print(f'  NPU count: {torch.npu.device_count()}')
    print(f'  NPU 0: {torch.npu.get_device_name(0)}')
"

# ── 3. Clone Wan2.2 代码 ──
echo "[3/8] Clone Wan2.2 代码..."
WORK=/mnt/workspace
if [ ! -d "$WORK/Wan2.2" ]; then
    cd $WORK
    git clone https://github.com/Wan-Video/Wan2.2.git
else
    echo "  已存在，跳过 clone"
fi
cd $WORK/Wan2.2

# ── 4. 安装依赖（不装 flash_attn！）──
echo "[4/8] 安装依赖（不装 flash_attn，让 attention.py 用 SDPA fallback）..."
pip install -r requirements.txt 2>/dev/null | tail -5
pip install peft decord librosa modelscope omegaconf scipy pillow 2>/dev/null | tail -3
echo "  确认 flash_attn 未安装:"
python3 -c "
try:
    import flash_attn
    print(f'  ⚠️ flash_attn 已安装 v{flash_attn.__version__}，需卸载让 SDPA fallback 生效')
    import subprocess; subprocess.check_call(['pip', 'uninstall', '-y', 'flash_attn'])
    print('  已卸载 flash_attn')
except ImportError:
    print('  ✅ flash_attn 未安装，attention.py 将用 SDPA fallback')
"

# ── 5. 下载模型权重 ──
echo "[5/8] 下载模型权重..."
MODEL_DIR=$WORK/Wan2.2-S2V-14B
if [ ! -f "$MODEL_DIR/models_t5_umt5-xxl-enc-bf16.pth" ]; then
    python3 -c "
from modelscope import snapshot_download
snapshot_download('Wan-AI/Wan2.2-S2V-14B', local_dir='$MODEL_DIR')
print('  模型下载完成')
"
else
    echo "  模型已存在，跳过下载"
fi
echo "  模型大小: $(du -sh $MODEL_DIR 2>/dev/null | cut -f1)"

# ── 6. 修改 generate.py 的 CUDA 调用 ──
echo "[6/8] 修改 generate.py 的 torch.cuda 调用..."
cp generate.py generate.py.orig
python3 -c "
import re
with open('generate.py', 'r') as f:
    code = f.read()
# torch.cuda.synchronize() → torch.npu.synchronize()
code = code.replace('torch.cuda.synchronize()', 'torch.npu.synchronize()')
# torch.cuda.set_device → torch.npu.set_device
code = code.replace('torch.cuda.set_device', 'torch.npu.set_device')
# backend='nccl' → backend='hccl'
code = code.replace(\"backend='nccl'\", \"backend='hccl'\")
# device_id 传递的整数，Wan 模型内部可能用 torch.device(f'cuda:{device_id}')
# 需要检查 wan/ 目录下的文件
with open('generate.py', 'w') as f:
    f.write(code)
print('  generate.py 已修改')
"

# 修改 wan/ 目录下的 cuda 引用
find wan/ -name "*.py" -exec python3 -c "
import sys, re
fname = sys.argv[1]
with open(fname, 'r') as f:
    code = f.read()
orig = code
# 替换 'cuda' 字符串为 'npu'
code = code.replace(\"'cuda'\", \"'npu'\")
code = code.replace('\"cuda\"', '\"npu\"')
# 替换 torch.cuda. 为 torch.npu.
code = code.replace('torch.cuda.', 'torch.npu.')
# 替换 device.type == 'cuda' 为 device.type == 'npu'
code = code.replace(\"device.type == 'cuda'\", \"device.type == 'npu'\")
if code != orig:
    with open(fname, 'w') as f:
        f.write(code)
    print(f'  修改: {fname}')
" {} \;

# ── 7. 准备测试素材 ──
echo "[7/8] 准备测试素材..."
# 用 Wan2.2 自带的示例素材
IMAGE=$WORK/Wan2.2/examples/i2v_input.JPG
AUDIO=$WORK/Wan2.2/examples/talk.wav
if [ ! -f "$IMAGE" ]; then
    echo "  ⚠️ 示例素材不存在，尝试从 examples 目录查找..."
    IMAGE=$(find examples/ -name "*.JPG" -o -name "*.jpg" | head -1)
    AUDIO=$(find examples/ -name "*.wav" -o -name "*.mp3" | head -1)
fi
echo "  图片: $IMAGE"
echo "  音频: $AUDIO"

# ── 8. 运行最小推理 ──
echo "[8/8] 运行最小推理（5 steps × 1 clip）..."
echo "  参数: --sample_steps 5 --num_clip 1 --offload_model False"
echo "  目标: 验证能跑通，不追求画质"

python3 generate.py \
    --task s2v-14B \
    --size 1024*704 \
    --ckpt_dir $MODEL_DIR \
    --offload_model False \
    --sample_steps 5 \
    --num_clip 1 \
    --prompt "A person is talking to camera, frontal face, static background." \
    --image "$IMAGE" \
    --audio "$AUDIO" \
    --save_file $WORK/s2v_npu_test.mp4

END_TIME=$(date +%s)
ELAPSED=$((END_TIME - START_TIME))
ELAPSED_MIN=$((ELAPSED / 60))

echo ""
echo "=========================================="
echo "验证完成！"
echo "总耗时: ${ELAPSED}s (${ELAPSED_MIN}min)"
echo "核时消耗（4vCPU）: $(echo "scale=2; $ELAPSED * 4 / 3600" | bc) 核时"
echo "输出: $WORK/s2v_npu_test.mp4"
echo "结束时间: $(date)"
echo "=========================================="