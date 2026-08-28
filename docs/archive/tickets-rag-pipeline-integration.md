# 01 — RAG 查询步骤集成到 content-pipeline.md

**What to build:** Agent 在 content-pipeline.md 的 Stage 0 末尾和 Stage 3 Step 1 后自动执行 RAG 查询（`scripts/rag/query.mjs`），查询结果作为参考上下文避免内容重复、融入公司背景、可选添加交叉引用。Stage 2e 从管线步骤重新定位为工具参考块。Ollama 不可用时非阻塞跳过。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] Stage 0 末尾新增 RAG 查询步骤（查 `--type article` + `--type source-material`，用话题关键词+公司名）
- [ ] Stage 3 Step 1 之后新增 RAG 查询步骤（查 `--type scene-data` + `--type article`，用叙事角度+公司名）
- [ ] 两个查询步骤均包含非阻塞降级规则（Ollama 不可用 → 跳过+警告 → 继续）
- [ ] Stage 2e 从管线步骤序列移出，重新定位为"随时可用的工具"参考块（CLI 用法 + content_type 表格保留）
- [ ] 查询结果消费方式说明（避免重复 + 融入上下文 + 可选交叉引用，不持久化）
- [ ] grep 验证：`docs/content-pipeline.md` 中 Stage 0 区域包含 RAG 查询步骤
- [ ] grep 验证：`docs/content-pipeline.md` 中 Stage 3 Step 1 后包含 RAG 查询步骤
- [ ] grep 验证：Stage 2e 的 CLI 命令 `node scripts/rag/query.mjs` 仍存在于文档中
- [ ] grep 验证：新增步骤包含"非阻塞"或"跳过"降级描述
- [ ] 端到端验证：Ollama 运行时 `query.mjs` 在管线步骤中被正确调用；Ollama 未运行时 Agent 跳过并输出警告
