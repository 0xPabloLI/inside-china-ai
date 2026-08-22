# Handoff: Colab NF4 量化测试

> **创建时间**：2026-08-22
> **目的**：在新 session 中用 Colab CLI 测试 EchoMimicV3 NF4 量化
> **前置条件**：Colab 网页端清理所有卡住的 session

---

## 背景

Kaggle T4（29GB CPU RAM）跑 bitsandbytes NF4 量化时 OS OOM Killed——CPU RAM 不足。Colab Pro T4 有 32GB CPU RAM，可能够用。

## 需要做的事

1. **清理 Colab session**：打开 https://colab.research.google.com → Runtime → Manage sessions → 终止所有卡住的 session
2. **运行 NF4 脚本**：
   ```bash
   HTTPS_PROXY="" HTTP_PROXY="" colab --auth=adc run --gpu T4 /tmp/colab-nf4-test.py
   ```
   注意：必须设 `HTTPS_PROXY="" HTTP_PROXY=""` 绕过系统代理，否则会报 `ProxyError`

## 脚本位置

- `/tmp/colab-nf4-test.py` — 自包含脚本，包含：
  - 依赖安装（bitsandbytes, accelerate, diffusers 0.31.0）
  - 模型从 HuggingFace 下载
  - NF4 量化 patch（`_replace_linear_with_4bit`）
  - 2 个 test case：NF4 量化 8步 + baseline sequential_cpu_offload 8步

## 关键技术点

### Colab CLI 代理问题

Colab CLI 走 Python 3.14（homebrew），默认读系统代理 `127.0.0.1:7890`（FlClash），但 FlClash 的 TUN 模式下 `colab.research.google.com` 走 fake-ip + DIRECT 有 bug（类似 Modal 的问题）。

**解决方案**：`HTTPS_PROXY="" HTTP_PROXY=""` 绕过代理。ADC 认证凭据在 `~/.config/gcloud/application_default_credentials.json`，不走代理。

### NF4 量化代码

```python
def _replace_linear_with_4bit(module, compute_dtype=torch.float16):
    for name, child in module.named_children():
        if isinstance(child, torch.nn.Linear):
            new_layer = bnb.nn.Linear4bit(
                child.in_features, child.out_features,
                bias=child.bias is not None,
                compute_dtype=compute_dtype,
                quant_type='nf4',
            )
            if child.bias is not None:
                new_layer.bias = child.bias
            setattr(module, name, new_layer)
        else:
            _replace_linear_with_4bit(child, compute_dtype)
```

### diffusers 0.31.0 补丁

与 Kaggle 脚本完全相同的 patch（FLAX import fix + transformers check_torch_load_is_safe fix）。详见 `docs/research/echomimicv3-optimization-options.md`。

## 预期结果

- 如果 Colab 32GB CPU RAM 够用 → NF4 量化成功，transformer 从 3.35GB 压缩到 ~0.84GB，可能无需 CPU offload
- 如果仍然 OOM → 说明 bitsandbytes 在 32GB 上也不够，放弃 NF4 路线

## 参考

- Kaggle NF4 失败分析：`docs/research/echomimicv3-optimization-options.md` → "NF4/bitsandbytes 量化测试结论"
- Colab CLI 指南：`docs/research/colab-cli-guide.md`
- EchoMimicV3 优化方案：`docs/research/echomimicv3-optimization-options.md`
