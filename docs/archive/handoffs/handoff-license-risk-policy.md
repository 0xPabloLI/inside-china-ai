# Handoff: License 风险策略 — 不阻塞管线

> **给接手 Agent**：本 session 讨论了素材 License 的可用边界。用户明确要求：**所有素材先下载，遇到有风险的 License 时提醒但不阻塞管线**。需要实现这个策略。
> **建议 Skills**: `grill-with-docs` → `to-spec` → `to-tickets` → `implement`（Substantial workflow）

## 用户需求

> "我觉得你通过我们实际需要都下载下来，只是下载下来。如果你是遇到一些有风险的 license 你告诉我，但不要阻塞你正常的视频生成的管线。"

核心原则：

1. **下载不阻塞** — 不管什么 license 的素材都下载，管线继续运行
2. **风险提醒** — 遇到有风险 license 时输出提醒（log + report），但不停下来
3. **TikTok 描述区分** — 只有明确需要 attribution 的素材出现在 TikTok credits 中

## License 分类

### 可以用的（不提醒）

| License            | 说明              | TikTok Credits |
| ------------------ | ----------------- | -------------- |
| Public Domain (PD) | 无条件            | 不需要         |
| CC0                | 无条件            | 不需要         |
| CC-BY              | 署名即可          | ✅ 需要        |
| CC-BY-SA           | 署名 + 相同许可证 | ✅ 需要        |
| Pexels License     | 免费商用          | 不需要         |
| Unsplash License   | 免费商用          | 不需要         |
| Coverr License     | 免费商用          | 不需要         |
| Pixabay License    | 需要显示 Logo     | ✅ 需要        |

### 有风险的（提醒但不阻塞）

| License                              | 风险                                         | 建议               |
| ------------------------------------ | -------------------------------------------- | ------------------ |
| CC-BY-ND                             | 禁止演绎（No Derivatives）— 我们的混剪是演绎 | 建议替换，但不阻塞 |
| CC-BY-NC                             | 非商业 — 如果未来商业化有问题                | 建议替换，但不阻塞 |
| CC-BY-NC-SA                          | 非商业 + 相同许可证                          | 建议替换，但不阻塞 |
| CC-BY-NC-ND                          | 非商业 + 禁止演绎                            | 建议替换，但不阻塞 |
| All Rights Reserved / News copyright | Fair use 短片段+评论                         | 内部记录，不阻塞   |

## 当前代码状态

### 已实现（`asset-sourcer.mjs`）

`buildAttribution(source, asset)` 函数已有动态 license 判断：

- `SOURCE_ATTRIBUTIONS.wikimedia` 有 `dynamicAttribution: true` flag
- 通过 `fetchWikimediaLicense(fileTitle)` 查询 Commons API 获取 `extmetadata.LicenseShortName`
- CC-BY/CC-BY-SA → `attributionRequired=true`
- PD/CC0 → `attributionRequired=false`

### 未实现

1. **风险 License 检测** — 当前代码只判断 "要不要 attribution"，没有判断 "能不能用"
2. **非阻塞提醒机制** — 当前代码没有 "warn but continue" 的逻辑
3. **Wikimedia 以外的动态 license 检查** — Flickr 有 CC license filter 参数（`license=4,5,7,9,10,11,12`），但 asset-sourcer.mjs 没有集成 Flickr
4. **搜索时排除风险 License** — Flickr 搜索时可以用 `license` 参数排除 NC/ND，但 Wikimedia 搜索后需要逐文件检查

## 建议实现方案

### 1. 新增 `classifyLicenseRisk(license)` 函数

在 `asset-sourcer.mjs` 中新增：

```javascript
export function classifyLicenseRisk(license) {
  const lic = (license || "").toLowerCase();

  // 安全 — 可以用
  const safe = [
    "public domain",
    "cc0",
    "cc by",
    "cc-by",
    "cc by-sa",
    "cc-by-sa",
    "pexels",
    "unsplash",
    "coverr",
    "pixabay",
    "gfdl",
  ];
  if (safe.some((s) => lic.includes(s))) return { level: "safe", usable: true };

  // 有风险 — 提醒但不阻塞
  const risky = [
    "cc by-nd",
    "cc-by-nd",
    "cc by-nc",
    "cc-by-nc",
    "cc by-nc-nd",
    "cc-by-nc-nd",
    "cc by-nc-sa",
    "cc-by-nc-sa",
  ];
  if (risky.some((s) => lic.includes(s)))
    return {
      level: "risky",
      usable: true,
      warning: `${license} has restrictions (ND/NC). Consider replacing this asset.`,
    };

  // 未知 — 默认可用，但提醒
  return {
    level: "unknown",
    usable: true,
    warning: `Unknown license: ${license}. Verify usage rights.`,
  };
}
```

### 2. 在 `buildAttribution()` 中集成风险分类

```javascript
export function buildAttribution(source, asset) {
  // ... existing logic ...
  const risk = classifyLicenseRisk(license);
  if (risk.warning) {
    console.warn(`[License Warning] ${asset.url || source}: ${risk.warning}`);
  }
  return {
    // ... existing fields ...
    licenseRisk: risk.level,
    licenseWarning: risk.warning || null,
  };
}
```

### 3. 在 `asset-report.json` 中输出风险信息

```json
{
  "assets": [
    {
      "url": "...",
      "license": "CC BY-NC 4.0",
      "licenseRisk": "risky",
      "licenseWarning": "CC BY-NC 4.0 has restrictions (NC). Consider replacing this asset.",
      "attributionRequired": true
    }
  ],
  "licenseWarnings": ["Asset from Wikimedia: CC BY-NC 4.0 has NC restriction. Consider replacing."]
}
```

### 4. Flickr 集成时的 license 过滤

当未来集成 Flickr API 时，搜索参数加 `license=4,5,7,9,10,11,12`（排除 NC/ND）：

- `4` = CC BY 2.0
- `5` = CC BY-SA 2.0
- `7` = No known copyright
- `9` = CC0
- `10` = Public Domain Mark
- `11` = CC BY 4.0
- `12` = CC BY-SA 4.0
- 排除 `1,2,3,6,8`（NC/ND 变体）

## 影响面

需要修改的文件：

1. `scripts/short-video/lib/asset-sourcer.mjs` — 新增 `classifyLicenseRisk()` + 集成到 `buildAttribution()`
2. `scripts/short-video/lib/asset-sourcer.test.mjs`（或对应测试文件）— 新增 `classifyLicenseRisk` 测试
3. `docs/research/asset-source-quick-reference.md` — 更新 License 表

## 参考文件

- `scripts/short-video/lib/asset-sourcer.mjs` — `SOURCE_ATTRIBUTIONS` + `buildAttribution()` + `fetchWikimediaLicense()`
- `docs/research/asset-source-quick-reference.md` — License & Attribution Summary 表
- `docs/research/media-asset-strategy.md` §6 — Attribution System（详细 license 要求）
