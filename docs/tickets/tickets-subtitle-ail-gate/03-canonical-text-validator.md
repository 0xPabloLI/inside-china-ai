# T3 — canonical-text 校验函数 + 专有名词规范化

**What to build:** 新增 `verifyCanonicalText()` 函数，输入 timing 数据 + scene-data scenes + meta.keyEntities，输出 `{ passed, mismatches, details }`。规范化规则：标点剥离 + 大小写折叠 + 专有名词 greedy merge（词典从 keyEntities 构建）。

**Parent:** #120

**Blocked by:** T2

**Status:** ready-for-agent

- [x] 实现 `normalizeText(text)`: 标点剥离 + 大小写折叠
- [x] 实现 `buildProperNounDictionary(keyEntities)`: 从 keyEntities 构建专有名词词典
- [x] 实现 `greedyMerge(tokens, dictionary)`: 把被拆开的专有名词合并
- [x] 实现 `verifyCanonicalText(timingData, scenes, keyEntities)`: 比对规范化后的 timing 词序列 vs scene-data canonical text
- [x] scene voiceover 为空时跳过该 scene（不报 FAIL）
- [x] voiceover 非空但 timing words 为空时报 FAIL（对齐失败）
- [x] 成功条件：100% 序列匹配（不接受"错误总数下降"）
- [x] 测试：timing 与 scene-data 一致 → PASS
- [x] 测试：scene-data 改一个词 → FAIL + 失配详情
- [x] 测试：专有名词被拆开 → greedy merge → PASS
- [x] 测试：专有名词不在词典中 → FAIL（误报可接受）
- [x] 测试：scene 无 voiceover → skip
- [x] 测试：voiceover 非空但 timing words 为空 → FAIL
