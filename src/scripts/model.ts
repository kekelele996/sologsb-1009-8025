export type BlockType = "heading" | "paragraph" | "image" | "link";
export type ReviewStatus = "pending" | "approved" | "needs-work";
export type Severity = "error" | "warning" | "info";

export interface CommentReply {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface CommentItem {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  resolved: boolean;
  replies: CommentReply[];
}

export interface ContentBlock {
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
}

export interface GlossaryTerm {
  id: string;
  source: string;
  preferred: string;
  note: string;
}

export interface VersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
  blocks: ContentBlock[];
  glossary: GlossaryTerm[];
}

export interface ChapterProject {
  id: string;
  title: string;
  subject: string;
  grade: string;
  blocks: ContentBlock[];
  glossary: GlossaryTerm[];
  versions: VersionSnapshot[];
  updatedAt: string;
}

export interface AccessibilityIssue {
  id: string;
  blockId: string;
  type: "heading" | "link" | "image" | "glossary" | "sentence";
  severity: Severity;
  title: string;
  detail: string;
  suggestion: string;
}

export const uid = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function createSeedProject(): ChapterProject {
  const blocks: ContentBlock[] = [
    {
      id: "block-h1",
      type: "heading",
      headingLevel: 1,
      text: "第三章 水循环与城市",
      accessibleText: "第三章 水循环与城市",
      changeReason: "",
      reviewStatus: "approved",
      comments: [],
    },
    {
      id: "block-p1",
      type: "paragraph",
      text: "城市中的水并非取之不尽，由于其会通过蒸发、降水以及地表径流等若干复杂过程在自然界中持续循环，因此理解这些过程对于建设具有韧性的城市具有十分重要的意义。",
      accessibleText: "城市里的水会不断循环。它经过蒸发、降水并沿地面流动。了解这些过程，可以帮助我们建设更能适应变化的城市。",
      changeReason: "拆分长句，把抽象表述改为更直接的说明。",
      reviewStatus: "pending",
      comments: [],
    },
    {
      id: "block-h2",
      type: "heading",
      headingLevel: 2,
      text: "一、水从哪里来",
      accessibleText: "一、水从哪里来",
      changeReason: "保留原章节结构。",
      reviewStatus: "approved",
      comments: [],
    },
    {
      id: "block-img",
      type: "image",
      text: "图 3-1 城市水循环示意",
      imageSrc: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='800' height='420'%3E%3Crect width='800' height='420' fill='%23dcecf3'/%3E%3Ccircle cx='650' cy='85' r='45' fill='%23f4c95d'/%3E%3Cpath d='M0 300 Q180 240 340 300 T800 280 V420 H0Z' fill='%2389b7d0'/%3E%3Cpath d='M130 285 Q220 170 330 285' fill='none' stroke='%233a7c9e' stroke-width='12'/%3E%3C/svg%3E",
      imageAlt: "",
      accessibleText: "",
      changeReason: "",
      reviewStatus: "needs-work",
      comments: [],
    },
    {
      id: "block-p2",
      type: "paragraph",
      text: "当太阳照射到水面时，水会受热变成水蒸气升到空中。水蒸气冷却后形成云，再以雨或雪的形式落回地面。",
      accessibleText: "太阳照在水面上，水会变成水蒸气升到空中。水蒸气冷却后变成云，最后以雨或雪落回地面。",
      changeReason: "使用较短句子，并明确每个步骤的先后顺序。",
      reviewStatus: "approved",
      comments: [],
    },
    {
      id: "block-link",
      type: "link",
      text: "点击这里",
      linkHref: "/resources/water-cycle",
      accessibleText: "打开水循环互动实验",
      changeReason: "改为说明链接目标的独立文案。",
      reviewStatus: "pending",
      comments: [],
    },
    {
      id: "block-h3",
      type: "heading",
      headingLevel: 3,
      text: "雨水花园怎样工作",
      accessibleText: "雨水花园怎样工作",
      changeReason: "",
      reviewStatus: "approved",
      comments: [],
    },
    {
      id: "block-p3",
      type: "paragraph",
      text: "雨水花园利用土壤和植物的共同作用暂时储存雨水，同时通过下渗补给地下水，并在降雨较集中时减轻城市排水管道所承受的压力。",
      accessibleText: "雨水花园用土壤和植物暂时存住雨水。雨水还会慢慢渗入地下，补充地下水。雨很大时，它可以减轻排水管的压力。",
      changeReason: "把并列成分拆成短句，减少专业术语密度。",
      reviewStatus: "pending",
      comments: [],
    },
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
  };
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function blankBlock(type: BlockType, text: string, extra: Partial<ContentBlock> = {}): ContentBlock {
  return {
    id: uid("block"),
    type,
    text,
    accessibleText: type === "image" ? extra.imageAlt ?? "" : text,
    changeReason: "",
    reviewStatus: "pending",
    comments: [],
    ...extra,
  };
}

export function parseImportedChapter(input: string): ContentBlock[] {
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

function sentenceLength(text: string) {
  const normalized = text.replace(/\s+/g, "");
  return /[A-Za-z]/.test(text) ? text.trim().split(/\s+/).length : normalized.length;
}

export function analyze(project: ChapterProject): AccessibilityIssue[] {
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

export function simplifyText(input: string, glossary: GlossaryTerm[]) {
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

export function blockRole(block: ContentBlock) {
  if (block.type === "heading") return `H${block.headingLevel ?? 2} 标题`;
  if (block.type === "image") return "图片 / 替代文本";
  if (block.type === "link") return "链接";
  return "正文段落";
}

export function statusLabel(status: ReviewStatus) {
  if (status === "approved") return "已通过";
  if (status === "needs-work") return "需修改";
  return "待审核";
}

export function severityLabel(severity: Severity) {
  if (severity === "error") return "必须修复";
  if (severity === "warning") return "建议优化";
  return "一致性提醒";
}

export function download(filename: string, content: string, type = "text/html;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
