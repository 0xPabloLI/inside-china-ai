# Handoff: HookScene/CtaScene 间距修复

> 来源：Session 2026-08-12，基于 Impeccable layout.md 的 5 维度审查
> 执行方式：新 session 里直接执行，不走 Spec/Tickets（这是模板微调，不是基础设施改动）

## 问题

HookScene 的 4 个间距值不一致，违反 Impeccable 的 "use a consistent scale" 原则：
- subject row → focal: `marginBottom: 30`
- focal claim → reveal: `marginTop: 20`
- bigNumber → numberLabel: `marginTop: 12`
- stats → source: `marginTop: 16`

另外 subject name 字号 80px 跟 focal claim 78px 几乎一样大，视觉层次不够分明。

## 修复

### 1. 统一 spacing scale 为 8px 基准

文件: `scripts/short-video/remotion/src/scenes/HookScene.tsx`

| 位置 | 当前值 | 改为 | 理由 |
|------|--------|------|------|
| line ~62 `marginBottom: 30` | 30 | **32** (8×4) | subject row → focal，最大间距（组间分隔） |
| line ~109 `marginTop: 12` | 12 | **16** (8×2) | bigNumber → numberLabel，小间距（主从关系） |
| line ~145 `marginTop: 20` | 20 | **24** (8×3) | claim → reveal，中间距（两个独立 focal 点） |
| line ~179 `marginTop: 16` | 16 | **16** (8×2) | ✅ 已在 scale 上，不改 |

### 2. 拉开 subject name 和 focal 的层次

| 位置 | 当前值 | 改为 | 理由 |
|------|--------|------|------|
| subject name `fontSize: 80` | 80 | **64** | subject 是辅助信息，focal 才是主角。64 vs 78/300 拉开层次 |
| subject logo `width/height: 120` | 120 | **96** | logo 跟 name 等比例缩小，保持视觉平衡 |

### 3. CtaScene 检查

文件: `scripts/short-video/remotion/src/scenes/CtaScene.tsx`

CtaScene 的间距检查：
- brand logo → brand name: `marginBottom: 40` → 改为 **40** (8×5) ✅ 已在 scale
- brand name → tagline: `marginBottom: 16` → ✅ 已在 scale
- action stamp → topic: `marginTop: 24` → ✅ 已在 scale

CtaScene 不需要改。

## 验证

修复后跑：
```bash
cd scripts/short-video/remotion && npx tsc --noEmit
node scripts/short-video/main.mjs --content _test-fixtures/hook-standard --skip-preflight --skip-verify
```

打开输出 MP4，检查：
1. subject name 比 focal 小（层次分明）
2. 各元素间距看起来有节奏感（不是随机距离）
3. 没有重叠
