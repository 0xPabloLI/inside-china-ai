# OCR Code Review: scripts/short-video 核心文件

> 2026-09-19 | ocr scan --path 5 core files | 5 files (1 timeout) | 8 comments | 17m5s | qwen3:8b on Ollama

**注意**: asset-sourcer.mjs (3353行) 超时未审，其余 4 文件正常。

## Summary

- files_reviewed: 5
- comments: 8
- total_tokens: 77578
- elapsed: 17m5s

## Findings

### 1. [medium/maintainability] scripts/short-video/lib/assemble.mjs:25

Hardcoded file naming patterns '-v' and '-short.mp4' should be parameterized to avoid hardcoding business logic

**Existing:**
```
    .filter((f) => f.startsWith(`${filePrefix}-v`) && f.endsWith("-short.mp4"))
```

**Suggestion:**
```
    .filter((f) => f.startsWith(`${filePrefix}-${versionPattern}`) && f.endsWith("${fileSuffix}"))
```

---

### 2. [medium/maintainability] scripts/short-video/compile-series.mjs:78

Unreachable code in filter graph construction

**Existing:**
```
  for (let i = 1; i < files.length; i++) {
    const offset = Math.round(cumulativeOffset + files[i - 1].duration - xfadeDuration);
    cumulativeOffset += files[i - 1].duration - xfadeDuration;

    const vOut = i < files.length - 1 ? `[v${i}]` : "[vout]";
    const aOut = i < files.length - 1 ? `[
```

**Suggestion:**
```
Remove this unreachable code block as it's completely overridden by the subsequent loop
```

---

### 3. [medium/other] scripts/short-video/compile-series.mjs:41

Hardcoded output directory

**Existing:**
```
  const outputPath = getArg("output") || join(__dirname, "output", "compilation.mp4");
```

**Suggestion:**
```
Allow custom output directories via CLI parameter or config file
```

---

### 4. [high/security] scripts/short-video/compile-series.mjs:176

Command injection vulnerability in FFmpeg command construction

**Existing:**
```
  const cmd = buildXfadeCommand(filesWithDuration, outputPath, XFADE_DURATION);
  console.log(`  Command: ${cmd.substring(0, 120)}...`);
  
  try {
    execSync(cmd, { stdio: "pipe" });
```

**Suggestion:**
```
Sanitize/validate all user-provided paths before constructing FFmpeg commands
```

---

### 5. [high/security] scripts/short-video/digital-human.mjs:196

Potential path traversal vulnerabilities in user-provided path resolution. The code resolves user-provided --portrait paths and dynamically imports scene-data.mjs using paths constructed from user-provided contentDir without validation, risking directory traversal attacks

**Existing:**
```
const portrait = getArg(args, "portrait");
    const outputRoot = getArg(args, "output-root");
    const force = args.includes("--force");
    if (force && subcommand !== "run") {
      console.error("❌ --force is only valid for the run subcommand");
      process.exit(1);
    }
    const execute = 
```

**Suggestion:**
```
const portrait = getArg(args, "portrait");
const sanitizedPortrait = path.resolve(portrait || ".");
if (path.relative(process.cwd(), sanitizedPortrait).includes("..")) {
  console.error("❌ Invalid --portrait path: directory traversal attempt detected");
  process.exit(1);
}
const outputRoot = getArg(args, "output-root");
const force = args.includes("--force");
...
```

---

### 6. [medium/security] scripts/short-video/digital-human.mjs:0

Output directory validation lacks explicit path validation. The code resolves --output-root without checking if it matches the plan's output dir through proper validation.

**Existing:**
```
if (outputRoot && resolve(outputRoot) !== outputBase) {
    console.error(
      `❌ --output-root ${outputRoot} does not match the plan's output dir ${outputBase}`
    );
    process.exit(1);
  }
```

**Suggestion:**
```
const resolvedOutputRoot = resolve(outputRoot);
const isWithinPlanDir = path.relative(outputBase, resolvedOutputRoot).split("/").every(part => part !== "..");
if (!isWithinPlanDir) {
  console.error(`❌ --output-root ${outputRoot} is outside the plan's output directory`);
  process,exit(1);
}
```

---

### 7. [medium/test] scripts/short-video/digital-human.mjs:331

Audit function lacks detailed error messages for failed audits. The current error handling provides minimal feedback to users about the root cause of audit failures.

**Existing:**
```
try {
    result = await auditDigitalHumanPackage({
      plan,
      videoPath,
      outputDir: join(outputBase, plan.pipelineId),
      totalSceneCount,
    });
  } catch (e) {
    console.error(`❌ Frame audit could not run: ${e.message}`);
    process.exit(1);
  }
```

**Suggestion:**
```
try {
    result = await auditDigitalHumanPackage({
      plan,
      videoPath,
      outputDir: join(outputBase, plan.pipelineId),
      totalSceneCount,
    });
  } catch (e) {
    console.error(`❌ Frame audit failed: ${e.message}`);
    console.error(`   Details: ${e.stack}`);
    process.exit(1);
  }
```

---

### 8. [medium/maintainability] scripts/short-video/digital-human.mjs:0

Force flag could cause race conditions with concurrent kernels. The code allows force regeneration without checking if kernels are still running, leading to potential conflicts.

**Existing:**
```
const force = args.includes("--force");
...execute({
  ...,
  force,
});
```

**Suggestion:**
```
const force = args.includes("--force");
const kernelsRunning = await checkRunningKernels(plan.pipelineId);
if (force && kernelsRunning) {
  console.error("❌ Cannot force regenerate while kernels are still running");
  process.exit(1);
}
...execute({
  ...,
  force,
});
```

---
