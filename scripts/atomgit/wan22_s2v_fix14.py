"""Fix14: force replace flash attention with SDPA"""
import os, sys, subprocess, time

start = time.time()
def log(msg):
    print(f"[{int(time.time()-start)}s] {msg}", flush=True)

os.chdir("/opt/atomgit/Wan2.2")

log("=== Force patch attention.py ===")
att_path = "wan/modules/attention.py"
with open(att_path) as f: att = f.read()

old = """    else:
        assert FLASH_ATTN_2_AVAILABLE
        x = flash_attn.flash_attn_varlen_func(
            q=q,
            k=k,
            v=v,
            cu_seqlens_q=torch.cat([q_lens.new_zeros([1]), q_lens]).cumsum(
                0, dtype=torch.int32).to(q.device, non_blocking=True),
            cu_seqlens_k=torch.cat([k_lens.new_zeros([1]), k_lens]).cumsum(
                0, dtype=torch.int32).to(q.device, non_blocking=True),
            max_seqlen_q=lq,
            max_seqlen_k=lk,
            dropout_p=dropout_p,
            softmax_scale=softmax_scale,
            causal=causal,
            window_size=window_size,
            deterministic=deterministic).unflatten(0, (b, lq))"""

new = """    else:
        # Standard attention fallback for NPU
        q_ = q.unflatten(0, (b, lq)).transpose(1, 2)
        k_ = k.unflatten(0, (b, lk)).transpose(1, 2)
        v_ = v.unflatten(0, (b, lk)).transpose(1, 2)
        x = torch.nn.functional.scaled_dot_product_attention(
            q_, k_, v_, is_causal=causal)
        x = x.transpose(1, 2).flatten(0, 1).unflatten(0, (b, lq))"""

if old in att:
    att = att.replace(old, new)
    with open(att_path, "w") as f: f.write(att)
    log("  force patched flash attention -> SDPA")
else:
    log("  old pattern not found, trying assert-only replace")
    att = att.replace("assert FLASH_ATTN_2_AVAILABLE", "pass  # NPU: no flash attn")
    with open(att_path, "w") as f: f.write(att)
    log("  replaced assert only")

# Verify
with open(att_path) as f: att = f.read()
log(f"  assert still present: {'assert FLASH_ATTN_2_AVAILABLE' in att}")
log(f"  SDPA in flash_attention: {'scaled_dot_product_attention' in att and 'is_causal=causal' in att}")

log("=== Run inference ===")
model_dir = "/opt/atomgit/Wan2.2-S2V-14B"
cmd = [sys.executable, "generate.py", "--task", "s2v-14B", "--size", "480*832",
       "--ckpt_dir", model_dir, "--offload_model", "True", "--sample_steps", "5",
       "--num_clip", "1", "--frame_num", "40", "--prompt", "A person is talking to camera",
       "--image", "/opt/atomgit/input/portrait-face.jpg",
       "--audio", "/opt/atomgit/input/audio.wav",
       "--save_file", "/opt/atomgit/s2v_npu_test.mp4"]
log(f"  cmd: {' '.join(cmd)}")

r = subprocess.run(cmd, capture_output=True, text=True, timeout=5400)
log(f"  RC: {r.returncode}")
log(f"  STDOUT: {r.stdout[-5000:]}")
log(f"  STDERR: {r.stderr[-3000:]}")
if os.path.exists("/opt/atomgit/s2v_npu_test.mp4"):
    log(f"  OUTPUT: {os.path.getsize('/opt/atomgit/s2v_npu_test.mp4')} bytes")

elapsed = int(time.time() - start)
log(f"=== TOTAL: {elapsed}s ({elapsed/60:.1f} min) ===")
log("ALL DONE")