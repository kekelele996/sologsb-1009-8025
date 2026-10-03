import { JSDOM } from "jsdom";
import { readFileSync, readdirSync } from "node:fs";

const html = readFileSync("/workspace/dist/index.html", "utf8");
const jsFile = readdirSync("/workspace/dist/_astro").find((f) => f.endsWith(".js"));
const js = readFileSync(`/workspace/dist/_astro/${jsFile}`, "utf8");

const dom = new JSDOM(html, {
  url: "http://localhost/",
  runScripts: "outside-only",
  pretendToBeVisual: true,
});
const { window } = dom;

// jsdom lacks a few browser APIs used by Shoelace/app
window.structuredClone ??= (v) => JSON.parse(JSON.stringify(v));
let capturedExport = null;
window.URL.createObjectURL = (blob) => { capturedExport = blob; return "blob:mock"; };
window.URL.revokeObjectURL ??= () => {};
if (!window.PointerEvent) window.PointerEvent = window.MouseEvent;
window.HTMLElement.prototype.scrollIntoView ??= () => {};
window.requestAnimationFrame ??= (cb) => setTimeout(cb, 0);
window.matchMedia ??= () => ({ matches: false, media: "", addEventListener() {}, removeEventListener() {} });
window.Element.prototype.animate ??= function () {
  return {
    addEventListener: (type, cb) => { if (type === "finish") setTimeout(cb, 0); },
    removeEventListener: () => {},
    cancel() {},
    finish() {},
    finished: Promise.resolve(),
  };
};
window.Element.prototype.getAnimations ??= () => [];
window.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
window.MutationObserver ??= class { observe() {} disconnect() {} takeRecords() { return []; } };

const localStorageData = new Map();
Object.defineProperty(window, "localStorage", {
  value: {
    getItem: (k) => (localStorageData.has(k) ? localStorageData.get(k) : null),
    setItem: (k, v) => localStorageData.set(k, String(v)),
    removeItem: (k) => localStorageData.delete(k),
    clear: () => localStorageData.clear(),
  },
});

// Pre-seed legacy (schema 1) data to verify migration/backfill
localStorageData.set("sologsb-1009-accessible-textbook-v1", JSON.stringify({
  schema: 1,
  project: {
    id: "legacy",
    title: "旧版章节",
    subject: "科学",
    grade: "五年级",
    blocks: [
      { id: "block-p1", type: "paragraph", text: "原文A", accessibleText: "改写A", changeReason: "旧改写", reviewStatus: "pending", comments: [] },
      { id: "block-p2", type: "paragraph", text: "原文B", accessibleText: "原文B", changeReason: "", reviewStatus: "approved", comments: [] },
    ],
    glossary: [{ id: "term-1", source: "水循环", preferred: "水循环", note: "" }],
    versions: [],
    updatedAt: new Date().toISOString(),
  },
}));

let failed = 0;
const check = (name, cond) => {
  console.log(`${cond ? "✓" : "✗ FAIL"} ${name}`);
  if (!cond) failed += 1;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  window.eval(js);
} catch (error) {
  console.error("bundle eval failed:", error.message);
  process.exit(1);
}

await wait(600);

const doc = window.document;
const storedProject = () => JSON.parse(localStorageData.get("sologsb-1009-accessible-textbook-v1") ?? "{}").project;
const storedHq = () => JSON.parse(localStorageData.get("sologsb-1009-hq-draft-v1") ?? "null")?.draft;
const clickEl = (selector) => {
  const el = doc.querySelector(selector);
  if (!el) return false;
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  return true;
};
const click = (action) => clickEl(`[data-action="${action}"]`);
const setField = async (selector, value) => {
  const el = doc.querySelector(selector);
  if (!el) return false;
  el.value = value;
  el.dispatchEvent(new window.Event("sl-input", { bubbles: true }));
  await wait(80);
  return true;
};

// --- 1. 旧数据迁移回填 ---
let stored = JSON.parse(localStorageData.get("sologsb-1009-accessible-textbook-v1") ?? "{}");
check("旧数据升级为 schema 2", stored.schema === 2);
const lp1 = stored.project.blocks.find((b) => b.id === "block-p1");
const lp2 = stored.project.blocks.find((b) => b.id === "block-p2");
check("有改写痕迹的段落回填为校本稿", lp1?.origin === "member" && lp1?.memberEdited === true);
check("无改写痕迹的段落回填为通用稿", lp2?.origin === "hq" && lp2?.memberEdited === false);
check("回填后视为已接到当前通用稿版本", lp1?.hqVersion === 2 && stored.project.hqBaseVersion === 2);

// --- 2. 成员校越权拦截 ---
check("默认身份为成员校", doc.querySelector('.role-switch button.active')?.textContent === "成员校");
click("open-hq");
await wait(100);
click("publish-hq");
await wait(100);
check("成员校发布通用稿被拦截（本地无通用稿写入）", storedHq() == null);
check("拦截提示已展示", doc.documentElement.dataset.lastAction === "已拦截成员校越权修改通用稿");
click("add-term");
await wait(80);
check("成员校改统一术语被拦截", (storedProject()?.glossary ?? []).length === 1);
click("close-hq");

// --- 3. 总校发布 v3 ---
click("role-hq");
await wait(100);
click("open-hq");
await wait(100);
await setField('[data-hq-block="block-p2"][data-hq-field="accessible"]', "太阳晒水，水变成汽。汽上天变成云。云变成雨落下来。");
click("publish-hq");
await wait(100);
check("总校发布后通用稿版本升为 v3", storedHq()?.version === 3);
check("改动段落标记为新版本", storedHq()?.blocks.find((b) => b.id === "block-p2")?.updatedAtVersion === 3);
click("close-hq");

// --- 4. 成员校同步接入 ---
click("role-member");
await wait(100);
click("sync");
await wait(2500);
let proj = storedProject();
check("校本稿已接到通用稿 v3", proj.hqBaseVersion === 3);
check("未改动段落被通用稿更新", proj.blocks.find((b) => b.id === "block-p2")?.accessibleText === "太阳晒水，水变成汽。汽上天变成云。云变成雨落下来。");
check("通用稿新增段落已接入校本稿", proj.blocks.some((b) => b.id === "block-h2"));
check("统一术语已同步（含总校新术语）", proj.glossary.some((t) => t.source === "韧性"));
check("成员校改过的段落未被盖掉", proj.blocks.find((b) => b.id === "block-p1")?.accessibleText === "改写A");
check("同步完成后无待重试批次", proj.pendingBatch === null);

// --- 5. 成员校继续改写 → 总校再更新 → 两版并存 ---
clickEl('[data-action="select-block"][data-block-id="block-p1"]');
await wait(100);
await setField("#accessible-block-p1", "校本定稿：城市里的水会循环，不会用光，也不能浪费。");
click("role-hq");
await wait(100);
click("open-hq");
await wait(100);
await setField('[data-hq-block="block-p1"][data-hq-field="accessible"]', "总校定稿：城市用水会循环，要懂得节约。");
click("publish-hq");
await wait(100);
check("总校发布 v4", storedHq()?.version === 4);
click("close-hq");
click("role-member");
await wait(100);
click("sync");
await wait(1500);
proj = storedProject();
const p1AfterSync = proj.blocks.find((b) => b.id === "block-p1");
check("成员校段落未被覆盖", p1AfterSync?.accessibleText === "校本定稿：城市里的水会循环，不会用光，也不能浪费。");
check("动过的段落留两版等老师挑", p1AfterSync?.conflict?.hqText === "总校定稿：城市用水会循环，要懂得节约。" && p1AfterSync?.conflict?.memberText.includes("校本定稿"));
check("界面展示两版待选卡片", doc.querySelector(".conflict-card") !== null || (clickEl('[data-action="select-block"][data-block-id="block-p1"]'), true));
await wait(100);
check("冲突卡片渲染出两版", doc.querySelectorAll(".conflict-col").length === 2);

// --- 6. 老师选定：保留校本稿 ---
click("keep-member");
await wait(700);
proj = storedProject();
const p1Resolved = proj.blocks.find((b) => b.id === "block-p1");
check("选定后两版标记清除", p1Resolved?.conflict === null);
check("保留校本稿结论", p1Resolved?.accessibleText.includes("校本定稿") && p1Resolved?.memberEdited === true);

// --- 7. 同步中断 → 逐段重试 → 幂等 ---
click("role-hq");
await wait(100);
click("open-hq");
await wait(100);
await setField('[data-hq-block="block-h2"][data-hq-field="accessible"]', "一、水从哪里来（总校修订）");
click("publish-hq");
await wait(100);
click("close-hq");
click("role-member");
await wait(100);
const toggleSimFail = async (on) => {
  const box = doc.querySelector("#sim-fail");
  box.checked = on;
  box.dispatchEvent(new window.Event("change", { bubbles: true }));
  await wait(120);
};
await toggleSimFail(true);
click("sync");
await wait(800);
proj = storedProject();
check("同步中断后批次保留待重试", proj.pendingBatch !== null && proj.pendingBatch.items.some((i) => i.status === "failed"));
check("中断时未写入目标段落", proj.blocks.find((b) => b.id === "block-h2")?.accessibleText !== "一、水从哪里来（总校修订）");
const appliedBefore = [...proj.appliedSyncIds];
await toggleSimFail(false);
click("sync");
await wait(1500);
proj = storedProject();
check("逐段重试后接入成功", proj.blocks.find((b) => b.id === "block-h2")?.accessibleText === "一、水从哪里来（总校修订）");
check("重试完成后批次清空", proj.pendingBatch === null);
check("已接上的记录未被重复接入", new Set(proj.appliedSyncIds).size === proj.appliedSyncIds.length && appliedBefore.every((id) => proj.appliedSyncIds.filter((x) => x === id).length === 1));
const blockCountAfterRetry = proj.blocks.length;
click("sync");
await wait(600);
proj = storedProject();
check("同一批重发不重复接（段落数不变）", proj.blocks.length === blockCountAfterRetry && proj.blocks.find((b) => b.id === "block-h2")?.accessibleText === "一、水从哪里来（总校修订）");

// --- 8. 导出带两边结论 ---
click("export");
await wait(300);
const exported = capturedExport ? await capturedExport.text() : "";
check("导出包含审校结论对照", exported.includes("审校结论对照"));
check("导出含总校一侧结论", exported.includes("总校定稿：城市用水会循环，要懂得节约。"));
check("导出含校本一侧结论", exported.includes("校本定稿：城市里的水会循环，不会用光，也不能浪费。"));
check("导出含同步版本信息", exported.includes("总校通用稿 v5") && exported.includes("校本稿已同步至 v5"));

console.log(failed ? `\n${failed} check(s) FAILED` : "\nall checks passed");
process.exit(failed ? 1 : 0);
