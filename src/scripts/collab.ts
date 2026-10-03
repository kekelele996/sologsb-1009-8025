import {
  blankBlock,
  createSeedProject,
  uid,
  type BlockType,
  type ChapterProject,
  type ContentBlock,
  type GlossaryTerm,
} from "./model";

export type Role = "central" | "member";
export type Origin = "central" | "member";

/** 通用稿某一段最近一次下发的内容（冲突时保留，供老师挑选与导出结论）。 */
export interface CentralBlockVersion {
  text: string;
  accessibleText: string;
  changeReason: string;
  seq: number;
  updatedAt: string;
}

/** 校本稿段落：在通用内容块上追加归属与双版本信息。 */
export interface CollabBlock extends ContentBlock {
  origin: Origin;
  localModified: boolean;
  centralVersion?: CentralBlockVersion;
  conflictChoice?: "member" | "central";
}

export type MemberProject = Omit<ChapterProject, "blocks"> & { blocks: CollabBlock[] };

export interface SyncOp {
  blockId: string;
  type: BlockType;
  text: string;
  accessibleText: string;
  changeReason: string;
  headingLevel?: number;
  imageSrc?: string;
  imageAlt?: string;
  linkHref?: string;
}

export interface SyncBatch {
  id: string;
  seq: number;
  note: string;
  createdAt: string;
  resentAt?: string;
  ops: SyncOp[];
  blockOrder: string[];
  glossary: GlossaryTerm[];
}

export type OpStatus = "pending" | "merged" | "conflict" | "failed";

export interface OpReceipt {
  blockId: string;
  status: OpStatus;
  message: string;
}

export interface BatchReceipt {
  batchId: string;
  seq: number;
  note: string;
  receivedAt: string;
  ops: OpReceipt[];
  done: boolean;
}

export interface MigrationEntry {
  blockId: string;
  assigned: Origin;
  basis: string;
}

export interface MigrationReport {
  ranAt: string;
  acknowledged: boolean;
  entries: MigrationEntry[];
}

export interface BlockedAttempt {
  action: string;
  at: string;
}

export interface CentralStore {
  schema: 2;
  project: ChapterProject;
  seq: number;
  batches: SyncBatch[];
  publishedBlocks: ContentBlock[];
  publishedGlossary: GlossaryTerm[];
}

export interface MemberStore {
  schema: 2;
  project: MemberProject;
  receipts: BatchReceipt[];
  appliedBatches: string[];
  blockedLog: BlockedAttempt[];
  migration: MigrationReport | null;
}

export const LEGACY_STORAGE_KEY = "sologsb-1009-accessible-textbook-v1";
export const CENTRAL_STORAGE_KEY = "sologsb-1009-collab-central-v2";
export const MEMBER_STORAGE_KEY = "sologsb-1009-collab-member-v2";

/* ---------- 归属与双版本 ---------- */

export function asCollab(block: ContentBlock): CollabBlock {
  return block as CollabBlock;
}

/** 成员校动过且通用稿另有新版本的段落：保留两版等老师挑。 */
export function isDualVersion(block: CollabBlock) {
  return Boolean(
    block.localModified &&
    block.centralVersion &&
    block.centralVersion.accessibleText !== block.accessibleText,
  );
}

/** 老师尚未挑选的双版本段落。 */
export function isPendingChoice(block: CollabBlock) {
  return isDualVersion(block) && !block.conflictChoice;
}

/** 阅读、检查与导出使用的生效文本：老师选了通用稿就用通用稿，否则用校本稿。 */
export function effectiveText(block: CollabBlock) {
  return block.conflictChoice === "central" && block.centralVersion
    ? block.centralVersion.accessibleText
    : block.accessibleText;
}

/* ---------- 旧数据回填 ---------- */

function backfillBasis(block: ContentBlock): { memberOwned: boolean; basis: string } {
  const rewritten = block.type === "image"
    ? Boolean(block.imageAlt?.trim())
    : Boolean(block.accessibleText.trim()) && block.accessibleText.trim() !== block.text.trim();
  const hasReason = Boolean(block.changeReason.trim());
  const hasComments = block.comments.length > 0;
  if (rewritten && hasReason) return { memberOwned: true, basis: "已有改写原因且文本与原文不同，归为校本稿改动" };
  if (hasComments) return { memberOwned: true, basis: "已有批注记录，归为校本稿改动" };
  if (rewritten) return { memberOwned: true, basis: "无障碍文本与原文不同，归为校本稿改动" };
  return { memberOwned: false, basis: hasReason ? "仅有审校说明、无实质改写，归为通用稿" : "无改写痕迹，归为通用稿" };
}

function migrateLegacy(legacy: ChapterProject): { central: CentralStore; member: MemberStore } {
  const report: MigrationReport = { ranAt: new Date().toISOString(), acknowledged: false, entries: [] };
  const memberBlocks: CollabBlock[] = legacy.blocks.map((block) => {
    const { memberOwned, basis } = backfillBasis(block);
    report.entries.push({ blockId: block.id, assigned: memberOwned ? "member" : "central", basis });
    return { ...structuredClone(block), origin: memberOwned ? "member" as Origin : "central" as Origin, localModified: memberOwned };
  });
  const centralProject = structuredClone(legacy);
  return {
    central: {
      schema: 2,
      project: centralProject,
      seq: 0,
      batches: [],
      publishedBlocks: structuredClone(centralProject.blocks),
      publishedGlossary: structuredClone(centralProject.glossary),
    },
    member: {
      schema: 2,
      project: { ...structuredClone(legacy), blocks: memberBlocks },
      receipts: [],
      appliedBatches: [],
      blockedLog: [],
      migration: report,
    },
  };
}

function loadLegacyProject(): ChapterProject {
  try {
    const stored = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) ?? "") as { schema: number; project: ChapterProject };
    if (stored.schema === 1 && stored.project?.blocks?.length) return stored.project;
  } catch {
    // Fall back to the bundled sample.
  }
  return createSeedProject();
}

export function loadStores(): { central: CentralStore; member: MemberStore } {
  try {
    const central = JSON.parse(localStorage.getItem(CENTRAL_STORAGE_KEY) ?? "") as CentralStore;
    const member = JSON.parse(localStorage.getItem(MEMBER_STORAGE_KEY) ?? "") as MemberStore;
    if (central?.schema === 2 && member?.schema === 2 && central.project?.blocks?.length && member.project?.blocks?.length) {
      return { central, member };
    }
  } catch {
    // Re-run migration below.
  }
  const stores = migrateLegacy(loadLegacyProject());
  persistStores(stores.central, stores.member);
  return stores;
}

export function persistStores(central: CentralStore, member: MemberStore) {
  localStorage.setItem(CENTRAL_STORAGE_KEY, JSON.stringify(central));
  localStorage.setItem(MEMBER_STORAGE_KEY, JSON.stringify(member));
}

/* ---------- 总校：发布同步批次 ---------- */

function blockFingerprint(block: ContentBlock) {
  return JSON.stringify([
    block.type,
    block.text,
    block.accessibleText,
    block.changeReason,
    block.headingLevel ?? 0,
    block.imageSrc ?? "",
    block.imageAlt ?? "",
    block.linkHref ?? "",
  ]);
}

function toOp(block: ContentBlock): SyncOp {
  return {
    blockId: block.id,
    type: block.type,
    text: block.text,
    accessibleText: block.accessibleText,
    changeReason: block.changeReason,
    headingLevel: block.headingLevel,
    imageSrc: block.imageSrc,
    imageAlt: block.imageAlt,
    linkHref: block.linkHref,
  };
}

/** 相对上次发布快照的待同步改动（供发布前预览）。 */
export function pendingOps(central: CentralStore): SyncOp[] {
  const previous = new Map(central.publishedBlocks.map((block) => [block.id, block]));
  return central.project.blocks
    .filter((block) => {
      const old = previous.get(block.id);
      return !old || blockFingerprint(old) !== blockFingerprint(block);
    })
    .map(toOp);
}

export function glossaryChanged(central: CentralStore) {
  return JSON.stringify(central.publishedGlossary) !== JSON.stringify(central.project.glossary);
}

export function publishBatch(central: CentralStore, note: string): SyncBatch | null {
  const ops = pendingOps(central);
  const removed = central.publishedBlocks.filter((old) => !central.project.blocks.some((block) => block.id === old.id));
  if (!ops.length && !removed.length && !glossaryChanged(central)) return null;
  const batch: SyncBatch = {
    id: uid("batch"),
    seq: central.seq + 1,
    note: note.trim() || `第 ${central.seq + 1} 批通用稿更新`,
    createdAt: new Date().toISOString(),
    ops,
    blockOrder: central.project.blocks.map((block) => block.id),
    glossary: structuredClone(central.project.glossary),
  };
  central.seq += 1;
  central.batches.unshift(batch);
  central.publishedBlocks = structuredClone(central.project.blocks);
  central.publishedGlossary = structuredClone(central.project.glossary);
  return batch;
}

/* ---------- 成员校：逐段接入与重试 ---------- */

function upsertReceipt(receipt: BatchReceipt, blockId: string, status: OpStatus, message: string) {
  const existing = receipt.ops.find((op) => op.blockId === blockId);
  if (existing) {
    existing.status = status;
    existing.message = message;
  } else {
    receipt.ops.push({ blockId, status, message });
  }
}

function applyOp(block: CollabBlock, op: SyncOp, batch: SyncBatch) {
  block.type = op.type;
  block.text = op.text;
  block.accessibleText = op.accessibleText;
  block.changeReason = op.changeReason;
  block.headingLevel = op.headingLevel;
  block.imageSrc = op.imageSrc;
  block.imageAlt = op.imageAlt;
  block.linkHref = op.linkHref;
  block.centralVersion = { text: op.text, accessibleText: op.accessibleText, changeReason: op.changeReason, seq: batch.seq, updatedAt: batch.createdAt };
}

function reconcileOrder(member: MemberStore, blockOrder: string[]) {
  const rank = new Map(blockOrder.map((id, index) => [id, index]));
  member.project.blocks = member.project.blocks
    .filter((block) => rank.has(block.id) || block.localModified)
    .sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
}

export type ReceiveResult = "duplicate" | "advanced" | "done";

/**
 * 接入一个批次：逐段处理，每调用一次最多推进 limit 段。
 * 已接上/已留双版本的段落跳过不受影响；已完成的批次重复推送直接忽略。
 */
export function receiveBatch(member: MemberStore, batch: SyncBatch, limit = Number.POSITIVE_INFINITY): ReceiveResult {
  if (member.appliedBatches.includes(batch.id)) return "duplicate";
  let receipt = member.receipts.find((item) => item.batchId === batch.id);
  if (!receipt) {
    receipt = { batchId: batch.id, seq: batch.seq, note: batch.note, receivedAt: new Date().toISOString(), ops: [], done: false };
    member.receipts.unshift(receipt);
  }
  let processed = 0;
  for (const op of batch.ops) {
    const done = receipt.ops.find((item) => item.blockId === op.blockId);
    if (done && (done.status === "merged" || done.status === "conflict")) continue;
    if (processed >= limit) {
      upsertReceipt(receipt, op.blockId, "failed", "同步中断，等待逐段重试");
      continue;
    }
    const block = member.project.blocks.find((item) => item.id === op.blockId);
    if (block && block.localModified) {
      block.centralVersion = { text: op.text, accessibleText: op.accessibleText, changeReason: op.changeReason, seq: batch.seq, updatedAt: batch.createdAt };
      block.conflictChoice = undefined;
      upsertReceipt(receipt, op.blockId, "conflict", "成员校已改写本段，保留双版本待老师挑选");
    } else if (block) {
      applyOp(block, op, batch);
      upsertReceipt(receipt, op.blockId, "merged", "已接入通用稿更新");
    } else {
      const created: CollabBlock = {
        ...blankBlock(op.type, op.text),
        id: op.blockId,
        accessibleText: op.accessibleText,
        changeReason: op.changeReason,
        headingLevel: op.headingLevel,
        imageSrc: op.imageSrc,
        imageAlt: op.imageAlt,
        linkHref: op.linkHref,
        origin: "central",
        localModified: false,
        centralVersion: { text: op.text, accessibleText: op.accessibleText, changeReason: op.changeReason, seq: batch.seq, updatedAt: batch.createdAt },
      };
      member.project.blocks.push(created);
      upsertReceipt(receipt, op.blockId, "merged", "新增通用稿段落");
    }
    processed += 1;
  }
  receipt.done = batch.ops.every((op) => {
    const record = receipt.ops.find((item) => item.blockId === op.blockId);
    return record && (record.status === "merged" || record.status === "conflict");
  });
  if (receipt.done) {
    member.appliedBatches.push(batch.id);
    member.project.glossary = structuredClone(batch.glossary);
    reconcileOrder(member, batch.blockOrder);
  }
  return receipt.done ? "done" : "advanced";
}

/** 待接入批次：按批次号排序，尚未完成的。 */
export function pendingBatches(central: CentralStore, member: MemberStore) {
  return central.batches
    .filter((batch) => !member.appliedBatches.includes(batch.id))
    .sort((a, b) => a.seq - b.seq);
}

export function receiptOf(member: MemberStore, batchId: string) {
  return member.receipts.find((receipt) => receipt.batchId === batchId);
}

export function opStatusLabel(status: OpStatus) {
  if (status === "merged") return "已接上";
  if (status === "conflict") return "双版本待选";
  if (status === "failed") return "待重试";
  return "待接入";
}
