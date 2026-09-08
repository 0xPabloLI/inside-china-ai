"""Apply staged loading patch + run inference (T5 -> release -> diffusion)"""
import os, sys, subprocess, time, gc, logging

start = time.time()
def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

log("=== Apply staged loading patch to speech2video.py ===")
os.chdir("/opt/atomgit/Wan2.2")
s2v_path = "wan/speech2video.py"
with open(s2v_path) as f:
    s2v = f.read()

# Check if already patched
if "self.noise_model = None" in s2v and "Staged loading" in s2v:
    log("  already patched")
else:
    # 1. Skip diffusion model in __init__
    old_init = '''if not dit_fsdp:
            self.noise_model = WanModel_S2V.from_pretrained(
                checkpoint_dir,
                torch_dtype=self.param_dtype,
                device_map=self.device)
        else:
            self.noise_model = WanModel_S2V.from_pretrained(
                checkpoint_dir, torch_dtype=self.param_dtype)'''
    new_init = '''self.noise_model = None
        self._ckpt_dir = checkpoint_dir
        self._dit_fsdp = dit_fsdp'''
    if old_init in s2v:
        s2v = s2v.replace(old_init, new_init)
        log("  patched __init__ (skip diffusion)")
    else:
        log("  WARNING: could not find __init__ pattern to patch")
        # Try alternative pattern
        if "self.noise_model = WanModel_S2V.from_pretrained" in s2v:
            # Find and replace the block
            import re
            pattern = r'(if not dit_fsdp:\s+self\.noise_model = WanModel_S2V\.from_pretrained.*?else:\s+self\.noise_model = WanModel_S2V\.from_pretrained\([^)]+\))'
            match = re.search(pattern, s2v, re.DOTALL)
            if match:
                s2v = s2v[:match.start()] + new_init + s2v[match.end():]
                log("  patched __init__ (regex)")
            else:
                log("  FAILED to patch __init__")

    # 2. Add staged loading before "out = []"
    lazy_code = '''        # === Staged loading: release T5, load diffusion model ===
        if hasattr(self, 'text_encoder') and self.text_encoder is not None:
            del self.text_encoder
            torch.npu.empty_cache()
            gc.collect()
            logging.info("T5 released from NPU")
        if self.noise_model is None:
            logging.info("Loading diffusion model with offload...")
            from functools import partial as _partial
            from .modules.s2v.model_s2v import WanModel_S2V as _WanModel
            from .distributed.fsdp import shard_model as _shard
            if not self._dit_fsdp:
                self.noise_model = _WanModel.from_pretrained(
                    self._ckpt_dir, torch_dtype=self.param_dtype, device_map=self.device)
            else:
                self.noise_model = _WanModel.from_pretrained(
                    self._ckpt_dir, torch_dtype=self.param_dtype)
            self.noise_model = self._configure_model(
                model=self.noise_model, use_sp=self.sp_size > 1,
                dit_fsdp=self._dit_fsdp, shard_fn=_partial(_shard, device_id=0),
                convert_model_dtype=False)
            logging.info("Diffusion model loaded")
        # === End staged loading ===

        out = []'''
    if "out = []" in s2v and "Staged loading" not in s2v:
        s2v = s2v.replace("        out = []", lazy_code, 1)
        log("  patched generate (staged loading)")
    elif "Staged loading" in s2v:
        log("  staged loading already present")
    else:
        log("  WARNING: could not find 'out = []' to patch")

    with open(s2v_path, "w") as f:
        f.write(s2v)
    log("  patch saved")

log("=== Run inference with staged loading ===")
model_dir = "/opt/atomgit/Wan2.2-S2V-14B"
cmd = [sys.executable, "generate.py", "--task", "s2v-14B", "--size", "480*832",
       "--ckpt_dir", model_dir, "--offload_model", "True", "--sample_steps", "5",
       "--num_clip", "1", "--frame_num", "40", "--prompt", "A person is talking to camera",
       "--image", "/opt/atomgit/input/portrait-face.jpg",
       "--audio", "/opt/atomgit/input/audio.wav",
       "--save_file", "/opt/atomgit/s2v_npu_test.mp4"]
log(f"  cmd: {' '.join(cmd)}")

r = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
log(f"  RC: {r.returncode}")
log(f"  STDOUT (last 5000): {r.stdout[-5000:]}")
log(f"  STDERR (last 3000): {r.stderr[-3000:]}")
if os.path.exists("/opt/atomgit/s2v_npu_test.mp4"):
    log(f"  OUTPUT: {os.path.getsize('/opt/atomgit/s2v_npu_test.mp4')} bytes")

elapsed = int(time.time() - start)
log(f"=== TOTAL: {elapsed}s ({elapsed/60:.1f} min) ===")
log("ALL DONE")