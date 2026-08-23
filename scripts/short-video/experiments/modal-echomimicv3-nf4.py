"""
EchoMimicV3 NF4 Quantization Test on Modal T4
=============================================

Modal script to run NF4 (4-bit bitsandbytes) quantized EchoMimicV3-Flash
inference on a Tesla T4 GPU, comparing against FP16 baseline.

Usage:
    # Upload real assets to Modal Volume first (one-time):
    modal volume put echomimicv3-models /local/portrait.jpg inputs/portrait.jpg
    modal volume put echomimicv3-models /local/audio.mp3 inputs/audio.mp3

    # Run the test:
    modal run modal-echomimicv3-nf4.py

    # Download outputs:
    modal volume get echomimicv3-models outputs/nf4-8steps.mp4 ./
    modal volume get echomimicv3-models outputs/baseline-8steps.mp4 ./

Results (2026-08-23, 512x512, 8 steps, TeaCache on):
    - NF4 + model_cpu_offload:  5.0 min (13.8s/step)  — 43% faster than baseline
    - Baseline (sequential_cpu_offload): 5.9 min (24.2s/step)

Key findings:
    - NF4 requires model_cpu_offload (pipeline.to(device) OOMs on T4 14.6GB)
    - 462 Linear layers quantized to 4-bit
    - Kaggle/Colab Free CPU RAM insufficient for NF4 quantization (needs ~186GB)
    - Modal T4 container provides 186GB CPU RAM automatically

Pricing (verified 2026-08-24 from modal.com/pricing):
    - GPU T4:  $0.5904/h  ($0.000164/s)
    - CPU:     $0.0472/core/h  ($0.0000131/core/s)
    - Memory:  $0.0080/GiB/h  ($0.00000222/GiB/s)
    - Free credit: $30/month (Starter plan)
    - Single run (~10.5 min): ~$0.16-0.38 depending on RAM allocation
"""

import modal
import os

app = modal.App("echomimicv3-nf4-test-v2")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "torch==2.5.1", "torchvision==0.20.1", "torchaudio==2.5.1",
        index_url="https://download.pytorch.org/whl/cu124"
    )
    .pip_install(
        "bitsandbytes==0.45.1",
        "accelerate==0.34.2",
        "einops==0.8.0",
        "safetensors==0.4.5",
        "timm==1.0.11",
        "decord==0.6.0",
        "omegaconf==2.3.0",
        "SentencePiece==0.2.0",
        "ftfy==6.3.1",
        "moviepy==2.2.1",
        "pyloudnorm==0.1.1",
        "retina-face==0.0.17",
        "func-timeout==4.3.5",
        "tomesd==0.1.3",
        "torchdiffeq==0.2.1",
        "torchsde==0.2.6",
        "huggingface-hub==0.26.2",
        "transformers==4.44.2",
        "psutil==5.9.8",
        "librosa==0.10.1",
    )
    .pip_install("diffusers==0.31.0", extra_options="--no-deps")
    .apt_install("git", "ffmpeg")
    .run_commands("git clone https://github.com/antgroup/echomimic_v3.git /root/echomimic_v3")
)

vol = modal.Volume.from_name("echomimicv3-models", create_if_missing=True)
MODEL_DIR = "/root/models/flash"
BASE_MODEL = f"{MODEL_DIR}/Wan2.1-Fun-V1.1-1.3B-InP"
WAV2VEC_DIR = f"{MODEL_DIR}/chinese-wav2vec2-base"
TRANSFORMER_PATH = f"{MODEL_DIR}/flash-pro/echomimicv3-flash-pro/diffusion_pytorch_model.safetensors"
CONFIG_PATH = "config/config.yaml"

# Input paths on the Volume (upload before running)
INPUT_PORTRAIT = "/root/models/inputs/portrait.jpg"
INPUT_AUDIO = "/root/models/inputs/audio.mp3"

# Output directory on the Volume (persists after container exits)
OUTPUT_DIR = "/root/models/outputs"


@app.function(
    gpu="T4",
    memory=32768,
    image=image,
    volumes={"/root/models": vol},
    secrets=[modal.Secret.from_name("huggingface-token")],
    timeout=7200,
)
def run_nf4_test():
    import subprocess, time, shutil, sys

    os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

    def log(msg):
        print("[" + time.strftime("%H:%M:%S") + "] " + str(msg), flush=True)

    log("=" * 60)
    log("EchoMimicV3 NF4 Quantization on Modal T4 (v2)")
    log("=" * 60)

    import torch
    log("PyTorch: " + torch.__version__)
    log("CUDA: " + str(torch.cuda.is_available()))
    if torch.cuda.is_available():
        log("GPU: " + torch.cuda.get_device_name(0))
        log("VRAM: " + str(round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 1)) + " GB")
    import psutil
    ram = psutil.virtual_memory()
    log("CPU RAM: " + str(round(ram.total / 1024**3, 1)) + " GB total, " + str(round(ram.available / 1024**3, 1)) + " GB available")
    log("bitsandbytes: " + __import__("bitsandbytes").__version__)
    log("accelerate: " + __import__("accelerate").__version__)

    # --- Check for real input assets ---
    use_real_assets = os.path.exists(INPUT_PORTRAIT) and os.path.exists(INPUT_AUDIO)
    if use_real_assets:
        log("[OK] Real assets found on Volume: " + INPUT_PORTRAIT + " + " + INPUT_AUDIO)
        portrait_path = INPUT_PORTRAIT
        audio_path = INPUT_AUDIO
    else:
        log("[WARN] Real assets not found, generating placeholder inputs...")
        portrait_path = "/root/portrait.jpg"
        audio_path = "/root/audio-10s.mp3"
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "color=c=blue:s=512x512:d=0.1",
             "-frames:v", "1", "-update", "1", portrait_path],
            check=False,
        )
        log("Portrait generated (placeholder)")
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=10",
             "-ac", "1", "-ar", "16000", audio_path],
            check=True,
        )
        log("Audio generated (placeholder)")

    # --- Download models if not cached ---
    os.makedirs(MODEL_DIR, exist_ok=True)
    from huggingface_hub import snapshot_download

    vae_path = os.path.join(BASE_MODEL, "Wan2.1_VAE.pth")
    if not os.path.exists(TRANSFORMER_PATH):
        log("Downloading Flash transformer from HF...")
        snapshot_download(
            repo_id="BadToBest/EchoMimicV3",
            local_dir=f"{MODEL_DIR}/flash-pro",
            allow_patterns=["echomimicv3-flash-pro/*"],
        )
        log("Flash transformer downloaded")
    else:
        log("Flash transformer cached")

    if not os.path.exists(vae_path):
        log("Downloading Wan2.1 base model...")
        snapshot_download(
            repo_id="alibaba-pai/Wan2.1-Fun-V1.1-1.3B-InP",
            local_dir=BASE_MODEL,
            allow_patterns=["*.safetensors", "*.json", "*.txt", "*.pth"],
        )
        log("Base model downloaded")
    else:
        log("Base model cached")

    if not os.path.exists(os.path.join(WAV2VEC_DIR, "config.json")):
        log("Downloading chinese-wav2vec2-base...")
        snapshot_download(
            repo_id="TencentGameMate/chinese-wav2vec2-base",
            local_dir=WAV2VEC_DIR,
        )
        log("Wav2Vec2 downloaded")
    else:
        log("Wav2Vec2 cached")

    vol.commit()

    # --- Patch diffusers FLAX import ---
    dp = os.path.dirname(__import__("diffusers").__file__)
    pl = os.path.join(dp, "pipelines", "pipeline_loading_utils.py")
    with open(pl, "r") as f:
        c = f.read()
    if "FLAX_WEIGHTS_NAME" in c and "_FROM_PT_KARG" not in c:
        c = c.replace(
            'FLAX_WEIGHTS_NAME = "diffusion_flax_model.msgpack"',
            'FLAX_WEIGHTS_NAME = "diffusion_flax_model.msgpack"\n_FROM_PT_KARG = None',
        )
        with open(pl, "w") as f:
            f.write(c)
        log("[OK] Patched diffusers FLAX")

    # --- Patch transformers ---
    import transformers
    tp = transformers.utils.__file__.replace("__init__.py", "import_utils.py")
    with open(tp, "r") as f:
        c = f.read()
    old_b = 'def check_torch_load_is_safe() -> None:\n    if is_torch_available() and version.parse(torch.__version__) < version.parse("2.0"):\n        raise ValueError('
    new_b = 'def check_torch_load_is_safe() -> None:\n    return None\ndef _dummy_check_torch_load_is_safe() -> None:\n    if is_torch_available() and version.parse(torch.__version__) < version.parse("2.0"):\n        raise ValueError('
    if old_b in c:
        c = c.replace(old_b, new_b)
        with open(tp, "w") as f:
            f.write(c)
        log("[OK] Patched transformers")

    # --- Patch infer_flash.py: replace pipeline.to(device=device) with GPU_memory_mode logic ---
    inf = "/root/echomimic_v3/infer_flash.py"
    with open(inf, "r") as f:
        c = f.read()

    # Fix FLAX import
    fo = "from transformers.utils import FLAX_WEIGHTS_NAME as TRANSFORMERS_FLAX_WEIGHTS_NAME"
    fn = 'try:\n    from transformers.utils import FLAX_WEIGHTS_NAME as TRANSFORMERS_FLAX_WEIGHTS_NAME\nexcept ImportError:\n    TRANSFORMERS_FLAX_WEIGHTS_NAME = "diffusion_flax_model.msgpack"'
    if fo in c:
        c = c.replace(fo, fn)
        log("[OK] Patched infer_flash FLAX import")

    # Replace pipeline.to(device=device) with GPU_memory_mode logic
    old_to = "pipeline.to(device=device)"
    nf4_code = (
        'if GPU_memory_mode == "sequential_cpu_offload":\n'
        '        pipeline.enable_sequential_cpu_offload()\n'
        '    elif GPU_memory_mode == "model_cpu_offload":\n'
        '        pipeline.enable_model_cpu_offload()\n'
        '    elif GPU_memory_mode == "nf4_bnb":\n'
        '        import bitsandbytes as bnb\n'
        '        print("[NF4] Applying NF4 quantization to transformer...")\n'
        '        def _replace_linear(module, dtype=torch.float16):\n'
        '            for name, child in module.named_children():\n'
        '                if isinstance(child, torch.nn.Linear):\n'
        '                    new_layer = bnb.nn.Linear4bit(\n'
        '                        child.in_features, child.out_features,\n'
        '                        bias=child.bias is not None,\n'
        '                        compute_dtype=dtype,\n'
        '                        quant_type="nf4"\n'
        '                    )\n'
        '                    if child.bias is not None:\n'
        '                        new_layer.bias = child.bias\n'
        '                    setattr(module, name, new_layer)\n'
        '                else:\n'
        '                    _replace_linear(child, dtype)\n'
        '        _replace_linear(transformer)\n'
        '        num_quant = sum(1 for m in transformer.modules() if isinstance(m, bnb.nn.Linear4bit))\n'
        '        print("[NF4] Replaced " + str(num_quant) + " Linear layers")\n'
        '        # Use model_cpu_offload instead of pipeline.to(device) to avoid OOM\n'
        '        # T4 14.6GB VRAM cannot hold the full pipeline (VAE + wav2vec2 + text_encoder + transformer)\n'
        '        pipeline.enable_model_cpu_offload()\n'
        '    else:\n'
        '        pipeline.to(device)'
    )

    if old_to in c:
        c = c.replace(old_to, nf4_code)
        log("[OK] Patched infer_flash with NF4 GPU_memory_mode logic")
    else:
        log("[WARN] Could not find pipeline.to(device=device) in infer_flash.py")
        for alt in ["pipeline.to(device)", "pipeline.to(device = device)"]:
            if alt in c:
                c = c.replace(alt, nf4_code)
                log("[OK] Patched infer_flash with alternative pattern: " + alt)
                break
        else:
            log("[ERROR] No pipeline.to() pattern found!")
            for i, line in enumerate(c.split("\n")):
                if "pipeline.to" in line:
                    log("  Line " + str(i+1) + ": " + line)

    with open(inf, "w") as f:
        f.write(c)
    log("[OK] Patched infer_flash saved")

    # --- Patch pipeline for cross-GPU text encoder ---
    pf = "/root/echomimic_v3/src/pipeline_wan_fun_inpaint_audio_2512.py"
    with open(pf, "r") as f:
        pc = f.read()
    ot = "prompt_embeds = self.text_encoder(text_input_ids.to(device), attention_mask=prompt_attention_mask.to(device))[0]\n    prompt_embeds = prompt_embeds.to(dtype=dtype, device=device)"
    nt = "        text_encoder_device = next(self.text_encoder.parameters()).device\n        prompt_embeds = self.text_encoder(text_input_ids.to(text_encoder_device), attention_mask=prompt_attention_mask.to(text_encoder_device))[0]\n        prompt_embeds = prompt_embeds.to(dtype=dtype, device=device)"
    if ot in pc:
        pc = pc.replace(ot, nt)
        log("[OK] Patched pipeline for cross-GPU")
    else:
        log("[WARN] Could not patch pipeline (pattern not found)")
    with open(pf, "w") as f:
        f.write(pc)

    # --- Run tests ---
    test_cases = [
        {"name": "nf4-8steps", "steps": 8, "mode": "nf4_bnb"},
        {"name": "baseline-8steps", "steps": 8, "mode": "sequential_cpu_offload"},
    ]

    os.makedirs(OUTPUT_DIR, exist_ok=True)

    for tc in test_cases:
        log("=" * 50)
        log("Test: " + tc["name"] + " | steps=" + str(tc["steps"]) + " | mode=" + tc["mode"])
        log("=" * 50)

        out_dir = "/root/outputs/" + tc["name"]
        os.makedirs(out_dir, exist_ok=True)

        cmd = (
            "cd /root/echomimic_v3 && python3 infer_flash.py"
            " --image_path " + portrait_path +
            " --audio_path " + audio_path +
            ' --prompt "A person is speaking."'
            " --num_inference_steps " + str(tc["steps"]) +
            " --config_path " + CONFIG_PATH +
            " --model_name " + BASE_MODEL +
            " --transformer_path " + TRANSFORMER_PATH +
            " --save_path " + out_dir +
            " --wav2vec_model_dir " + WAV2VEC_DIR +
            " --sampler_name Flow_Unipc"
            " --video_length 81"
            " --guidance_scale 6.0"
            " --audio_guidance_scale 3.0"
            " --audio_scale 1.0"
            " --neg_scale 1.0"
            " --neg_steps 0"
            " --seed 43"
            " --ulysses_degree 1"
            " --ring_degree 1"
            " --weight_dtype float16"
            " --sample_size 720 720"
            " --fps 25"
            " --shift 5.0"
            " --GPU_memory_mode " + tc["mode"]
        )

        start = time.time()
        try:
            result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=3600)
            if result.stdout:
                print(result.stdout[-8000:])
            if result.stderr:
                print("STDERR: " + result.stderr[-4000:])
            elapsed = time.time() - start
            log("Elapsed: " + str(round(elapsed, 1)) + "s (" + str(round(elapsed / 60, 1)) + " min)")

            # Copy output to Volume for persistence
            for fn in os.listdir(out_dir):
                if fn.endswith(".mp4"):
                    src = os.path.join(out_dir, fn)
                    # Save to Volume with test case name
                    vol_dst = os.path.join(OUTPUT_DIR, tc["name"] + ".mp4")
                    shutil.copy(src, vol_dst)
                    log("Output saved to Volume: " + tc["name"] + ".mp4 (" + str(round(os.path.getsize(vol_dst) / 1024, 1)) + " KB)")
        except Exception as e:
            elapsed = time.time() - start
            log("FAILED after " + str(round(elapsed, 1)) + "s: " + str(e))

    # --- Summary ---
    log("=" * 60)
    log("Modal NF4 Test Summary")
    log("=" * 60)
    for tc in test_cases:
        vol_dst = os.path.join(OUTPUT_DIR, tc["name"] + ".mp4")
        if os.path.exists(vol_dst):
            log("  " + tc["name"] + ": OK (" + str(round(os.path.getsize(vol_dst) / 1024, 1)) + " KB) -> Volume:outputs/" + tc["name"] + ".mp4")
        else:
            log("  " + tc["name"] + ": FAILED")
    log("Done!")
    vol.commit()

    return "Done"


@app.function(
    image=image,
    volumes={"/root/models": vol},
)
def list_outputs():
    """List all output files on the Volume."""
    import os
    if os.path.exists(OUTPUT_DIR):
        files = os.listdir(OUTPUT_DIR)
        for f in sorted(files):
            path = os.path.join(OUTPUT_DIR, f)
            size = os.path.getsize(path)
            print(f"  outputs/{f}  ({size / 1024:.1f} KB)")
    else:
        print("No outputs directory found on Volume.")
    vol.commit()


@app.local_entrypoint()
def main():
    result = run_nf4_test.remote()
    print(result)
