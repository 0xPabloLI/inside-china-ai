## Summary

<!-- One or two sentences: what this PR does and why. -->

## 产品视角

<!-- 三句，各一行，写用户能感知的东西（`implementation-workflow.md` §9 第 8 步）。
     `scripts/check-product-view.mjs` 机械校验：本节缺失、不足三条实质内容、或原样留着下面的占位符
     → `Lint, typecheck, test` 变红。无用户可见变化时，第三句写明「无用户可见变化：<原因>」。
     改动没有用户面（拼写、依赖升级、纯内部重构）可给 PR 打 `skip-product-view` 标签。 -->

- 原本要解决什么用户可见问题：
- 用户现在看到什么变化：
- 没有变的行为或边界：

## Changes

<!-- Bullet list of the substantive changes, relative to origin/main. -->

## Verification

<!-- Only check items that were actually run and passed for this PR. Delete the section if nothing was verified. -->

- [ ] `npm run lint`
- [ ] `npx tsc --noEmit`
- [ ] `npm test`
- [ ] `npm run lint:docs` (docs changes)
- [ ] Other (describe):

## Risk & impact

<!-- Surface touched: auth/RLS, pipeline contracts, migrations, publishing path? Worst-case consequence and how it is bounded. -->

## Related issues

<!-- e.g. Closes #123 -->
