# Handoff: Colab NF4 量化测试 + 代理切换

> **创建时间**: 2026-08-22
> **最终更新**: 2026-08-23
> **状态**: ✅ 已完成

## 测试结论

### NF4 量化在 Colab Free T4 上不可行

- Colab Free T4 只有 12.7GB CPU RAM（可用 11.4GB），不足以完成模型下载 + bitsandbytes NF4 量化
- Kaggle T4 29GB CPU RAM 也 OOM（v46 验证），Colab Free 更不可能
- Colab Pro /月有 32GB RAM 理论可行，但 Kaggle 免费 29GB 已够用且有 v51 最优配置

### 代理从 FlClash 切换到 Clash Verge

- FlClash 代理端口 7890 处理 AuthorizedSession POST 请求时断连（bug，无法修复）
- Clash Verge mixed-port 7897 系统代理模式，Colab CLI 全链路成功
- TUN 通过 API 开启: curl -X PATCH http://127.0.0.1:9097/configs -d {"tun":{"enable":true}}

## 速度对比表

详见 docs/research/echomimicv3-optimization-options.md:

- v51 最优: T4 8步 TeaCache+compile = 14min/段, ~4.7h/1min视频
- NF4 预估: ~10min/段（不可行）
- NF4 优势: 模型压缩 4x, 可能消除 CPU offload, 但画质有损失 + 量化需大量 RAM

## 下一步: Modal T4 测试

### 为什么测 Modal?

- Kaggle v51 已固化 14min/段
- Colab Free RAM 不足
- Lightning AI 账号被封
- Modal /月 ~50h T4, CPU RAM 待确认

### Modal 测试要点

1. 确认 CPU RAM 是否 >29GB（够 NF4 量化）
2. 冷启动: serverless 每次重新下载
3. 脚本: 复用 /tmp/colab-nf4-test.py + Modal @stub.function
4. 代理: Clash Verge 127.0.0.1:7897

### Clash Verge 配置

- Merge.yaml: 已添加 colab/googleapis fake-ip-filter + nameserver-policy
- verge.yaml: enable_system_proxy=true, enable_tun_mode=true
- 端口: mixed-port 7897
- 运行: HTTPS_PROXY=http://127.0.0.1:7897 colab --auth=adc run --gpu T4 script.py

## 参考

- docs/research/digital-human-test-progress.md（测试进度主文件）
- docs/research/echomimicv3-optimization-options.md（优化方案+速度对比）
- docs/research/colab-cli-guide.md（Colab CLI 指南+FlClash 代理问题完整记录）
- docs/research/cloud-gpu-options.md（云 GPU 方案对比）
