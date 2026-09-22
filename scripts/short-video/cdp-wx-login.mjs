#!/usr/bin/env node
/**
 * 在【真实登录态浏览器】里打开需登录源的登录页 → 点微信登录按钮 → 等扫码。
 *
 *   node scripts/short-video/cdp-wx-login.mjs --list
 *   node scripts/short-video/cdp-wx-login.mjs --source ithome            # 开登录页并点微信
 *   node scripts/short-video/cdp-wx-login.mjs --source zhihu --wait-login 10
 *   node scripts/short-video/cdp-wx-login.mjs <url> [--click] [--keep] [--reuse]
 *
 * --wait-login <min> : 点到二维码后轮询验证登录是否生效（新开后台标签验证，不打扰扫码标签）
 * --keep             : 不关闭标签（扫码必须 keep）
 * --reuse            : 同 host 已有 page 标签则复用
 * --click-text=<re>  : 覆盖点击候选正则
 * --no-guard         : 跳过自动化 profile 守卫（不推荐）
 *
 * 硬前提：CDP 实例必须跑在自动化 profile（~/chrome-tiktok-profile，9229）上。
 * 用错 profile 时本脚本默认直接退出——那上面的「登录墙」只是「这个 profile 没登录」。
 *
 * 为什么不能全自动：微信扫码要真人用手机扫，CDP/Playwright 都替不了。
 * 本脚本能做到的极限 = 把二维码摆到用户面前 + 自动确认登录生效。
 */

import { cdpCloseTab, cdpEval, cdpNewTab, waitForPageLoad } from "./lib/cdp-client.mjs";
import { checkAutomationProfile, formatVerdict } from "./lib/cdp-profile-guard.mjs";
import { getLoginSource, listLoginSources } from "./lib/cdp-login-sources.mjs";

const PROXY = process.env.CDP_BASE_URL || "http://localhost:3456";

/** 代理返回顶层 {value}，部分形态 {result:{value}} —— 都要兜 */
const unwrap = (r) => {
  const raw = r?.value ?? r?.result?.value;
  if (typeof raw !== "string") return { __err: JSON.stringify(r).slice(0, 300) };
  try {
    return JSON.parse(raw);
  } catch {
    return { __raw: raw.slice(0, 300) };
  }
};

async function listPages() {
  try {
    return (await (await fetch(`${PROXY}/targets`)).json()).filter((t) => t.type === "page");
  } catch {
    return [];
  }
}

const DISCOVER = `(() => {
  const vis = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 4 && r.height > 4 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity || 1) > 0.05;
  };
  const bag = (el) => [
    el.innerText || el.textContent || "", el.className || "", el.id || "",
    (el.getAttribute && (el.getAttribute("href") || el.getAttribute("title") || el.getAttribute("aria-label") || el.getAttribute("alt") || el.getAttribute("src"))) || ""
  ].join(" ");
  const desc = (el) => ({
    tag: el.tagName, cls: String(el.className || "").slice(0, 60),
    text: (el.innerText || el.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 50),
    href: (el.getAttribute && (el.getAttribute("href") || el.getAttribute("data-href"))) || null,
    src: (el.getAttribute && (el.getAttribute("src") || el.getAttribute("data-src"))) || null,
    visible: vis(el)
  });
  const all = [...document.querySelectorAll("*")];
  const wx = all.filter((el) => /微信|weixin|wechat/i.test(bag(el)) && vis(el))
    .map((el) => ({ el, len: (el.innerText || el.textContent || "").trim().length }))
    .filter((c) => c.len > 0 && c.len <= 20)
    .sort((a, b) => a.len - b.len)
    .slice(0, 12).map((c) => desc(c.el));
  const imgs = all.filter((el) => el.tagName === "IMG" && vis(el))
    .slice(0, 12).map((el) => ({ src: (el.getAttribute("src") || "").slice(0, 120), cls: String(el.className || "").slice(0, 40), w: el.width, h: el.height }));
  const txt = ((document.body && document.body.innerText) || "").replace(/\\n+/g, " | ").slice(0, 400);
  return JSON.stringify({ url: location.href, title: document.title, text: txt, wxCount: wx.length, wx, imgs });
})()`;

/** 取「最深、最小」的候选节点并点击（完整指针序列，组件库常要求） */
const clickScript = (PAT) => `(() => { try {
  const vis = (el) => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    return r.width > 4 && r.height > 4 && s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity || 1) > 0.05;
  };
  const bag = (el) => [el.innerText || el.textContent || "", el.className || "", el.id || "",
    (el.getAttribute && (el.getAttribute("href") || el.getAttribute("title") || el.getAttribute("aria-label"))) || ""].join(" ");
  const cands = [...document.querySelectorAll("a,button,div,span,li,i,label")]
    .filter((el) => new RegExp(${JSON.stringify(PAT)}, "i").test(bag(el)) && vis(el))
    .map((el) => {
      const t = (el.innerText || el.textContent || "").trim();
      const hasChild = [...el.children].some((c) => (c.innerText || "").trim().includes(t) && t.length > 0);
      return { el, len: t.length, leaf: !hasChild };
    })
    .filter((c) => c.len > 0 && c.len <= 20)
    .sort((a, b) => (Number(b.leaf) - Number(a.leaf)) || (a.len - b.len));
  if (!cands.length) return JSON.stringify({ clicked: false, reason: "no-candidate" });
  const best = cands[0];
  best.el.scrollIntoView({ block: "center" });
  const box = best.el.getBoundingClientRect();
  const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
  const mk = (type, Ctor, extra) => new Ctor(type, Object.assign({ bubbles: true, cancelable: true, composed: true, view: window, clientX: cx, clientY: cy, button: 0, buttons: 1 }, extra || {}));
  for (const [type, Ctor, extra] of [
    ["pointerover", PointerEvent, {}], ["pointerenter", PointerEvent, {}], ["pointerdown", PointerEvent, {}],
    ["mousedown", MouseEvent, {}], ["pointerup", PointerEvent, { buttons: 0 }],
    ["mouseup", MouseEvent, { buttons: 0 }], ["click", MouseEvent, { buttons: 0 }],
  ]) {
    try { best.el.dispatchEvent(mk(type, Ctor, extra)); } catch { /* 老引擎无 PointerEvent */ }
  }
  best.el.click();
  return JSON.stringify({ clicked: true, tag: best.el.tagName, cls: String(best.el.className || "").slice(0, 50),
    text: (best.el.innerText || "").trim().slice(0, 30), leaf: best.leaf, candidates: cands.length });
} catch (e) { return JSON.stringify({ clicked: false, error: String((e && e.message) || e), stack: String((e && e.stack) || "").slice(0,200) }); } })()`;

const args = process.argv.slice(2);

if (args.includes("--list")) {
  for (const s of listLoginSources()) {
    console.log(`\n## ${s.key} — ${s.name}`);
    console.log(`   登录页:   ${s.loginUrl}`);
    console.log(`   验证 URL: ${s.verifyUrl()}`);
    console.log(`   备注:     ${s.note || "—"}`);
  }
  process.exit(0);
}

// 位置参数要排除已被 flag 消费掉的值，否则 `--source zhihu` 里的 zhihu
// 会被当成 URL（实测：因此打开 about:blank，点击段被跳过）。
const consumed = new Set();
const flag = (name, fallback = null) => {
  const eqIdx = args.findIndex((a) => a.startsWith(`--${name}=`));
  if (eqIdx >= 0) return args[eqIdx].slice(`--${name}=`.length);
  const spIdx = args.indexOf(`--${name}`);
  if (spIdx >= 0 && spIdx + 1 < args.length && !args[spIdx + 1].startsWith("--")) {
    consumed.add(spIdx + 1);
    return args[spIdx + 1];
  }
  return fallback;
};
const positional = () =>
  args.find((a, i) => !a.startsWith("--") && !consumed.has(i));
const numFlag = (name, fallback) => {
  const v = flag(name);
  const n = Number.parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
};

const sourceKey = flag("source");
const source = sourceKey ? getLoginSource(sourceKey) : null;
if (sourceKey && !source) {
  console.error(`未知源: ${sourceKey}（--list 看可用源）`);
  process.exit(2);
}

// 先把所有 flag 解析完（填充 consumed），再取位置 URL —— 顺序反了会把
// `--wait-login 10` 的 10 当成 URL。
const keep = args.includes("--keep") || !!source; // 扫码场景默认保留
const doClick = args.includes("--click") || !!source;
const reuse = args.includes("--reuse");
const clickText =
  flag("click-text") || (source ? source.clickText : "微信登录|wechat|weixin|微信");
const waitMin = numFlag("wait-login", 0);

const url = source ? source.loginUrl : positional();
if (!url) {
  console.error("usage: cdp-wx-login.mjs --source <key> | <url> [--click] [--keep] [--reuse] [--wait-login <min>]");
  process.exit(2);
}

// ---- 前置守卫：用错 profile 时一切「登录墙」结论都是假的 ----
if (!args.includes("--no-guard")) {
  const guard = await checkAutomationProfile();
  console.log(formatVerdict(guard));
  if (guard.status !== "ok") {
    console.error(
      "\n⛔ 拒绝继续：CDP 不在自动化 profile 上。此环境下的「登录墙」只是「这个 profile 没登录」，不能作为判据。",
    );
    process.exit(1);
  }
}

let tabId = null;
if (reuse) {
  const host = new URL(url).host;
  const hit = (await listPages()).find((t) => {
    try {
      return new URL(t.url).host === host;
    } catch {
      return false;
    }
  });
  if (hit) {
    tabId = hit.targetId;
    console.log(`(reusing tab ${tabId} -> ${hit.url})`);
  }
}
if (!tabId) {
  tabId = await cdpNewTab(url);
  await waitForPageLoad(tabId, 3);
}
await new Promise((r) => setTimeout(r, 3000));

const snap = unwrap(await cdpEval(tabId, DISCOVER));
if (snap.__err) console.log("!! eval err:", snap.__err);
console.log("=== SNAPSHOT ===");
console.log(JSON.stringify({ url: snap.url, title: snap.title, text: snap.text, wxCount: snap.wxCount, wx: (snap.wx || []).slice(0, 6) }, null, 2));

if (doClick) {
  const r = unwrap(await cdpEval(tabId, clickScript(clickText)));
  console.log("=== CLICK ===");
  console.log(JSON.stringify(r, null, 2));
  await new Promise((x) => setTimeout(x, 3500));
  const after = unwrap(await cdpEval(tabId, DISCOVER));
  console.log("=== AFTER CLICK ===");
  console.log(JSON.stringify({ url: after.url, title: after.title, text: after.text, wxCount: after.wxCount, imgs: (after.imgs || []).slice(0, 6) }, null, 2));
}

// ---- 轮询等待登录生效（新开后台标签验证，不碰扫码标签）----
if (waitMin > 0 && source) {
  const deadline = Date.now() + waitMin * 60_000;
  console.log(`\n⏳ 等待登录生效（最长 ${waitMin} 分钟，每 15s 验证一次，Ctrl-C 中断）…`);
  let ok = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 15_000));
    const probe = await cdpNewTab(source.verifyUrl());
    await waitForPageLoad(probe, 2);
    await new Promise((r) => setTimeout(r, 2500));
    const st = unwrap(await cdpEval(probe, DISCOVER));
    await cdpCloseTab(probe);
    ok = source.loggedIn({ url: st.url, text: st.text });
    console.log(`  [${new Date().toLocaleTimeString()}] ${ok ? "✅ 已登录" : "…尚未登录"} (len=${(st.text || "").length})`);
    if (ok) break;
  }
  console.log(ok ? `\n✅ ${source.name} 登录已生效，登录态落在自动化 profile 里（后续无需再扫）` : `\n⚠️ ${waitMin} 分钟内未检测到登录生效`);
  process.exit(ok ? 0 : 1);
}

console.log("=== TAB ===", keep ? `KEPT OPEN: ${tabId}` : `closing: ${tabId}`);
if (!keep) await cdpCloseTab(tabId);
