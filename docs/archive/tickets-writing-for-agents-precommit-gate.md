# Tickets: writing-for-agents Pre-commit Gate

> **来源 Spec**：`docs/spec-writing-for-agents-precommit-gate.md`

## 依赖图

```
Ticket 1 (checkWritingForAgentsGate 纯函数 + 测试)
    ↓
Ticket 2 (main() 集成 + pre-commit.sh grep 扩展)
```

---

## Ticket 1: 实现 checkWritingForAgentsGate 纯函数 + 测试

**What to build**: 新增 `checkWritingForAgentsGate()` 纯函数，分析 staged diff 检测结构性变更。先写测试（red），再实现函数（green）。

**File**: `scripts/lint-doc-hierarchy.mjs` + `scripts/__tests__/lint-doc-hierarchy.test.mjs`

**函数签名**:

```js
/**
 * Check 4: writing-for-agents gate.
 * Detects structural changes in staged docs/ files and AGENTS.md.
 * Returns WARN for: new/deleted section headings, pointer line changes, AGENTS.md modifications.
 *
 * @param {Array<{filename: string, diffLines: Array<{type: 'add'|'del'|'ctx', content: string}>}>} stagedDiffs
 * @returns {{findings: Array<{level: string, ruleId: string, file: string, message: string}>}}
 */
export function checkWritingForAgentsGate(stagedDiffs) { ... }
```

**判定逻辑**:

- `add`/`del` 行匹配 `^#{1,4}\s` → 标题新增/删除 → WARN
- `add`/`del` 行匹配 `→` → 指针变更 → WARN
- filename === `AGENTS.md` 且有 `add`/`del` 行 → WARN（任何非空白修改）
- 仅 `ctx` 行或纯空白 `add`/`del` → 不触发

**测试用例**（覆盖场景矩阵 1-8）:

1. 新增 `##` 标题 → WARN
2. 仅改错别字（add/del 行不含 `^#` 或 `→`）→ 无 WARN
3. AGENTS.md 任何修改 → WARN
4. 修改含 `→` 的指针行 → WARN
5. 新增含"必须"的规则行 → 不单独触发（用标题和指针检测覆盖）
6. 非 docs/ 非 AGENTS.md → 不触发
7. 删除标题行 → WARN
8. 仅 context 行变化 → 无 WARN

**Checklist**:
- [x] 测试文件 `scripts/__tests__/lint-doc-hierarchy.test.mjs` 新增 8 个测试用例
- [x] 测试先失败（red — 函数未实现）
- [x] `checkWritingForAgentsGate()` 纯函数实现
- [x] 测试全部通过（green）— 25/25 passing
- [x] 现有 3 项检查的测试不受影响

---

## Ticket 2: main() 集成 + pre-commit.sh grep 扩展

**What to build**: 在 `main()` 中调用 `checkWritingForAgentsGate()`，需要从 git diff 获取 staged 文件的 diff。扩展 `scripts/pre-commit.sh` 的 grep 范围包含 AGENTS.md。

**File**: `scripts/lint-doc-hierarchy.mjs` (main函数) + `scripts/pre-commit.sh`

**lint-doc-hierarchy.mjs main() 改动**:

新增获取 staged diff 的逻辑：
```js
import { execSync } from "node:child_process";

function getStagedDiffs() {
  const stagedFiles = execSync("git diff --cached --name-only --diff-filter=ACM", { encoding: "utf-8" })
    .trim().split("\n").filter(Boolean);
  
  const docsOrAgents = stagedFiles.filter(f => f.startsWith("docs/") || f === "AGENTS.md");
  
  return docsOrAgents.map(file => {
    const diff = execSync(`git diff --cached -- "${file}"`, { encoding: "utf-8" });
    const diffLines = parseDiffLines(diff);
    return { filename: file, diffLines };
  });
}
```

**pre-commit.sh 改动**:

```diff
- DOCS_STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '^docs/' || true)
+ DOCS_STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '^docs/|^AGENTS\.md$' || true)
```

**Checklist**:
- [x] `getStagedDiffs()` 函数实现 + `parseDiffLines()` 辅助函数
- [x] `main()` 调用 `checkWritingForAgentsGate(getStagedDiffs())`
- [x] WARN 输出到 stderr
- [x] `scripts/pre-commit.sh` grep 扩展
- [ ] 手动测试：`git add docs/some-file.md && git commit -m "test"` 触发 hook 且输出新检查结果
- [ ] 手动测试：`git add src/some-file.ts && git commit -m "test"` 不触发 doc-hierarchy 检查
