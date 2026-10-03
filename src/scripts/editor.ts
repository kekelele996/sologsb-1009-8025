import "@shoelace-style/shoelace/dist/shoelace.js";

type BlockType = "heading" | "paragraph" | "image" | "link";
type ReviewStatus = "pending" | "approved" | "needs-work";
type Severity = "error" | "warning" | "info";
type Role = "hq" | "member";
type BlockOrigin = "hq" | "member";

interface CommentReply {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

interface CommentItem {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  resolved: boolean;
  replies: CommentReply[];
}

interface ConflictInfo {
  hqText: string;
  hqReason: string;
  hqVersion: number;
  memberText: string;
  memberReason: string;
}

interface ContentBlock {
  id: string;
  type: BlockType;
  text: string;
  accessibleText: string;
  headingLevel?: number;
  imageSrc?: string;
  imageAlt?: string;
  linkHref?: string;
  changeReason: string;
  reviewStatus: ReviewStatus;
  comments: CommentItem[];
  origin: BlockOrigin;
  hqVersion: number;
  memberEdited: boolean;
  conflict: ConflictInfo | null;
}

interface GlossaryTerm {
  id: string;
  source: string;
  preferred: string;
  note: string;
}

interface VersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
  blocks: ContentBlock[];
  glossary: GlossaryTerm[];
}

interface SyncItem {
  id: string;
  kind: "block" | "glossary";
  blockId?: string;
  hqVersion: number;
  payload?: HqBlock;
  glossary?: GlossaryTerm[];
  status: "pending" | "applied" | "conflict" | "failed";
  note?: string;
}

interface SyncBatch {
  id: string;
  createdAt: string;
  toVersion: number;
  items: SyncItem[];
}

interface ChapterProject {
  id: string;
  title: string;
  subject: string;
  grade: string;
  blocks: ContentBlock[];
  glossary: GlossaryTerm[];
  versions: VersionSnapshot[];
  updatedAt: string;
  hqBaseVersion: number;
  glossaryVersion: number;
  appliedSyncIds: string[];
  pendingBatch: SyncBatch | null;
}

interface HqBlock {
  id: string;
  type: BlockType;
  text: string;
  accessibleText: string;
  headingLevel?: number;
  imageSrc?: string;
  imageAlt?: string;
  linkHref?: string;
  changeReason: string;
  updatedAtVersion: number;
}

interface HqDraft {
  version: number;
  blocks: HqBlock[];
  glossary: GlossaryTerm[];
  updatedAt: string;
}

interface AccessibilityIssue {
  id: string;
  blockId: string;
  type: "heading" | "link" | "image" | "glossary" | "sentence";
  severity: Severity;
  title: string;
  detail: string;
  suggestion: string;
}

const STORAGE_KEY = "sologsb-1009-accessible-textbook-v1";
const HQ_STORAGE_KEY = "sologsb-1009-hq-draft-v1";
const ROLE_STORAGE_KEY = "sologsb-1009-role";
const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SEED_IMAGE_SRC = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='420'%3E%3Crect width='800' height='420' fill='%23dcecf3'/%3E%3Ccircle cx='650' cy='85' r='45' fill='%23f4c95d'/%3E%3Cpath d='M0 300 Q180 240 340 300 T800 280 V420 H0Z' fill='%2389b7d0'/%3E%3Cpath d='M130 285 Q220 170 330 285' fill='none' stroke='%233a7c9e' stroke-width='12'/%3E%3C/svg%3E";

function createSeedProject(): ChapterProject {
  const block = (
    id: string,
    type: BlockType,
    text: string,
    accessibleText: string,
    changeReason: string,
    reviewStatus: ReviewStatus,
    memberEdited: boolean,
    extra: Partial<ContentBlock> = {},
  ): ContentBlock => ({
    id,
    type,
    text,
    accessibleText,
    changeReason,
    reviewStatus,
    comments: [],
    origin: memberEdited ? "member" : "hq",
    hqVersion: 1,
    memberEdited,
    conflict: null,
    ...extra,
  });
  const blocks: ContentBlock[] = [
    block("block-h1", "heading", "第三章 水循环与城市", "第三章 水循环与城市", "", "approved", false, { headingLevel: 1 }),
    block(
      "block-p1",
      "paragraph",
      "城市中的水并非取之不尽，由于其会通过蒸发、降水以及地表径流等若干复杂过程在自然界中持续循环，因此理解这些过程对于建设具有韧性的城市具有十分重要的意义。",
      "城市里的水会不断循环。它经过蒸发、降水并沿地面流动。了解这些过程，可以帮助我们建设更能适应变化的城市。",
      "拆分长句，把抽象表述改为更直接的说明。",
      "pending",
      true,
    ),
    block("block-h2", "heading", "一、水从哪里来", "一、水从哪里来", "保留原章节结构。", "approved", false, { headingLevel: 2 }),
    block("block-img", "image", "图 3-1 城市水循环示意", "", "", "needs-work", false, { imageSrc: SEED_IMAGE_SRC, imageAlt: "" }),
    block(
      "block-p2",
      "paragraph",
      "当太阳照射到水面时，水会受热变成水蒸气升到空中。水蒸气冷却后形成云，再以雨或雪的形式落回地面。",
      "太阳照在水面上，水会变成水蒸气升到空中。水蒸气冷却后变成云，最后以雨或雪落回地面。",
      "使用较短句子，并明确每个步骤的先后顺序。",
      "approved",
      false,
    ),
    block("block-link", "link", "点击这里", "打开水循环互动实验", "改为说明链接目标的独立文案。", "pending", true, { linkHref: "/resources/water-cycle" }),
    block("block-h3", "heading", "雨水花园怎样工作", "雨水花园怎样工作", "", "approved", false, { headingLevel: 3 }),
    block(
      "block-p3",
      "paragraph",
      "雨水花园利用土壤和植物的共同作用暂时储存雨水，同时通过下渗补给地下水，并在降雨较集中时减轻城市排水管道所承受的压力。",
      "雨水花园用土壤和植物暂时存住雨水。雨水还会慢慢渗入地下，补充地下水。雨很大时，它可以减轻排水管的压力。",
      "把并列成分拆成短句，减少专业术语密度。",
      "pending",
      true,
    ),
  ];

  return {
    id: "accessible-textbook-1009",
    title: "科学（五年级下册）·无障碍改写稿",
    subject: "科学",
    grade: "五年级",
    blocks,
    glossary: [
      { id: "term-1", source: "水循环", preferred: "水循环", note: "全书统一使用" },
      { id: "term-2", source: "地表径流", preferred: "沿地面流动的水", note: "首次出现时使用通俗解释" },
      { id: "term-3", source: "下渗", preferred: "渗入地下", note: "避免单独使用专业词" },
    ],
    versions: [],
    updatedAt: new Date().toISOString(),
    hqBaseVersion: 1,
    glossaryVersion: 1,
    appliedSyncIds: [],
    pendingBatch: null,
  };
}

function createSeedHqDraft(): HqDraft {
  return {
    version: 2,
    updatedAt: new Date().toISOString(),
    blocks: [
      { id: "block-h1", type: "heading", headingLevel: 1, text: "第三章 水循环与城市", accessibleText: "第三章 水循环与城市", changeReason: "", updatedAtVersion: 1 },
      {
        id: "block-p1",
        type: "paragraph",
        text: "城市中的水并非取之不尽，由于其会通过蒸发、降水以及地表径流等若干复杂过程在自然界中持续循环，因此理解这些过程对于建设具有韧性的城市具有十分重要的意义。",
        accessibleText: "城市里的水会不断循环。水会蒸发，会变成雨落下来。了解水的循环，城市就能更好地应对暴雨和干旱。",
        changeReason: "总校统一：进一步口语化，并补全因果关系。",
        updatedAtVersion: 2,
      },
      { id: "block-h2", type: "heading", headingLevel: 2, text: "一、水从哪里来", accessibleText: "一、水从哪里来", changeReason: "保留原章节结构。", updatedAtVersion: 1 },
      {
        id: "block-img",
        type: "image",
        text: "图 3-1 城市水循环示意",
        imageSrc: SEED_IMAGE_SRC,
        imageAlt: "示意图：太阳照射城市水面，水汽上升成云，雨水落回地面，汇入河流。",
        accessibleText: "示意图：太阳照射城市水面，水汽上升成云，雨水落回地面，汇入河流。",
        changeReason: "总校统一：补充替代文本，说明图中水的循环路径。",
        updatedAtVersion: 2,
      },
      {
        id: "block-p2",
        type: "paragraph",
        text: "当太阳照射到水面时，水会受热变成水蒸气升到空中。水蒸气冷却后形成云，再以雨或雪的形式落回地面。",
        accessibleText: "太阳照在水面上，水受热变成水蒸气。水蒸气升到空中，冷却后变成云。云里的水多了，就会以雨或雪落回地面。",
        changeReason: "总校统一：拆成三步，先后顺序更清楚。",
        updatedAtVersion: 2,
      },
      { id: "block-link", type: "link", text: "点击这里", linkHref: "/resources/water-cycle", accessibleText: "打开水循环互动实验", changeReason: "改为说明链接目标的独立文案。", updatedAtVersion: 1 },
      { id: "block-h3", type: "heading", headingLevel: 3, text: "雨水花园怎样工作", accessibleText: "雨水花园怎样工作", changeReason: "", updatedAtVersion: 1 },
      {
        id: "block-p3",
        type: "paragraph",
        text: "雨水花园利用土壤和植物的共同作用暂时储存雨水，同时通过下渗补给地下水，并在降雨较集中时减轻城市排水管道所承受的压力。",
        accessibleText: "雨水花园用土壤和植物暂时存住雨水。雨水还会慢慢渗入地下，补充地下水。雨很大时，它可以减轻排水管的压力。",
        changeReason: "把并列成分拆成短句，减少专业术语密度。",
        updatedAtVersion: 1,
      },
    ],
    glossary: [
      { id: "term-1", source: "水循环", preferred: "水循环", note: "全书统一使用" },
      { id: "term-2", source: "地表径流", preferred: "沿地面流动的水", note: "首次出现时使用通俗解释" },
      { id: "term-3", source: "下渗", preferred: "渗入地下", note: "避免单独使用专业词" },
      { id: "term-4", source: "韧性", preferred: "能适应变化、扛得住冲击", note: "总校统一：避免抽象词" },
    ],
  };
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function parseImportedChapter(input: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.+)$/.exec(line);
    if (heading) {
      blocks.push(blankBlock("heading", heading[2], { headingLevel: heading[1].length }));
      continue;
    }
    const image = /^!\[([^\]]*)\]\(([^)]+)\)(?:\s+(.+))?$/.exec(line);
    if (image) {
      blocks.push(blankBlock("image", image[3] || "未命名图片", { imageSrc: image[2], imageAlt: image[1] }));
      continue;
    }
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(line);
    if (link) {
      blocks.push(blankBlock("link", link[1], { linkHref: link[2] }));
      continue;
    }
    blocks.push(blankBlock("paragraph", line));
  }
  return blocks.length ? blocks : [blankBlock("paragraph", input.trim() || "请输入章节内容")];
}

function blankBlock(type: BlockType, text: string, extra: Partial<ContentBlock> = {}): ContentBlock {
  return {
    id: uid("block"),
    type,
    text,
    accessibleText: type === "image" ? extra.imageAlt ?? "" : text,
    changeReason: "",
    reviewStatus: "pending",
    comments: [],
    origin: "member",
    hqVersion: 0,
    memberEdited: false,
    conflict: null,
    ...extra,
  };
}

function sentenceLength(text: string) {
  const normalized = text.replace(/\s+/g, "");
  return /[A-Za-z]/.test(text) ? text.trim().split(/\s+/).length : normalized.length;
}

function analyze(project: ChapterProject): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = [];
  let lastHeading = 0;
  for (const block of project.blocks) {
    if (block.type === "heading") {
      const level = block.headingLevel ?? 2;
      if (lastHeading && level > lastHeading + 1) {
        issues.push({
          id: `heading-${block.id}`,
          blockId: block.id,
          type: "heading",
          severity: "error",
          title: "标题层级跳跃",
          detail: `从 H${lastHeading} 直接到 H${level}，读屏用户会失去清晰的章节结构。`,
          suggestion: `改为 H${lastHeading + 1}，或补上中间的上级标题。`,
        });
      }
      lastHeading = level;
    }
    if (block.type === "image" && !(block.imageAlt ?? block.accessibleText).trim()) {
      issues.push({
        id: `image-${block.id}`,
        blockId: block.id,
        type: "image",
        severity: "error",
        title: "图片缺少替代文本",
        detail: "视觉用户能看到的图表信息，读屏用户目前无法获得。",
        suggestion: "说明图中主体、变化和结论；纯装饰图片应标记为空替代文本。",
      });
    }
    if (block.type === "link") {
      const label = block.accessibleText || block.text;
      if (/^(点击这里|这里|链接|更多|here|click here|read more)$/i.test(label.trim())) {
        issues.push({
          id: `link-${block.id}`,
          blockId: block.id,
          type: "link",
          severity: "error",
          title: "链接文案缺少目的",
          detail: `“${label}”单独朗读时无法说明会前往哪里。`,
          suggestion: "改成“打开水循环互动实验”等可独立理解的文案。",
        });
      }
    }
    const text = block.type === "image" ? block.text : block.text;
    const sentences = text.split(/(?<=[。！？!?])\s*/).filter(Boolean);
    for (const [index, sentence] of sentences.entries()) {
      if (sentenceLength(sentence) > (/[A-Za-z]/.test(sentence) ? 28 : 42)) {
        issues.push({
          id: `sentence-${block.id}-${index}`,
          blockId: block.id,
          type: "sentence",
          severity: "warning",
          title: "句子过长",
          detail: `该句约 ${sentenceLength(sentence)} ${/[A-Za-z]/.test(sentence) ? "个词" : "个字"}，一次理解的信息较多。`,
          suggestion: "按动作或因果关系拆成 2—3 个短句。",
        });
      }
    }
    const source = `${block.text} ${block.accessibleText}`;
    for (const term of project.glossary) {
      if (source.includes(term.source) && block.accessibleText && !block.accessibleText.includes(term.preferred)) {
        issues.push({
          id: `term-${block.id}-${term.id}`,
          blockId: block.id,
          type: "glossary",
          severity: "info",
          title: `术语“${term.source}”尚未统一`,
          detail: `全书建议表述为“${term.preferred}”。${term.note}`,
          suggestion: `将无障碍文本调整为“${term.preferred}”。`,
        });
      }
    }
  }
  return issues;
}

function simplifyText(input: string, glossary: GlossaryTerm[]) {
  let result = input
    .replaceAll("由于其", "因为")
    .replaceAll("因此", "所以")
    .replaceAll("具有十分重要的意义", "很重要")
    .replaceAll("利用", "使用")
    .replaceAll("共同作用", "一起作用")
    .replaceAll("暂时储存", "暂时存住")
    .replaceAll("所承受的压力", "受到的压力")
    .replace(/([^。！？]{38,}?)[，、]([^。！？]{12,}?[。！？])/g, "$1。$2");
  for (const term of glossary) {
    if (result.includes(term.source)) result = result.replaceAll(term.source, term.preferred);
  }
  result = result
    .split(/(?<=[。！？!?])\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .join("\n");
  return result;
}

function blockRole(block: ContentBlock) {
  if (block.type === "heading") return `H${block.headingLevel ?? 2} 标题`;
  if (block.type === "image") return "图片 / 替代文本";
  if (block.type === "link") return "链接";
  return "正文段落";
}

function hqBlockRole(block: HqBlock) {
  if (block.type === "heading") return `H${block.headingLevel ?? 2} 标题`;
  if (block.type === "image") return "图片 / 替代文本";
  if (block.type === "link") return "链接";
  return "正文段落";
}

function statusLabel(status: ReviewStatus) {
  if (status === "approved") return "已通过";
  if (status === "needs-work") return "需修改";
  return "待审核";
}

function severityLabel(severity: Severity) {
  if (severity === "error") return "必须修复";
  if (severity === "warning") return "建议优化";
  return "一致性提醒";
}

function exportHtml(project: ChapterProject, hq: HqDraft) {
  const body = project.blocks.map((block) => {
    if (block.type === "heading") {
      const level = Math.min(6, Math.max(1, block.headingLevel ?? 2));
      return `<h${level}>${escapeHtml(block.accessibleText || block.text)}</h${level}>`;
    }
    if (block.type === "image") {
      return `<figure><img src="${escapeHtml(block.imageSrc ?? "")}" alt="${escapeHtml(block.imageAlt || block.accessibleText)}"><figcaption>${escapeHtml(block.text)}</figcaption></figure>`;
    }
    if (block.type === "link") {
      return `<p><a href="${escapeHtml(block.linkHref ?? "#")}">${escapeHtml(block.accessibleText || block.text)}</a></p>`;
    }
    return `<p>${escapeHtml(block.accessibleText || block.text)}</p>`;
  }).join("\n      ");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(project.title)} · 无障碍版本</title>
  <style>
    :root { font-family: "Noto Sans SC", sans-serif; font-size: 20px; line-height: 1.85; color: #17231f; background: #fffdf7; }
    body { max-width: 760px; margin: 0 auto; padding: 32px 24px 80px; }
    a { color: #075c9d; text-decoration-thickness: 2px; text-underline-offset: 3px; }
    a:focus-visible, [tabindex]:focus-visible { outline: 4px solid #d08a00; outline-offset: 3px; }
    h1, h2, h3, h4, h5, h6 { line-height: 1.4; margin-top: 1.8em; }
    figure { margin: 2em 0; } img { max-width: 100%; height: auto; } figcaption { font-size: .86em; color: #46554f; }
    .skip { position: absolute; left: -9999px; } .skip:focus { position: static; display: inline-block; padding: .5em; background: #fff; }
    .conclusions { margin-top: 3em; border-top: 3px solid #1f4a3e; padding-top: .5em; }
    .conclusions > p { color: #46554f; font-size: .8em; }
    .conclusion-row { border: 1px solid #d7ddd9; border-radius: 10px; padding: 14px 16px; margin: 14px 0; background: #fff; }
    .conclusion-row h3 { font-size: .9em; margin: 0 0 8px; }
    .conclusion-row p { margin: 6px 0; font-size: .85em; }
    .conclusion-row small { color: #5f6e68; }
    .conclusion-row .pending-pick { color: #8a5209; font-weight: 700; }
  </style>
</head>
<body>
  <a class="skip" href="#main">跳到正文</a>
  <main id="main" tabindex="-1">
      ${body}
      ${renderExportConclusions(project, hq)}
  </main>
</body>
</html>`;
}

function renderExportConclusions(project: ChapterProject, hq: HqDraft) {
  const rows: string[] = [];
  project.blocks.forEach((block, index) => {
    const hqBlock = hq.blocks.find((item) => item.id === block.id);
    const diverged = block.memberEdited || block.conflict !== null || (hqBlock !== undefined && hqBlock.accessibleText !== block.accessibleText);
    if (!diverged) return;
    const hqText = block.conflict ? block.conflict.hqText : hqBlock?.accessibleText ?? "（通用稿中无此段）";
    const hqReason = block.conflict ? block.conflict.hqReason : hqBlock?.changeReason ?? "";
    const state = block.conflict ? `<span class="pending-pick">两版待老师选定</span>` : block.memberEdited ? "校本定稿" : "与通用稿一致";
    rows.push(`<div class="conclusion-row">
        <h3>第 ${index + 1} 段 · ${blockRole(block)} · ${state}</h3>
        <p><b>总校通用稿：</b>${escapeHtml(hqText)}${hqReason ? `<br><small>总校说明：${escapeHtml(hqReason)}</small>` : ""}</p>
        <p><b>校本稿结论：</b>${escapeHtml(block.accessibleText || block.text)}${block.changeReason ? `<br><small>改写原因：${escapeHtml(block.changeReason)}</small>` : ""}</p>
        <p><b>审核状态：</b>${statusLabel(block.reviewStatus)}</p>
      </div>`);
  });
  return `<section class="conclusions" aria-label="审校结论对照">
      <h2>审校结论对照（总校通用稿 × 校本稿）</h2>
      <p>总校通用稿 v${hq.version} · 校本稿已同步至 v${project.hqBaseVersion} · 导出时间 ${new Date().toLocaleString()}</p>
      ${rows.length ? rows.join("\n      ") : "<p>校本稿与总校通用稿完全一致，无分歧段落。</p>"}
    </section>`;
}

function download(filename: string, content: string, type = "text/html;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function loadHqDraft(): HqDraft {
  try {
    const stored = JSON.parse(localStorage.getItem(HQ_STORAGE_KEY) ?? "") as { schema: number; draft: HqDraft };
    if (stored.schema === 1 && stored.draft?.blocks?.length) return stored.draft;
  } catch {
    // Fall back to the bundled sample.
  }
  return createSeedHqDraft();
}

let migrationNote = "";

function migrateLegacyProject(legacy: ChapterProject, hq: HqDraft): ChapterProject {
  // 旧数据没有归属字段：按现有改写来源（是否留下改写痕迹）回填。
  for (const block of legacy.blocks) {
    const rewritten = block.type === "image"
      ? Boolean((block.imageAlt ?? "").trim() || block.changeReason.trim())
      : Boolean(block.changeReason.trim()) || block.accessibleText !== block.text;
    block.origin = rewritten ? "member" : "hq";
    block.memberEdited = rewritten;
    block.hqVersion = hq.version;
    block.conflict = null;
  }
  legacy.hqBaseVersion = hq.version;
  legacy.glossaryVersion = hq.version;
  legacy.appliedSyncIds = [];
  legacy.pendingBatch = null;
  migrationNote = "旧数据已按现有改写来源回填归属：有改写痕迹的段落记为校本稿，其余记为通用稿。";
  return legacy;
}

function loadProject(hq: HqDraft): ChapterProject {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "") as { schema: number; project: ChapterProject };
    if (stored.schema === 2 && stored.project?.blocks?.length) return stored.project;
    if (stored.schema === 1 && stored.project?.blocks?.length) return migrateLegacyProject(stored.project, hq);
  } catch {
    // Fall back to the bundled sample.
  }
  return createSeedProject();
}

const rootElement = document.querySelector<HTMLDivElement>("#app");
if (!rootElement) throw new Error("Application root was not found");
const app: HTMLDivElement = rootElement;

let hqDraft = loadHqDraft();
let project = loadProject(hqDraft);
let role: Role = localStorage.getItem(ROLE_STORAGE_KEY) === "hq" ? "hq" : "member";
let activeBlockId = project.blocks[0]?.id ?? "";
let activeIssueId = "";
let previewMode: "normal" | "assisted" = "normal";
let selectedVersionId = "";
let showGlossary = false;
let showHq = false;
let hqWorking: HqDraft | null = null;
let syncRunning = false;
let simulateFailure = false;
let undoStack: ChapterProject[] = [];
let redoStack: ChapterProject[] = [];
let saveTimer = 0;

const activeBlock = () => project.blocks.find((block) => block.id === activeBlockId) ?? project.blocks[0];
const issues = () => analyze(project);

function saveSoon() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 2, project }));
  }, 320);
}

function saveHq() {
  localStorage.setItem(HQ_STORAGE_KEY, JSON.stringify({ schema: 1, draft: hqDraft }));
}

function toast(title: string, detail = "", variant: "primary" | "success" | "warning" | "danger" = "primary") {
  const alert = document.createElement("sl-alert");
  alert.setAttribute("variant", variant);
  alert.setAttribute("duration", "4200");
  alert.setAttribute("closable", "");
  alert.innerHTML = `<strong>${escapeHtml(title)}</strong>${detail ? `<div style="font-size:11px;margin-top:3px;line-height:1.5">${escapeHtml(detail)}</div>` : ""}`;
  document.body.appendChild(alert);
  void customElements.whenDefined("sl-alert").then(() => (alert as unknown as { toast: () => void }).toast());
}

function guardHqAction() {
  if (role === "hq") return true;
  document.documentElement.dataset.lastAction = "已拦截成员校越权修改通用稿";
  render();
  toast("已拦截：越权修改通用稿", "成员校不能直接修改通用稿与统一术语。请在校本稿上改写，或由总校发布后同步接入。", "danger");
  return false;
}

function commit(label: string, update: (draft: ChapterProject) => void, renderAfter = true) {
  undoStack = [...undoStack.slice(-49), structuredClone(project)];
  redoStack = [];
  const draft = structuredClone(project);
  update(draft);
  draft.updatedAt = new Date().toISOString();
  project = draft;
  document.documentElement.dataset.lastAction = label;
  saveSoon();
  if (renderAfter) render();
}

function undo() {
  const previous = undoStack.pop();
  if (!previous) return;
  redoStack = [structuredClone(project), ...redoStack].slice(0, 50);
  project = previous;
  if (!project.blocks.some((block) => block.id === activeBlockId)) activeBlockId = project.blocks[0]?.id ?? "";
  saveSoon();
  render();
}

function redo() {
  const next = redoStack.shift();
  if (!next) return;
  undoStack = [...undoStack.slice(-49), structuredClone(project)];
  project = next;
  saveSoon();
  render();
}

function updateActiveBlock(update: (block: ContentBlock, draft: ChapterProject) => void, label = "修改校本稿", renderAfter = true) {
  commit(label, (draft) => {
    const block = draft.blocks.find((item) => item.id === activeBlockId);
    if (block) update(block, draft);
  }, renderAfter);
}

function pendingSyncCount() {
  if (project.pendingBatch) return project.pendingBatch.items.filter((item) => item.status === "pending" || item.status === "failed").length;
  let count = 0;
  for (const hqBlock of hqDraft.blocks) {
    const local = project.blocks.find((block) => block.id === hqBlock.id);
    const id = `${hqBlock.id}@${hqBlock.updatedAtVersion}`;
    if (hqBlock.updatedAtVersion > (local?.hqVersion ?? 0) && !project.appliedSyncIds.includes(id)) count += 1;
  }
  if (hqDraft.version > project.glossaryVersion && !project.appliedSyncIds.includes(`glossary@${hqDraft.version}`)) count += 1;
  return count;
}

function buildSyncBatch(): SyncBatch {
  const items: SyncItem[] = [];
  for (const hqBlock of hqDraft.blocks) {
    const local = project.blocks.find((block) => block.id === hqBlock.id);
    const id = `${hqBlock.id}@${hqBlock.updatedAtVersion}`;
    if (hqBlock.updatedAtVersion <= (local?.hqVersion ?? 0)) continue;
    if (project.appliedSyncIds.includes(id)) continue; // 同一批重发不重复接
    items.push({ id, kind: "block", blockId: hqBlock.id, hqVersion: hqBlock.updatedAtVersion, payload: structuredClone(hqBlock), status: "pending" });
  }
  const glossaryId = `glossary@${hqDraft.version}`;
  if (hqDraft.version > project.glossaryVersion && !project.appliedSyncIds.includes(glossaryId)) {
    items.push({ id: glossaryId, kind: "glossary", hqVersion: hqDraft.version, glossary: structuredClone(hqDraft.glossary), status: "pending" });
  }
  return { id: uid("batch"), createdAt: new Date().toISOString(), toVersion: hqDraft.version, items };
}

function memberBlockFromHq(hqBlock: HqBlock): ContentBlock {
  return {
    id: hqBlock.id,
    type: hqBlock.type,
    text: hqBlock.text,
    accessibleText: hqBlock.accessibleText,
    headingLevel: hqBlock.headingLevel,
    imageSrc: hqBlock.imageSrc,
    imageAlt: hqBlock.imageAlt,
    linkHref: hqBlock.linkHref,
    changeReason: hqBlock.changeReason,
    reviewStatus: "pending",
    comments: [],
    origin: "hq",
    hqVersion: hqBlock.updatedAtVersion,
    memberEdited: false,
    conflict: null,
  };
}

function applySyncItem(draft: ChapterProject, item: SyncItem) {
  if (draft.appliedSyncIds.includes(item.id)) {
    item.status = "applied";
    item.note = "该段落已接过，本次重发自动跳过（不重复接入）。";
    return;
  }
  if (item.kind === "glossary") {
    draft.glossary = structuredClone(item.glossary ?? []);
    draft.glossaryVersion = item.hqVersion;
    item.status = "applied";
    item.note = "统一术语表已更新。";
    draft.appliedSyncIds.push(item.id);
    return;
  }
  const hqBlock = item.payload;
  if (!hqBlock) return;
  const existing = draft.blocks.find((block) => block.id === item.blockId);
  if (!existing) {
    const fresh = memberBlockFromHq(hqBlock);
    const hqIndex = hqDraft.blocks.findIndex((block) => block.id === hqBlock.id);
    let insertAt = draft.blocks.length;
    for (let index = hqIndex - 1; index >= 0; index -= 1) {
      const position = draft.blocks.findIndex((block) => block.id === hqDraft.blocks[index].id);
      if (position >= 0) {
        insertAt = position + 1;
        break;
      }
    }
    draft.blocks.splice(insertAt, 0, fresh);
    item.status = "applied";
    item.note = "通用稿新增段落，已接入校本稿。";
  } else if (!existing.memberEdited) {
    existing.text = hqBlock.text;
    existing.accessibleText = hqBlock.accessibleText;
    existing.headingLevel = hqBlock.headingLevel;
    existing.imageSrc = hqBlock.imageSrc;
    existing.imageAlt = hqBlock.imageAlt;
    existing.linkHref = hqBlock.linkHref;
    existing.changeReason = hqBlock.changeReason;
    existing.origin = "hq";
    existing.hqVersion = item.hqVersion;
    existing.reviewStatus = "pending";
    existing.conflict = null;
    item.status = "applied";
    item.note = "成员校未改动该段，已更新为通用稿。";
  } else {
    // 成员校动过的段落不能被盖掉：保留两版，等老师选定。
    existing.conflict = {
      hqText: hqBlock.accessibleText,
      hqReason: hqBlock.changeReason,
      hqVersion: item.hqVersion,
      memberText: existing.accessibleText,
      memberReason: existing.changeReason,
    };
    existing.hqVersion = item.hqVersion;
    item.status = "conflict";
    item.note = "成员校已改写本段，未覆盖，保留两版待老师选定。";
  }
  draft.appliedSyncIds.push(item.id);
}

async function runSync() {
  if (syncRunning) return;
  if (role !== "member") {
    toast("总校身份无需同步", "总校直接维护通用稿；请切换到成员校身份接收更新。");
    return;
  }
  if (!project.pendingBatch) {
    const batch = buildSyncBatch();
    if (!batch.items.length) {
      toast("已是最新", `校本稿已接到总校通用稿 v${hqDraft.version}，没有待接入的段落。`);
      return;
    }
    commit(`接收总校通用稿 v${batch.toVersion}（${batch.items.length} 项）`, (draft) => {
      draft.pendingBatch = batch;
    });
  }
  syncRunning = true;
  const itemIds = project.pendingBatch?.items.map((item) => item.id) ?? [];
  for (const id of itemIds) {
    const current = project.pendingBatch?.items.find((item) => item.id === id);
    if (!current) break;
    if (current.status === "applied" || current.status === "conflict") continue; // 已经接上的不受影响
    if (simulateFailure || !navigator.onLine) {
      commit("同步中断", (draft) => {
        const item = draft.pendingBatch?.items.find((entry) => entry.id === id);
        if (item) {
          item.status = "failed";
          item.note = simulateFailure ? "模拟网络中断，待逐段重试。" : "当前离线，待逐段重试。";
        }
      });
      syncRunning = false;
      toast("同步中断", "已接上的段落不受影响；恢复后可按成员校这边逐段重试，重发不会重复接入。", "warning");
      return;
    }
    commit("接入总校段落", (draft) => {
      const item = draft.pendingBatch?.items.find((entry) => entry.id === id);
      if (item) applySyncItem(draft, item);
    });
    await sleep(160);
  }
  const finished = project.pendingBatch;
  if (finished) {
    const conflicts = finished.items.filter((item) => item.status === "conflict").length;
    commit("同步完成", (draft) => {
      draft.hqBaseVersion = finished.toVersion;
      draft.pendingBatch = null;
    });
    toast(
      "同步完成",
      conflicts ? `已接到通用稿 v${finished.toVersion}；${conflicts} 段成员校改过的内容保留两版，等老师选定。` : `已接到通用稿 v${finished.toVersion}。`,
      conflicts ? "warning" : "success",
    );
  }
  syncRunning = false;
}

function render() {
  const list = issues();
  const active = activeBlock();
  const activeIssues = list.filter((issue) => issue.blockId === active.id);
  const approved = project.blocks.filter((block) => block.reviewStatus === "approved").length;
  const version = project.versions.find((item) => item.id === selectedVersionId) ?? project.versions[0];
  const pendingCount = pendingSyncCount();
  const remainingCount = project.pendingBatch?.items.filter((item) => item.status === "pending" || item.status === "failed").length ?? 0;

  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand"><span>无障碍</span><b>1009</b></div>
        <div class="title-block">
          <input id="project-title" aria-label="教材名称" value="${escapeHtml(project.title)}" />
          <div class="meta"><span>${escapeHtml(project.subject)}</span><span>${escapeHtml(project.grade)}</span><span>通用稿 v${hqDraft.version} · 校本已接 v${project.hqBaseVersion}</span><span class="save-dot">本地自动保存</span></div>
        </div>
        <div class="role-switch" role="group" aria-label="身份切换">
          <button class="${role === "member" ? "active" : ""}" data-action="role-member">成员校</button>
          <button class="${role === "hq" ? "active" : ""}" data-action="role-hq">总校</button>
        </div>
        <div class="top-actions">
          <span class="online-pill">${navigator.onLine ? "在线" : "离线可编辑"}</span>
          <sl-button size="small" variant="default" ${undoStack.length ? "" : "disabled"} data-action="undo">撤销</sl-button>
          <sl-button size="small" variant="default" ${redoStack.length ? "" : "disabled"} data-action="redo">重做</sl-button>
          ${role === "member" ? `<sl-button size="small" variant="${pendingCount ? "primary" : "default"}" data-action="sync" ${syncRunning ? "disabled" : ""}>${project.pendingBatch ? `继续同步 (${remainingCount})` : pendingCount ? `同步总校更新 (${pendingCount})` : "同步总校更新"}</sl-button>` : ""}
          <sl-button size="small" variant="default" data-action="open-hq">${role === "hq" ? "通用稿管理" : "查看通用稿"}</sl-button>
          <sl-button size="small" variant="default" data-action="glossary">术语表</sl-button>
          <sl-button size="small" variant="primary" data-action="save-version">保存版本</sl-button>
          <sl-button size="small" variant="success" data-action="export">导出无障碍 HTML</sl-button>
        </div>
      </header>

      <div class="progress-strip">
        <div class="progress-copy"><b>${approved}/${project.blocks.length}</b><span>内容块已审核通过</span></div>
        <div class="progress-bar"><i style="width:${Math.round((approved / Math.max(1, project.blocks.length)) * 100)}%"></i></div>
        <div class="issue-counts">
          <span class="error">${list.filter((issue) => issue.severity === "error").length} 必须修复</span>
          <span class="warning">${list.filter((issue) => issue.severity === "warning").length} 建议优化</span>
          <span class="info">${list.filter((issue) => issue.severity === "info").length} 术语提醒</span>
        </div>
      </div>

      <div class="workspace">
        <aside class="outline-panel">
          <div class="panel-title"><span>章节结构 · 校本稿</span><sl-badge>${project.blocks.length} 块</sl-badge></div>
          <div class="block-list">
            ${project.blocks.map((block, index) => {
              const blockIssues = list.filter((issue) => issue.blockId === block.id);
              return `<button class="block-item ${block.id === active.id ? "active" : ""}" data-action="select-block" data-block-id="${block.id}">
                <span class="block-order">${index + 1}</span>
                <span class="block-copy"><b>${block.type === "heading" ? `H${block.headingLevel}` : blockRole(block)}</b><span>${escapeHtml(block.accessibleText || block.text || "（空）")}</span></span>
                <i class="status-${block.reviewStatus}" title="${statusLabel(block.reviewStatus)}"></i>
                ${block.conflict ? `<em class="flag flag-conflict">两版</em>` : block.memberEdited ? `<em class="flag flag-member">校本</em>` : ""}
                ${blockIssues.length ? `<em>${blockIssues.length}</em>` : ""}
              </button>`;
            }).join("")}
          </div>
          <input id="chapter-file" type="file" accept=".txt,.md,.markdown" hidden />
          <sl-button class="import-button" variant="default" data-action="import">导入章节文本</sl-button>
          <div class="keyboard-note"><b>键盘</b><span><kbd>J</kbd><kbd>K</kbd> 跳转问题</span><span><kbd>E</kbd> 自动改写</span><span><kbd>⌘ Z</kbd> 撤销</span><span><kbd>1</kbd><kbd>2</kbd> 预览模式</span></div>
        </aside>

        <main class="editor-panel">
          <div class="editor-head">
            <div><span class="eyebrow">当前内容块 · 校本稿</span><h1>${blockRole(active)}</h1></div>
            <div class="review-actions">
              <sl-badge variant="${active.memberEdited ? "primary" : "neutral"}">${active.memberEdited ? "校本稿改写" : "通用稿原文"}</sl-badge>
              <sl-button size="small" variant="${active.reviewStatus === "approved" ? "success" : "default"}" data-action="approve">${active.reviewStatus === "approved" ? "✓ 已通过" : "审核通过"}</sl-button>
              <sl-button size="small" variant="${active.reviewStatus === "needs-work" ? "danger" : "default"}" data-action="needs-work">需修改</sl-button>
            </div>
          </div>

          ${activeIssues.length ? `<div class="active-issues">${activeIssues.map((issue) => `
            <div class="issue-card ${issue.severity}">
              <div><sl-badge variant="${issue.severity === "error" ? "danger" : issue.severity === "warning" ? "warning" : "primary"}">${severityLabel(issue.severity)}</sl-badge><strong>${escapeHtml(issue.title)}</strong></div>
              <p>${escapeHtml(issue.detail)}</p><small>${escapeHtml(issue.suggestion)}</small>
            </div>`).join("")}</div>` : `<div class="issue-clear">✓ 当前内容块没有新的无障碍问题</div>`}

          ${active.conflict ? renderConflictCard(active) : ""}

          <section class="edit-card source-card">
            <div class="section-heading"><div><span class="eyebrow">原教材</span><h2>${active.type === "image" ? "图片信息" : active.type === "link" ? "链接信息" : "原文"}</h2></div><sl-badge variant="neutral">${active.type}</sl-badge></div>
            ${renderSourceEditor(active)}
          </section>

          <section class="edit-card rewrite-card">
            <div class="section-heading">
              <div><span class="eyebrow">Accessible rewrite</span><h2>校本稿 · 无障碍表达</h2></div>
              <sl-button size="small" variant="primary" outline data-action="generate">生成易读版本</sl-button>
            </div>
            ${renderAccessibleEditor(active)}
            <label class="field-label" for="reason-${active.id}">改写原因（校本稿每处改写必须记录）</label>
            <sl-textarea id="reason-${active.id}" data-field="reason" rows="2" value="${escapeHtml(active.changeReason)}" placeholder="例如：拆分长句、替换专业表达、补充链接目的"></sl-textarea>
          </section>

          <section class="edit-card">
            <div class="section-heading"><div><span class="eyebrow">Review discussion</span><h2>批注与回复</h2></div><sl-badge variant="warning">${active.comments.length} 条</sl-badge></div>
            <div class="comment-compose"><sl-textarea id="new-comment" rows="2" placeholder="记录改写依据、审核意见或术语讨论…"></sl-textarea><sl-button size="small" variant="primary" data-action="add-comment">添加批注</sl-button></div>
            <div class="comment-list">
              ${active.comments.length ? active.comments.map((comment) => `
                <article class="comment ${comment.resolved ? "resolved" : ""}">
                  <header><b>${escapeHtml(comment.author)}</b><time>${new Date(comment.createdAt).toLocaleString()}</time></header>
                  <p>${escapeHtml(comment.body)}</p>
                  ${comment.replies.map((reply) => `<div class="reply"><b>${escapeHtml(reply.author)}</b><span>${escapeHtml(reply.body)}</span></div>`).join("")}
                  <div class="reply-row"><sl-input size="small" id="reply-${comment.id}" placeholder="回复…"></sl-input><sl-button size="small" data-action="reply" data-comment-id="${comment.id}">回复</sl-button><sl-button size="small" variant="text" data-action="resolve-comment" data-comment-id="${comment.id}">${comment.resolved ? "重新打开" : "解决"}</sl-button></div>
                </article>`).join("") : `<div class="empty-note">当前内容块还没有批注。</div>`}
            </div>
          </section>
        </main>

        <aside class="review-panel">
          ${role === "member" ? renderSyncCard(pendingCount, remainingCount) : ""}

          <section class="preview-card">
            <div class="section-heading"><div><span class="eyebrow">Reader preview</span><h2>阅读预览</h2></div><div class="mode-switch"><button class="${previewMode === "normal" ? "active" : ""}" data-action="preview-normal">普通</button><button class="${previewMode === "assisted" ? "active" : ""}" data-action="preview-assisted">辅助</button></div></div>
            <div class="reader-preview mode-${previewMode}">${renderPreview()}</div>
          </section>

          <section class="order-card">
            <div class="section-heading"><div><span class="eyebrow">Screen reader order</span><h2>读屏阅读顺序</h2></div><sl-badge>从上到下</sl-badge></div>
            <ol class="reading-order">
              ${project.blocks.map((block, index) => `<li class="${block.id === active.id ? "active" : ""}"><b>${index + 1}</b><div><strong>${blockRole(block)}</strong><span>${escapeHtml(block.accessibleText || block.text || "（无内容）")}</span></div></li>`).join("")}
            </ol>
          </section>

          <section class="issues-panel">
            <div class="section-heading"><div><span class="eyebrow">All checks</span><h2>全章问题</h2></div><sl-button size="small" variant="default" outline data-action="approve-all">全部通过</sl-button></div>
            <div class="issue-list">
              ${list.length ? list.map((issue) => `<button class="${issue.id === activeIssueId ? "active" : ""} ${issue.severity}" data-action="jump-issue" data-issue-id="${issue.id}" data-block-id="${issue.blockId}"><span>${severityLabel(issue.severity)}</span><b>${escapeHtml(issue.title)}</b><small>段 ${project.blocks.findIndex((block) => block.id === issue.blockId) + 1} · ${escapeHtml(issue.suggestion)}</small></button>`).join("") : `<div class="issue-clear">✓ 全章检查通过</div>`}
            </div>
          </section>

          <section class="version-card">
            <div class="section-heading"><div><span class="eyebrow">Version compare</span><h2>版本比较</h2></div><sl-badge>${project.versions.length} 版</sl-badge></div>
            ${project.versions.length ? `
              <sl-select id="version-select" size="small" value="${version?.id ?? ""}">${project.versions.map((item) => `<sl-option value="${item.id}">${escapeHtml(item.label)} · ${new Date(item.createdAt).toLocaleTimeString()}</sl-option>`).join("")}</sl-select>
              <div class="version-diff">${version ? renderVersionDiff(version, active) : ""}</div>
            ` : `<div class="empty-note">保存版本后，可比较改写前后的无障碍文本。</div>`}
          </section>
        </aside>
      </div>

      <footer class="statusbar"><span>最近操作：${escapeHtml(document.documentElement.dataset.lastAction || migrationNote || "示例章节已载入")}</span><span>身份：${role === "hq" ? "总校" : "成员校"} · ${project.blocks.length} 个内容块 · ${list.length} 个待处理问题</span></footer>
    </div>

    <sl-dialog label="全书术语表（总校统一维护）" ${showGlossary ? "open" : ""} data-dialog="glossary">
      ${role === "member" ? `<div class="guard-note">🔒 术语由总校统一维护，同步总校更新后自动刷新。成员校的直接修改会被拦截。</div>` : ""}
      <div class="glossary-editor">
        ${project.glossary.map((term) => `<div class="term-row"><div><b>${escapeHtml(term.source)}</b><sl-input size="small" value="${escapeHtml(term.preferred)}" data-term-id="${term.id}" ${role === "member" ? "disabled" : ""}></sl-input><small>${escapeHtml(term.note)}</small></div><sl-button size="small" variant="danger" outline data-action="remove-term" data-term-id="${term.id}">删除</sl-button></div>`).join("")}
      </div>
      <div class="term-add"><sl-input id="new-term-source" placeholder="原文术语" ${role === "member" ? "disabled" : ""}></sl-input><sl-input id="new-term-preferred" placeholder="统一表达" ${role === "member" ? "disabled" : ""}></sl-input><sl-button variant="primary" data-action="add-term">添加术语</sl-button></div>
      <sl-button slot="footer" variant="primary" data-action="close-glossary">完成</sl-button>
    </sl-dialog>

    <sl-dialog label="总校通用稿 · 统一术语" ${showHq ? "open" : ""} data-dialog="hq" class="hq-dialog">
      ${role === "hq"
        ? `<div class="guard-note ok">总校身份：编辑通用稿与统一术语后点击“发布新版本”，成员校同步接入；成员校改过的段落不会被覆盖，会保留两版等老师选定。</div>`
        : `<div class="guard-note">🔒 当前为成员校身份：通用稿只读。越权直接修改会被系统拦截，请在校本稿上改写。</div>`}
      <h3 class="hq-sub">通用稿段落（当前 v${hqDraft.version}）</h3>
      <div class="hq-blocks">
        ${(hqWorking ?? hqDraft).blocks.map((hqBlock) => `
          <div class="hq-block">
            <div class="hq-block-head"><b>${hqBlockRole(hqBlock)}</b><span>原文：${escapeHtml(hqBlock.text)}</span><sl-badge variant="neutral">v${hqBlock.updatedAtVersion}</sl-badge></div>
            <sl-textarea rows="2" label="通用稿无障碍表达" value="${escapeHtml(hqBlock.accessibleText)}" data-hq-block="${hqBlock.id}" data-hq-field="accessible" ${role === "hq" ? "" : "disabled"}></sl-textarea>
            <sl-input label="总校改写说明" value="${escapeHtml(hqBlock.changeReason)}" data-hq-block="${hqBlock.id}" data-hq-field="reason" ${role === "hq" ? "" : "disabled"}></sl-input>
          </div>`).join("")}
      </div>
      <h3 class="hq-sub">统一术语（总校维护）</h3>
      <div class="hq-terms">
        ${(hqWorking ?? hqDraft).glossary.map((term) => `<div class="term-row"><div><b>${escapeHtml(term.source)}</b><sl-input size="small" value="${escapeHtml(term.preferred)}" data-hq-term="${term.id}" ${role === "hq" ? "" : "disabled"}></sl-input><small>${escapeHtml(term.note)}</small></div>${role === "hq" ? `<sl-button size="small" variant="danger" outline data-action="hq-remove-term" data-term-id="${term.id}">删除</sl-button>` : ""}</div>`).join("")}
      </div>
      ${role === "hq" ? `<div class="term-add"><sl-input id="hq-term-source" placeholder="原文术语"></sl-input><sl-input id="hq-term-preferred" placeholder="统一表达"></sl-input><sl-button variant="primary" data-action="hq-add-term">添加术语</sl-button></div>` : ""}
      <div slot="footer" class="hq-footer">
        <sl-button variant="default" data-action="close-hq">关闭</sl-button>
        <sl-button variant="primary" data-action="publish-hq">发布新版本（当前 v${hqDraft.version}）</sl-button>
      </div>
    </sl-dialog>`;

  wireLiveFields();
}

function renderConflictCard(block: ContentBlock) {
  const conflict = block.conflict;
  if (!conflict) return "";
  return `<section class="edit-card conflict-card">
    <div class="section-heading">
      <div><span class="eyebrow">Sync conflict</span><h2>两版待老师选定</h2></div>
      <sl-badge variant="warning">总校 v${conflict.hqVersion} × 校本稿</sl-badge>
    </div>
    <p class="conflict-note">成员校已改写本段，同步时没有覆盖。请比较两版后选定，另一版会保留在版本记录中。</p>
    <div class="conflict-grid">
      <div class="conflict-col member">
        <h3>校本稿（当前使用）</h3>
        <p>${escapeHtml(conflict.memberText)}</p>
        <small>改写原因：${escapeHtml(conflict.memberReason || "未填写")}</small>
        <sl-button size="small" variant="success" outline data-action="keep-member">保留校本稿</sl-button>
      </div>
      <div class="conflict-col hq">
        <h3>总校通用稿 v${conflict.hqVersion}</h3>
        <p>${escapeHtml(conflict.hqText)}</p>
        <small>总校说明：${escapeHtml(conflict.hqReason || "未填写")}</small>
        <sl-button size="small" variant="primary" outline data-action="take-hq">采用总校稿</sl-button>
      </div>
    </div>
  </section>`;
}

function renderSyncCard(pendingCount: number, remainingCount: number) {
  const batch = project.pendingBatch;
  return `<section class="sync-card">
    <div class="section-heading">
      <div><span class="eyebrow">HQ sync</span><h2>总校同步</h2></div>
      <sl-badge variant="${batch ? "warning" : pendingCount ? "primary" : "neutral"}">${batch ? "同步中断续传" : pendingCount ? `${pendingCount} 项待接` : "已最新"}</sl-badge>
    </div>
    <p class="sync-meta">总校通用稿 <b>v${hqDraft.version}</b> · 校本稿已接至 <b>v${project.hqBaseVersion}</b></p>
    ${batch ? `<div class="batch-list">${batch.items.map((item) => renderSyncItem(item)).join("")}</div>` : ""}
    <div class="sync-actions">
      <sl-button size="small" variant="primary" data-action="sync" ${syncRunning ? "disabled" : ""}>${batch ? `逐段重试（剩余 ${remainingCount} 项）` : "接收总校更新"}</sl-button>
      <label class="sim-fail"><input type="checkbox" id="sim-fail" ${simulateFailure ? "checked" : ""} /> 模拟网络中断</label>
    </div>
    <p class="sync-hint">成员校改过的段落不会被覆盖，会保留两版等老师选定；同步中断后已接上的段落不受影响，同一批重发不重复接入。</p>
  </section>`;
}

function renderSyncItem(item: SyncItem) {
  const statusMap: Record<SyncItem["status"], string> = { pending: "等待接入", applied: "已接入", conflict: "两版待选", failed: "失败待重试" };
  let label = "统一术语表";
  if (item.kind === "block") {
    const local = project.blocks.find((block) => block.id === item.blockId);
    const text = local?.accessibleText || local?.text || item.payload?.accessibleText || item.payload?.text || "";
    label = `段落「${text.slice(0, 14)}${text.length > 14 ? "…" : ""}」`;
  }
  return `<div class="batch-item ${item.status}"><b>${escapeHtml(label)}</b><span class="st">${statusMap[item.status]}</span>${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}</div>`;
}

function renderSourceEditor(block: ContentBlock) {
  if (block.type === "image") {
    return `<div class="image-source"><img src="${escapeHtml(block.imageSrc ?? "")}" alt="" /><div><b>图注</b><p>${escapeHtml(block.text)}</p><b>现有替代文本</b><p>${escapeHtml(block.imageAlt || "（空）")}</p></div></div>
      <sl-input id="source-${block.id}" data-field="source" label="图注" value="${escapeHtml(block.text)}"></sl-input>
      <sl-input id="image-alt-${block.id}" data-field="image-alt" label="替代文本" value="${escapeHtml(block.imageAlt ?? "")}" help-text="描述图片传达的信息，不写“图片”二字。"></sl-input>`;
  }
  if (block.type === "link") {
    return `<sl-input id="source-${block.id}" data-field="source" label="原链接文案" value="${escapeHtml(block.text)}"></sl-input><sl-input id="link-href-${block.id}" data-field="link-href" label="链接地址" value="${escapeHtml(block.linkHref ?? "")}"></sl-input>`;
  }
  if (block.type === "heading") {
    return `<div class="heading-edit"><sl-select id="heading-level-${block.id}" data-field="heading-level" label="标题层级" value="${String(block.headingLevel ?? 2)}"><sl-option value="1">H1</sl-option><sl-option value="2">H2</sl-option><sl-option value="3">H3</sl-option><sl-option value="4">H4</sl-option></sl-select><sl-input id="source-${block.id}" data-field="source" label="标题文本" value="${escapeHtml(block.text)}"></sl-input></div>`;
  }
  return `<sl-textarea id="source-${block.id}" data-field="source" rows="4" value="${escapeHtml(block.text)}"></sl-textarea>`;
}

function renderAccessibleEditor(block: ContentBlock) {
  if (block.type === "image") {
    return `<sl-textarea id="accessible-${block.id}" data-field="accessible" rows="3" label="图片替代文本" value="${escapeHtml(block.imageAlt || block.accessibleText)}" help-text="读屏软件会朗读这里的内容。"></sl-textarea>`;
  }
  return `<sl-textarea id="accessible-${block.id}" data-field="accessible" rows="6" value="${escapeHtml(block.accessibleText)}"></sl-textarea>`;
}

function renderPreview() {
  return project.blocks.map((block, index) => {
    const content = escapeHtml(block.accessibleText || block.text);
    if (block.type === "heading") {
      const tag = `h${Math.min(6, Math.max(1, block.headingLevel ?? 2))}`;
      return `<${tag} class="${block.id === activeBlockId ? "active-block" : ""}"><span class="order-marker">${index + 1}</span>${content}</${tag}>`;
    }
    if (block.type === "image") {
      return `<figure class="${block.id === activeBlockId ? "active-block" : ""}"><img src="${escapeHtml(block.imageSrc ?? "")}" alt="${escapeHtml(block.imageAlt || block.accessibleText)}"><figcaption><span class="order-marker">${index + 1}</span>${escapeHtml(block.text)}</figcaption></figure>`;
    }
    if (block.type === "link") {
      return `<p class="${block.id === activeBlockId ? "active-block" : ""}"><span class="order-marker">${index + 1}</span><a href="${escapeHtml(block.linkHref ?? "#")}" onclick="return false">${content}</a><span class="link-role">链接</span></p>`;
    }
    return `<p class="${block.id === activeBlockId ? "active-block" : ""}"><span class="order-marker">${index + 1}</span>${content}</p>`;
  }).join("");
}

function renderVersionDiff(version: VersionSnapshot, current: ContentBlock) {
  const oldBlock = version.blocks.find((block) => block.id === current.id);
  if (!oldBlock) return `<div class="empty-note">当前内容块不在该版本中。</div>`;
  return `<div class="diff-column"><span>旧版</span><p>${escapeHtml(oldBlock.accessibleText || oldBlock.text)}</p></div><div class="diff-column current"><span>当前</span><p>${escapeHtml(current.accessibleText || current.text)}</p></div>`;
}

function wireLiveFields() {
  app.querySelectorAll<HTMLElement>("sl-input[data-field], sl-textarea[data-field], sl-select[data-field]").forEach((element) => {
    element.addEventListener("sl-input", () => {
      const value = (element as HTMLElement & { value: string }).value;
      updateActiveBlock((block) => {
        const field = element.dataset.field;
        if (field === "source") block.text = value;
        if (field === "accessible") {
          block.accessibleText = value;
          if (block.type === "image") block.imageAlt = value;
        }
        if (field === "image-alt") {
          block.imageAlt = value;
          block.accessibleText = value;
        }
        if (field === "link-href") block.linkHref = value;
        if (field === "reason") block.changeReason = value;
        block.memberEdited = true;
        block.origin = "member";
        block.reviewStatus = "pending";
      }, "编辑校本稿", false);
    });
    element.addEventListener("sl-change", () => render());
  });
}

app.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-action]");
  if (!target) return;
  const action = target.dataset.action;
  if (action === "undo") undo();
  if (action === "redo") redo();
  if (action === "role-member" || action === "role-hq") {
    role = action === "role-hq" ? "hq" : "member";
    localStorage.setItem(ROLE_STORAGE_KEY, role);
    document.documentElement.dataset.lastAction = role === "hq" ? "已切换为总校身份" : "已切换为成员校身份";
    render();
  }
  if (action === "select-block") {
    activeBlockId = target.dataset.blockId ?? activeBlockId;
    activeIssueId = "";
    render();
  }
  if (action === "jump-issue") {
    activeIssueId = target.dataset.issueId ?? "";
    activeBlockId = target.dataset.blockId ?? activeBlockId;
    render();
    requestAnimationFrame(() => app.querySelector<HTMLElement>(".editor-panel")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  if (action === "generate") {
    const block = activeBlock();
    const suggestion = block.type === "link"
      ? "打开水循环互动实验"
      : simplifyText(block.type === "image" ? block.imageAlt || block.text : block.text, project.glossary);
    updateActiveBlock((current) => {
      if (current.type === "image") current.imageAlt = suggestion;
      current.accessibleText = suggestion;
      current.changeReason ||= "拆分长句并替换复杂表达，保留原有知识信息。";
      current.memberEdited = true;
      current.origin = "member";
      current.reviewStatus = "pending";
    }, "生成易读版本");
  }
  if (action === "approve") updateActiveBlock((block) => { block.reviewStatus = "approved"; }, "审核通过");
  if (action === "needs-work") updateActiveBlock((block) => { block.reviewStatus = "needs-work"; }, "标记需修改");
  if (action === "keep-member") {
    updateActiveBlock((block) => {
      if (!block.conflict) return;
      block.conflict = null;
      block.origin = "member";
      block.memberEdited = true;
    }, "保留校本稿版本");
    toast("已保留校本稿", "该段继续使用校本稿改写，总校版本保留在同步记录中。");
  }
  if (action === "take-hq") {
    updateActiveBlock((block) => {
      const conflict = block.conflict;
      if (!conflict) return;
      block.accessibleText = conflict.hqText;
      if (block.type === "image") block.imageAlt = conflict.hqText;
      block.changeReason = conflict.hqReason;
      block.origin = "hq";
      block.memberEdited = false;
      block.conflict = null;
      block.reviewStatus = "pending";
    }, "采用总校通用稿");
    toast("已采用总校稿", "该段已更新为总校通用稿表达。");
  }
  if (action === "sync") void runSync();
  if (action === "open-hq") {
    hqWorking = structuredClone(hqDraft);
    showHq = true;
    render();
  }
  if (action === "close-hq") {
    showHq = false;
    hqWorking = null;
    render();
  }
  if (action === "publish-hq") {
    if (!guardHqAction()) return;
    const source = hqWorking ?? hqDraft;
    const next = structuredClone(source);
    next.version = hqDraft.version + 1;
    let changedBlocks = 0;
    for (const block of next.blocks) {
      if (block.type === "image") block.imageAlt = block.accessibleText;
      const before = hqDraft.blocks.find((item) => item.id === block.id);
      if (!before || before.accessibleText !== block.accessibleText || before.text !== block.text || before.changeReason !== block.changeReason) {
        block.updatedAtVersion = next.version;
        changedBlocks += 1;
      }
    }
    const glossaryChanged = JSON.stringify(next.glossary) !== JSON.stringify(hqDraft.glossary);
    if (!changedBlocks && !glossaryChanged) {
      toast("没有改动", "通用稿与统一术语同上一版一致，未发布新版本。");
      return;
    }
    next.updatedAt = new Date().toISOString();
    hqDraft = next;
    hqWorking = structuredClone(next);
    saveHq();
    document.documentElement.dataset.lastAction = `已发布通用稿 v${next.version}`;
    render();
    toast("已发布通用稿", `通用稿 v${next.version} 已发布：${changedBlocks} 段更新${glossaryChanged ? "、统一术语已更新" : ""}。成员校可同步接入，成员校改过的段落会保留两版。`, "success");
  }
  if (action === "hq-add-term") {
    if (!guardHqAction()) return;
    const source = app.querySelector<HTMLElement & { value: string }>("#hq-term-source");
    const preferred = app.querySelector<HTMLElement & { value: string }>("#hq-term-preferred");
    if (source?.value.trim() && preferred?.value.trim() && hqWorking) {
      hqWorking.glossary.push({ id: uid("term"), source: source.value.trim(), preferred: preferred.value.trim(), note: "总校新增术语" });
      render();
    }
  }
  if (action === "hq-remove-term") {
    if (!guardHqAction()) return;
    const termId = target.dataset.termId;
    if (hqWorking) {
      hqWorking.glossary = hqWorking.glossary.filter((term) => term.id !== termId);
      render();
    }
  }
  if (action === "add-comment") {
    const input = app.querySelector<HTMLElement & { value: string }>("#new-comment");
    const body = input?.value.trim();
    if (body) updateActiveBlock((block) => {
      block.comments.unshift({ id: uid("comment"), author: role === "hq" ? "总校编辑" : "成员校编辑", body, createdAt: new Date().toISOString(), resolved: false, replies: [] });
    }, "添加批注");
  }
  if (action === "reply") {
    const commentId = target.dataset.commentId ?? "";
    const input = app.querySelector<HTMLElement & { value: string }>(`#reply-${CSS.escape(commentId)}`);
    const body = input?.value.trim();
    if (body) updateActiveBlock((block) => {
      block.comments.find((comment) => comment.id === commentId)?.replies.push({ id: uid("reply"), author: role === "hq" ? "总校编辑" : "成员校编辑", body, createdAt: new Date().toISOString() });
    }, "回复批注");
  }
  if (action === "resolve-comment") {
    const commentId = target.dataset.commentId ?? "";
    updateActiveBlock((block) => {
      const comment = block.comments.find((item) => item.id === commentId);
      if (comment) comment.resolved = !comment.resolved;
    }, "更新批注状态");
  }
  if (action === "preview-normal") { previewMode = "normal"; render(); }
  if (action === "preview-assisted") { previewMode = "assisted"; render(); }
  if (action === "glossary") {
    if (role === "hq") {
      hqWorking = structuredClone(hqDraft);
      showHq = true;
    } else {
      showGlossary = true;
    }
    render();
  }
  if (action === "close-glossary") { showGlossary = false; render(); }
  if (action === "add-term") {
    if (!guardHqAction()) return;
    const source = app.querySelector<HTMLElement & { value: string }>("#new-term-source");
    const preferred = app.querySelector<HTMLElement & { value: string }>("#new-term-preferred");
    if (source?.value.trim() && preferred?.value.trim()) {
      commit("添加术语", (draft) => { draft.glossary.push({ id: uid("term"), source: source.value.trim(), preferred: preferred.value.trim(), note: "编辑新增术语" }); });
    }
  }
  if (action === "remove-term") {
    if (!guardHqAction()) return;
    const termId = target.dataset.termId;
    commit("删除术语", (draft) => { draft.glossary = draft.glossary.filter((term) => term.id !== termId); });
  }
  if (action === "save-version") {
    const versionId = uid("version");
    commit("保存版本快照", (draft) => {
      draft.versions.unshift({ id: versionId, label: `版本 ${draft.versions.length + 1}`, createdAt: new Date().toISOString(), blocks: structuredClone(draft.blocks), glossary: structuredClone(draft.glossary) });
      draft.versions = draft.versions.slice(0, 10);
    });
    selectedVersionId = versionId;
    render();
  }
  if (action === "approve-all") {
    commit("全部审核通过", (draft) => { draft.blocks.forEach((block) => { block.reviewStatus = "approved"; }); });
  }
  if (action === "export") {
    download(`${project.title}-无障碍版.html`, exportHtml(project, hqDraft));
    document.documentElement.dataset.lastAction = "已导出无障碍 HTML（含总校×校本结论对照）";
    render();
  }
  if (action === "import") app.querySelector<HTMLInputElement>("#chapter-file")?.click();
});

app.addEventListener("sl-input", (event) => {
  const element = event.target as HTMLElement & { value: string };
  if (element.dataset?.hqBlock && hqWorking) {
    if (role !== "hq") return;
    const block = hqWorking.blocks.find((item) => item.id === element.dataset.hqBlock);
    if (!block) return;
    if (element.dataset.hqField === "accessible") block.accessibleText = element.value;
    if (element.dataset.hqField === "reason") block.changeReason = element.value;
  }
  if (element.dataset?.hqTerm && hqWorking) {
    if (role !== "hq") return;
    const term = hqWorking.glossary.find((item) => item.id === element.dataset.hqTerm);
    if (term) term.preferred = element.value;
  }
});

app.addEventListener("sl-change", (event) => {
  const element = event.target as HTMLElement;
  if (element.id === "chapter-file") return;
  if (element.id.startsWith("heading-level-")) {
    const level = Number((element as HTMLElement & { value: string }).value);
    updateActiveBlock((block) => {
      block.headingLevel = level;
      block.memberEdited = true;
      block.origin = "member";
      block.reviewStatus = "pending";
    }, "修改标题层级");
  }
  if (element.id === "version-select") {
    selectedVersionId = (element as HTMLElement & { value: string }).value;
    render();
  }
  if (element.matches("[data-term-id]")) {
    if (!guardHqAction()) return;
    const termId = element.dataset.termId;
    const value = (element as HTMLElement & { value: string }).value;
    commit("修改术语表", (draft) => { const term = draft.glossary.find((item) => item.id === termId); if (term) term.preferred = value; });
  }
});

app.addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.id === "sim-fail") {
    simulateFailure = input.checked;
    document.documentElement.dataset.lastAction = simulateFailure ? "已开启模拟网络中断" : "已关闭模拟网络中断";
    render();
    return;
  }
  if (input.id !== "chapter-file" || !input.files?.[0]) return;
  void input.files[0].text().then((text) => {
    commit("导入章节文本", (draft) => {
      draft.blocks = parseImportedChapter(text);
      activeBlockId = draft.blocks[0]?.id ?? "";
      activeIssueId = "";
    });
  });
});

app.addEventListener("input", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.id === "project-title") {
    project.title = input.value;
    saveSoon();
  }
});

window.addEventListener("online", render);
window.addEventListener("offline", render);
window.addEventListener("keydown", (event) => {
  const target = event.target as HTMLElement;
  if (target.matches("input, textarea, sl-input, sl-textarea, [contenteditable='true']")) return;
  const command = event.metaKey || event.ctrlKey;
  if (command && event.key.toLowerCase() === "z") {
    event.preventDefault();
    event.shiftKey ? redo() : undo();
    return;
  }
  if (command && event.key.toLowerCase() === "s") {
    event.preventDefault();
    const versionId = uid("version");
    commit("键盘保存版本", (draft) => { draft.versions.unshift({ id: versionId, label: `版本 ${draft.versions.length + 1}`, createdAt: new Date().toISOString(), blocks: structuredClone(draft.blocks), glossary: structuredClone(draft.glossary) }); });
    selectedVersionId = versionId;
    return;
  }
  if (event.key.toLowerCase() === "j" || event.key.toLowerCase() === "k") {
    const list = issues();
    if (!list.length) return;
    const current = Math.max(0, list.findIndex((issue) => issue.id === activeIssueId));
    const next = (current + (event.key.toLowerCase() === "j" ? 1 : -1) + list.length) % list.length;
    activeIssueId = list[next].id;
    activeBlockId = list[next].blockId;
    render();
  }
  if (event.key.toLowerCase() === "e") {
    const button = app.querySelector<HTMLElement>('[data-action="generate"]');
    button?.click();
  }
  if (event.key === "1") { previewMode = "normal"; render(); }
  if (event.key === "2") { previewMode = "assisted"; render(); }
});

render();
if (migrationNote) {
  // 迁移结果立即落盘，避免旧数据在下次编辑前仍是旧结构。
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 2, project }));
  toast("旧数据已迁移", migrationNote, "primary");
}
