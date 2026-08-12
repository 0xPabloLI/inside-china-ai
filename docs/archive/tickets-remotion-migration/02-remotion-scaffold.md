# 02 — Remotion 项目脚手架 + assets symlink

**What to build:** 在 `scripts/short-video/remotion/` 创建 Remotion 项目骨架：package.json（remotion/@remotion/cli/@remotion/renderer/@remotion/transitions/react/react-dom）、tsconfig.json、remotion.config.ts、空 Root.tsx。symlink `public/assets → ../../assets` 让 Remotion `staticFile()` 访问 brand SVG logos。

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] `scripts/short-video/remotion/package.json` 含所有 Remotion 依赖，`npm install` 成功
- [ ] `scripts/short-video/remotion/tsconfig.json` 配置 jsx + strict
- [ ] `scripts/short-video/remotion/remotion.config.ts` 配置 1080×1920 30fps
- [ ] `scripts/short-video/remotion/public/assets` 是指向 `../../assets` 的 symlink
- [ ] `scripts/short-video/remotion/src/Root.tsx` 注册一个空 Composition
- [ ] `cd scripts/short-video/remotion && npx remotion studio` 成功启动，浏览器可打开
- [ ] `staticFile('assets/logos/deepseek.svg')` 在 Composition 中可渲染
