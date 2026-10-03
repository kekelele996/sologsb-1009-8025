import "@shoelace-style/shoelace/dist/shoelace.js";
import {
  analyze,
  blockRole,
  download,
  escapeHtml,
  parseImportedChapter,
  severityLabel,
  simplifyText,
  statusLabel,
  uid,
  type ChapterProject,
  type ContentBlock,
  type VersionSnapshot,
} from "./model";
import {
  effectiveText,
  glossaryChanged,
  isDualVersion,
  isPendingChoice,
  loadStores,
  opStatusLabel,
  pendingBatches,
  pendingOps,
  persistStores,
  publishBatch,
  receiveBatch,
  receiptOf,
  type BatchReceipt,
  type CentralStore,
  type CollabBlock,
  type MemberProject,
  type MemberStore,
  type MigrationReport,
  type OpReceipt,
  type Role,
  type SyncBatch,
} from "./collab";

const stores = loadStores();
const central: CentralStore = stores.central;
const member: MemberStore = stores.member;

let role: Role = "member";
let project: ChapterProject = member.project;
let activeBlockId = project.blocks[0]?.id ?? "";
let activeIssueId = "";
let previewMode: "normal" | "assisted" = "normal";
let selectedVersionId = "";
let showGlossary = false;
let showSyncCenter = false;
let showPublish = false;
let showBatches = false;
let showCentralView = false;
let simulateFailure = false;
let undoStack: ChapterProject[] = [];
let redoStack: ChapterProject[] = [];
let saveTimer = 0;

const rootElement = document.querySelector<HTMLDivElement>("#app");
if (!rootElement) throw new Error("Application root was not found");
const app: HTMLDivElement = rootElement;

const activeBlock = () => project.blocks.find((block) => block.id === activeBlockId) ?? project.blocks[0];
const memberBlocks = () => (project as MemberProject).blocks;

/** 阅读预览、检查与导出使用老师挑选后的生效文本。 */
function viewProject(): ChapterProject {
  if (role === "central") return project;
  return {
    ...project,
    blocks: memberBlocks().map((block) => {
      const text = effectiveText(block);
      return block.type === "image" ? { ...block, accessibleText: text, imageAlt: text } : { ...block, accessibleText: text };
    }),
  };
}

const issues = () => analyze(viewProject());

function saveSoon() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => persistStores(central, member), 320);
}

function toast(message: string, variant: "primary" | "success" | "warning" | "danger" = "primary") {
  const alert = document.createElement("sl-alert");
  alert.setAttribute("variant", variant);
  alert.setAttribute("closable", "");
  alert.setAttribute("duration", "3800");
  alert.textContent = message;
  document.body.appendChild(alert);
  requestAnimationFrame(() => (alert as HTMLElement & { toast?: () => void }).toast?.());
}

/** 成员校越权操作统一走这里：拦截、记录、提示。 */
function blocked(action: string) {
  member.blockedLog.unshift({ action, at: new Date().toISOString() });
  persistStores(central, member);
  document.documentElement.dataset.lastAction = `越权拦截：${action}`;
  toast(`已拦截越权操作：${action}。通用稿与统一术语由总校维护，成员校请在校本稿上改写。`, "danger");
  render();
}

function commit(label: string, update: (draft: ChapterProject) => void, renderAfter = true) {
  undoStack = [...undoStack.slice(-49), structuredClone(project)];
  redoStack = [];
  const draft = structuredClone(project);
  update(draft);
  draft.updatedAt = new Date().toISOString();
  if (role === "central") central.project = draft;
  else member.project = draft as MemberProject;
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
  if (role === "central") central.project = previous;
  else member.project = previous as MemberProject;
  if (!project.blocks.some((block) => block.id === activeBlockId)) activeBlockId = project.blocks[0]?.id ?? "";
  saveSoon();
  render();
}

function redo() {
  const next = redoStack.shift();
  if (!next) return;
  undoStack = [...undoStack.slice(-49), structuredClone(project)];
  project = next;
  if (role === "central") central.project = next;
  else member.project = next as MemberProject;
  saveSoon();
  render();
}

function switchRole(next: Role) {
  if (next === role) return;
  role = next;
  project = role === "central" ? central.project : member.project;
  undoStack = [];
  redoStack = [];
  activeBlockId = project.blocks[0]?.id ?? "";
  activeIssueId = "";
  selectedVersionId = "";
  showGlossary = showSyncCenter = showPublish = showBatches = showCentralView = false;
  document.documentElement.dataset.lastAction = role === "central" ? "已切换到总校（维护通用稿与统一术语）" : "已切换到成员校（在校本稿上改写）";
  render();
}

function updateActiveBlock(update: (block: ContentBlock, draft: ChapterProject) => void, label = "修改无障碍文本", renderAfter = true, marksModified = true) {
  commit(label, (draft) => {
    const block = draft.blocks.find((item) => item.id === activeBlockId);
    if (block) {
      update(block, draft);
      if (marksModified && role === "member") (block as CollabBlock).localModified = true;
    }
  }, renderAfter);
}

function render() {
  const view = viewProject();
  const list = issues();
  const active = activeBlock();
  const activeIssues = list.filter((issue) => issue.blockId === active.id);
  const approved = project.blocks.filter((block) => block.reviewStatus === "approved").length;
  const version = project.versions.find((item) => item.id === selectedVersionId) ?? project.versions[0];
  const pending = role === "member" ? pendingBatches(central, member) : [];
  const dualPending = role === "member" ? memberBlocks().filter(isPendingChoice).length : 0;
  const unpublished = role === "central" ? pendingOps(central).length : 0;
  const syncInfo = role === "central"
    ? `已发布 ${central.batches.length} 批 · 待同步 ${unpublished} 段`
    : `待接入 ${pending.length} 批 · 双版本待选 ${dualPending} 段`;

  const displayText = (block: ContentBlock) => {
    const base = role === "member" ? effectiveText(block as CollabBlock) : block.accessibleText;
    return base || block.text;
  };

  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <div class="brand"><span>无障碍</span><b>1009</b></div>
        <div class="role-switch" role="group" aria-label="角色切换">
          <button class="${role === "central" ? "active" : ""}" data-action="role-central">总校</button>
          <button class="${role === "member" ? "active" : ""}" data-action="role-member">成员校</button>
        </div>
        <div class="title-block">
          <input id="project-title" aria-label="教材名称" value="${escapeHtml(project.title)}" />
          <div class="meta"><span>${escapeHtml(project.subject)}</span><span>${escapeHtml(project.grade)}</span><span>${role === "central" ? "通用稿 · 统一术语" : "校本稿"}</span><span class="save-dot">本地自动保存</span></div>
        </div>
        <div class="top-actions">
          <span class="online-pill">${navigator.onLine ? "在线" : "离线可编辑"}</span>
          <sl-button size="small" variant="default" ${undoStack.length ? "" : "disabled"} data-action="undo">撤销</sl-button>
          <sl-button size="small" variant="default" ${redoStack.length ? "" : "disabled"} data-action="redo">重做</sl-button>
          ${role === "central" ? `
            <sl-button size="small" variant="warning" data-action="open-publish">发布同步${unpublished ? `（${unpublished}）` : ""}</sl-button>
            <sl-button size="small" variant="default" data-action="open-batches">批次记录</sl-button>
          ` : `
            <sl-button size="small" variant="warning" data-action="open-sync">同步中心${pending.length ? `（${pending.length}）` : ""}</sl-button>
            <sl-button size="small" variant="default" data-action="open-central-view">查看通用稿</sl-button>
          `}
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
          <span class="sync-info">${syncInfo}</span>
        </div>
      </div>

      <div class="workspace">
        <aside class="outline-panel">
          <div class="panel-title"><span>章节结构</span><sl-badge>${project.blocks.length} 块</sl-badge></div>
          <div class="block-list">
            ${project.blocks.map((block, index) => {
              const collab = block as CollabBlock;
              const blockIssues = list.filter((issue) => issue.blockId === block.id);
              const tags = role === "member"
                ? `${collab.localModified ? `<span class="origin-tag member">校本</span>` : `<span class="origin-tag">通用</span>`}${isPendingChoice(collab) ? `<span class="origin-tag dual">双版本</span>` : ""}`
                : "";
              return `<button class="block-item ${block.id === active.id ? "active" : ""}" data-action="select-block" data-block-id="${block.id}">
                <span class="block-order">${index + 1}</span>
                <span class="block-copy"><b>${block.type === "heading" ? `H${block.headingLevel}` : blockRole(block)}</b><span>${tags}${escapeHtml(displayText(block) || "（空）")}</span></span>
                <i class="status-${block.reviewStatus}" title="${statusLabel(block.reviewStatus)}"></i>
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
            <div><span class="eyebrow">当前内容块 · ${role === "central" ? "通用稿" : (active as CollabBlock).localModified ? "校本稿改动" : "通用稿段落"}</span><h1>${blockRole(active)}</h1></div>
            <div class="review-actions">
              <sl-button size="small" variant="${active.reviewStatus === "approved" ? "success" : "default"}" data-action="approve">${active.reviewStatus === "approved" ? "✓ 已通过" : "审核通过"}</sl-button>
              <sl-button size="small" variant="${active.reviewStatus === "needs-work" ? "danger" : "default"}" data-action="needs-work">需修改</sl-button>
            </div>
          </div>

          ${activeIssues.length ? `<div class="active-issues">${activeIssues.map((issue) => `
            <div class="issue-card ${issue.severity}">
              <div><sl-badge variant="${issue.severity === "error" ? "danger" : issue.severity === "warning" ? "warning" : "primary"}">${severityLabel(issue.severity)}</sl-badge><strong>${escapeHtml(issue.title)}</strong></div>
              <p>${escapeHtml(issue.detail)}</p><small>${escapeHtml(issue.suggestion)}</small>
            </div>`).join("")}</div>` : `<div class="issue-clear">✓ 当前内容块没有新的无障碍问题</div>`}

          ${renderDualCard(active)}

          <section class="edit-card source-card">
            <div class="section-heading"><div><span class="eyebrow">原教材</span><h2>${active.type === "image" ? "图片信息" : active.type === "link" ? "链接信息" : "原文"}</h2></div><sl-badge variant="neutral">${active.type}</sl-badge></div>
            ${renderSourceEditor(active)}
          </section>

          <section class="edit-card rewrite-card">
            <div class="section-heading">
              <div><span class="eyebrow">Accessible rewrite</span><h2>无障碍表达</h2></div>
              <sl-button size="small" variant="primary" outline data-action="generate">生成易读版本</sl-button>
            </div>
            ${renderAccessibleEditor(active)}
            <label class="field-label" for="reason-${active.id}">改写原因（每处改写必须记录）</label>
            <sl-textarea id="reason-${active.id}" data-field="reason" rows="2" value="${escapeHtml(active.changeReason)}" placeholder="例如：拆分长句、替换专业表达、补充链接目的"></sl-textarea>
            ${role === "member" && (active as CollabBlock).localModified && !active.changeReason.trim() ? `<div class="reason-warning">本段属于校本稿改动，请补写改写原因，便于总校与老师审阅。</div>` : ""}
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
          <section class="preview-card">
            <div class="section-heading"><div><span class="eyebrow">Reader preview</span><h2>阅读预览</h2></div><div class="mode-switch"><button class="${previewMode === "normal" ? "active" : ""}" data-action="preview-normal">普通</button><button class="${previewMode === "assisted" ? "active" : ""}" data-action="preview-assisted">辅助</button></div></div>
            <div class="reader-preview mode-${previewMode}">${renderPreview(view)}</div>
          </section>

          <section class="order-card">
            <div class="section-heading"><div><span class="eyebrow">Screen reader order</span><h2>读屏阅读顺序</h2></div><sl-badge>从上到下</sl-badge></div>
            <ol class="reading-order">
              ${view.blocks.map((block, index) => `<li class="${block.id === active.id ? "active" : ""}"><b>${index + 1}</b><div><strong>${blockRole(block)}</strong><span>${escapeHtml(block.accessibleText || block.text || "（无内容）")}</span></div></li>`).join("")}
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

      <footer class="statusbar"><span>最近操作：${escapeHtml(document.documentElement.dataset.lastAction || "示例章节已载入")}</span><span>${role === "central" ? "总校" : "成员校"} · ${project.blocks.length} 个内容块 · ${list.length} 个待处理问题 · ${syncInfo}</span></footer>
    </div>

    <sl-dialog label="${role === "central" ? "统一术语表（总校维护）" : "统一术语表（总校发布 · 成员校只读）"}" ${showGlossary ? "open" : ""} data-dialog="glossary">
      ${role === "central" ? `
        <div class="glossary-editor">
          ${project.glossary.map((term) => `<div class="term-row"><div><b>${escapeHtml(term.source)}</b><sl-input size="small" value="${escapeHtml(term.preferred)}" data-term-id="${term.id}"></sl-input><small>${escapeHtml(term.note)}</small></div><sl-button size="small" variant="danger" outline data-action="remove-term" data-term-id="${term.id}">删除</sl-button></div>`).join("")}
        </div>
        <div class="term-add"><sl-input id="new-term-source" placeholder="原文术语"></sl-input><sl-input id="new-term-preferred" placeholder="统一表达"></sl-input><sl-button variant="primary" data-action="add-term">添加术语</sl-button></div>
      ` : `
        <p class="batch-hint">统一术语由总校维护并随同步批次下发，成员校不能修改；如需调整请在校本稿批注中说明。</p>
        <div class="glossary-editor">
          ${project.glossary.map((term) => `<div class="readonly-term"><b>${escapeHtml(term.source)}</b> → ${escapeHtml(term.preferred)}<br><small>${escapeHtml(term.note)}</small></div>`).join("")}
        </div>
        <div class="term-add"><sl-input id="new-term-source" placeholder="原文术语"></sl-input><sl-input id="new-term-preferred" placeholder="统一表达"></sl-input><sl-button variant="danger" outline data-action="add-term">添加术语</sl-button></div>
      `}
      <sl-button slot="footer" variant="primary" data-action="close-glossary">完成</sl-button>
    </sl-dialog>

    ${renderSyncCenterDialog()}
    ${renderPublishDialog()}
    ${renderBatchesDialog()}
    ${renderCentralViewDialog()}`;

  wireLiveFields();
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
  const value = role === "member" ? effectiveText(block as CollabBlock) : block.accessibleText;
  if (block.type === "image") {
    return `<sl-textarea id="accessible-${block.id}" data-field="accessible" rows="3" label="图片替代文本" value="${escapeHtml(value || block.imageAlt || "")}" help-text="读屏软件会朗读这里的内容。"></sl-textarea>`;
  }
  return `<sl-textarea id="accessible-${block.id}" data-field="accessible" rows="6" value="${escapeHtml(value)}"></sl-textarea>`;
}

/** 成员校改过的段落遇到通用稿更新：两版并排，等老师挑。 */
function renderDualCard(block: ContentBlock) {
  if (role !== "member") return "";
  const collab = block as CollabBlock;
  if (!isDualVersion(collab) || !collab.centralVersion) return "";
  const centralVersion = collab.centralVersion;
  if (collab.conflictChoice) {
    return `<section class="edit-card dual-card">
      <div class="dual-resolved"><span>✓ 已采用${collab.conflictChoice === "central" ? "通用稿" : "校本稿"}版本；另一版保留在导出的两边结论中。</span><sl-button size="small" variant="text" data-action="rechoose">重新选择</sl-button></div>
    </section>`;
  }
  return `<section class="edit-card dual-card">
    <div class="section-heading"><div><span class="eyebrow">Sync conflict</span><h2>本段通用稿已更新，校本稿也有改写</h2></div><sl-badge variant="danger" pill>双版本待选</sl-badge></div>
    <p class="dual-hint">成员校改过的段落不会被通用稿覆盖。请老师比较后挑选，两个版本都会写入导出结论。</p>
    <div class="dual-grid">
      <div class="dual-col">
        <header><b>校本稿版本</b><span>成员校改写</span></header>
        <p>${escapeHtml(collab.accessibleText || "（空）")}</p>
        <small>改写原因：${escapeHtml(collab.changeReason || "未填写")}</small>
        <sl-button size="small" variant="primary" data-action="choose-member">采用校本稿</sl-button>
      </div>
      <div class="dual-col central">
        <header><b>通用稿版本</b><span>批次 #${centralVersion.seq}</span></header>
        <p>${escapeHtml(centralVersion.accessibleText || "（空）")}</p>
        <small>总校说明：${escapeHtml(centralVersion.changeReason || "未填写")}</small>
        <sl-button size="small" variant="default" data-action="choose-central">采用通用稿</sl-button>
      </div>
    </div>
  </section>`;
}

function renderPreview(view: ChapterProject) {
  return view.blocks.map((block, index) => {
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

function renderMigration(migration: MigrationReport) {
  const memberCount = migration.entries.filter((entry) => entry.assigned === "member").length;
  return `<div class="migration-report">
    <header><b>旧数据回填报告</b><span>${new Date(migration.ranAt).toLocaleString()}</span></header>
    <p>旧稿没有归属信息，已按现有改写来源回填：${memberCount} 段归为校本稿改动，${migration.entries.length - memberCount} 段归为通用稿。</p>
    <ul>${migration.entries.map((entry) => {
      const index = member.project.blocks.findIndex((block) => block.id === entry.blockId) + 1;
      return `<li>段 ${index || "—"} → ${entry.assigned === "member" ? "校本稿" : "通用稿"}：${escapeHtml(entry.basis)}</li>`;
    }).join("")}</ul>
    <sl-button size="small" variant="primary" outline data-action="ack-migration">知道了</sl-button>
  </div>`;
}

function renderOpRow(op: OpReceipt) {
  const index = member.project.blocks.findIndex((block) => block.id === op.blockId) + 1;
  const block = member.project.blocks.find((item) => item.id === op.blockId);
  const title = (block ? block.accessibleText || block.text : op.blockId).slice(0, 26);
  return `<div class="op-row ${op.status}"><span class="chip">${opStatusLabel(op.status)}</span><span>段 ${index || "—"} · ${escapeHtml(title)}</span><small>${escapeHtml(op.message)}</small></div>`;
}

function renderBatchCard(batch: SyncBatch, actionable: boolean) {
  const receipt = receiptOf(member, batch.id);
  const failedCount = receipt?.ops.filter((op) => op.status === "failed").length ?? 0;
  return `<div class="batch-card">
    <header><b>批次 #${batch.seq} · ${escapeHtml(batch.note)}</b><span>${new Date(batch.createdAt).toLocaleString()} · ${batch.ops.length} 段${batch.resentAt ? " · 总校已重发" : ""}</span></header>
    ${receipt?.ops.length ? `<div class="op-list">${receipt.ops.map(renderOpRow).join("")}</div>` : `<p class="batch-hint">含 ${batch.ops.length} 段通用稿更新与统一术语快照。成员校改过的段落会保留双版本，不会被覆盖。</p>`}
    <div class="batch-actions">
      ${actionable && !receipt?.done ? `<sl-button size="small" variant="primary" data-action="receive-batch" data-batch-id="${batch.id}">${receipt ? "继续接入" : "接入本批"}</sl-button>` : ""}
      ${!actionable ? `<span class="wait-note">等待上一批接入完成</span>` : ""}
      ${actionable && failedCount ? `
        <sl-button size="small" variant="warning" data-action="retry-one" data-batch-id="${batch.id}">逐段重试（剩 ${failedCount} 段）</sl-button>
        <sl-button size="small" variant="default" data-action="retry-all" data-batch-id="${batch.id}">全部重试</sl-button>
      ` : ""}
    </div>
  </div>`;
}

function renderDoneReceipt(receipt: BatchReceipt) {
  return `<div class="batch-card done">
    <header><b>批次 #${receipt.seq} · ${escapeHtml(receipt.note)}</b><span>已完成接入 · 同一批重发不会重复应用</span></header>
    <div class="batch-actions"><sl-button size="small" variant="text" data-action="resend-test" data-batch-id="${receipt.batchId}">重发测试</sl-button></div>
  </div>`;
}

function renderSyncCenterDialog() {
  if (role !== "member") return "";
  const pending = pendingBatches(central, member);
  const doneReceipts = member.receipts.filter((receipt) => receipt.done);
  return `<sl-dialog label="同步中心 · 成员校" ${showSyncCenter ? "open" : ""} style="--width: 64rem;">
    <div class="sync-layout">
      ${member.migration && !member.migration.acknowledged ? renderMigration(member.migration) : ""}
      <div class="sync-summary">
        <span class="sync-stat">待接入 ${pending.length} 批</span>
        <span class="sync-stat">双版本待选 ${memberBlocks().filter(isPendingChoice).length} 段</span>
        <span class="sync-stat">已接入 ${doneReceipts.length} 批</span>
      </div>
      <div class="sync-toolbar"><sl-switch id="simulate-failure" ${simulateFailure ? "checked" : ""}>模拟同步中断（每次仅接入 1 段，用于演示逐段重试）</sl-switch></div>
      <h3>待接入批次</h3>
      ${pending.length ? pending.map((batch, index) => renderBatchCard(batch, index === 0)).join("") : `<div class="empty-note">通用稿暂无待接入的更新。</div>`}
      <h3>已接入批次</h3>
      ${doneReceipts.length ? doneReceipts.map(renderDoneReceipt).join("") : `<div class="empty-note">还没有完成接入的批次。</div>`}
      <h3>越权拦截记录（${member.blockedLog.length}）</h3>
      ${member.blockedLog.length ? `<ul class="blocked-list">${member.blockedLog.slice(0, 5).map((item) => `<li>${new Date(item.at).toLocaleString()} · ${escapeHtml(item.action)}</li>`).join("")}</ul>` : `<div class="empty-note">成员校直接修改通用稿或统一术语的尝试会被拦截并记录在这里。</div>`}
    </div>
    <sl-button slot="footer" variant="primary" data-action="close-sync">完成</sl-button>
  </sl-dialog>`;
}

function renderPublishDialog() {
  if (role !== "central") return "";
  const ops = pendingOps(central);
  const glossaryDiff = glossaryChanged(central);
  const hasChanges = ops.length > 0 || glossaryDiff;
  return `<sl-dialog label="发布同步批次 · 总校" ${showPublish ? "open" : ""} style="--width: 46rem;">
    ${hasChanges ? `
      <p class="batch-hint">本次将向成员校同步 ${ops.length} 段改动${glossaryDiff ? "与统一术语更新" : ""}。成员校已改写的段落会保留双版本，不会被覆盖。</p>
      <div class="op-list">${ops.map((op) => {
        const index = central.project.blocks.findIndex((block) => block.id === op.blockId) + 1;
        return `<div class="op-row pending"><span class="chip">待同步</span><span>段 ${index} · ${escapeHtml((op.accessibleText || op.text).slice(0, 30))}</span><small>${escapeHtml(op.changeReason || "—")}</small></div>`;
      }).join("")}</div>
      <sl-input id="publish-note" label="批次说明" placeholder="例如：统一第三章术语并修订长句"></sl-input>
    ` : `<div class="empty-note">通用稿相对上一批没有新改动。</div>`}
    <sl-button slot="footer" variant="primary" data-action="do-publish" ${hasChanges ? "" : "disabled"}>发布批次</sl-button>
    <sl-button slot="footer" variant="default" data-action="close-publish">取消</sl-button>
  </sl-dialog>`;
}

function renderBatchesDialog() {
  if (role !== "central") return "";
  return `<sl-dialog label="批次记录 · 总校" ${showBatches ? "open" : ""} style="--width: 46rem;">
    ${central.batches.length ? central.batches.map((batch) => `<div class="batch-card">
      <header><b>批次 #${batch.seq} · ${escapeHtml(batch.note)}</b><span>${new Date(batch.createdAt).toLocaleString()} · ${batch.ops.length} 段</span></header>
      <div class="batch-actions">
        <sl-button size="small" variant="text" data-action="resend-batch" data-batch-id="${batch.id}">重新推送</sl-button>
        ${batch.resentAt ? `<span class="wait-note">已于 ${new Date(batch.resentAt).toLocaleTimeString()} 重发；成员校已接入的部分不会重复应用</span>` : ""}
      </div>
    </div>`).join("") : `<div class="empty-note">还没有发布过同步批次。编辑通用稿或统一术语后，点“发布同步”。</div>`}
    <sl-button slot="footer" variant="primary" data-action="close-batches">完成</sl-button>
  </sl-dialog>`;
}

function renderCentralViewDialog() {
  if (role !== "member") return "";
  return `<sl-dialog label="总校通用稿（只读）" ${showCentralView ? "open" : ""} style="--width: 56rem;">
    <p class="batch-hint">通用稿与统一术语由总校维护。成员校如需调整，请在校本稿上改写并写明原因；直接修改会被拦截。</p>
    <div class="central-view-list">${central.project.blocks.map((block, index) => `<div class="central-view-block"><b>${index + 1} · ${blockRole(block)}</b><p>${escapeHtml(block.accessibleText || block.text)}</p></div>`).join("")}</div>
    <h3 class="view-subhead">统一术语</h3>
    <ul class="term-view">${central.project.glossary.map((term) => `<li><b>${escapeHtml(term.source)}</b> → ${escapeHtml(term.preferred)}（${escapeHtml(term.note)}）</li>`).join("")}</ul>
    <sl-button slot="footer" variant="danger" outline data-action="attempt-central-edit">尝试直接修改通用稿</sl-button>
    <sl-button slot="footer" variant="primary" data-action="close-central-view">关闭</sl-button>
  </sl-dialog>`;
}

function renderExportBlocks(blocks: ContentBlock[]) {
  return blocks.map((block) => {
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
}

function buildExportDocument(project: ChapterProject, appendix: string) {
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
    .appendix { margin-top: 3em; border-top: 3px solid #1f4a3e; padding-top: .5em; font-size: .8em; }
    .appendix table { width: 100%; border-collapse: collapse; margin: 1em 0; }
    .appendix th, .appendix td { border: 1px solid #c9d2cc; padding: .5em .6em; text-align: left; vertical-align: top; }
    .appendix th { background: #eef4f0; }
    .appendix caption { text-align: left; font-weight: 700; margin-bottom: .4em; }
    .appendix small { color: #5d6a64; }
  </style>
</head>
<body>
  <a class="skip" href="#main">跳到正文</a>
  <main id="main" tabindex="-1">
      ${renderExportBlocks(project.blocks)}
      ${appendix}
  </main>
</body>
</html>`;
}

function exportCentralHtml(store: CentralStore) {
  const terms = store.project.glossary.map((term) => `<li><b>${escapeHtml(term.source)}</b> → ${escapeHtml(term.preferred)}（${escapeHtml(term.note)}）</li>`).join("");
  return buildExportDocument(store.project, `<section class="appendix" aria-label="总校通用稿说明">
        <h2>总校通用稿 · 统一术语</h2>
        <p>本文件由总校维护。统一术语随同步批次下发，成员校在校本稿上接入。</p>
        <ul>${terms}</ul>
        <p>已发布同步批次 ${store.batches.length} 批。</p>
      </section>`);
}

/** 成员校阅读版导出：正文用老师挑选后的生效文本，附录带上两边结论。 */
function exportMemberHtml(store: MemberStore) {
  const project = store.project;
  const view: ChapterProject = {
    ...project,
    blocks: project.blocks.map((block) => {
      const text = effectiveText(block);
      return block.type === "image" ? { ...block, accessibleText: text, imageAlt: text } : { ...block, accessibleText: text };
    }),
  };
  const modified = project.blocks.filter((block) => block.localModified);
  const duals = modified.filter(isDualVersion);
  const undecided = duals.filter(isPendingChoice);
  const approved = project.blocks.filter((block) => block.reviewStatus === "approved").length;
  const doneReceipts = store.receipts.filter((receipt) => receipt.done);
  const rows = modified.map((block) => {
    const index = project.blocks.findIndex((item) => item.id === block.id) + 1;
    const choice = block.conflictChoice === "central" ? "通用稿" : block.conflictChoice === "member" ? "校本稿" : isDualVersion(block) ? "待定（保留双版本）" : "校本稿";
    const centralCell = block.centralVersion
      ? `${escapeHtml(block.centralVersion.accessibleText)}<br><small>批次 #${block.centralVersion.seq} · ${escapeHtml(block.centralVersion.changeReason || "总校未填写说明")}</small>`
      : "通用稿暂无本段更新";
    return `<tr><td>${index}</td><td>${escapeHtml(block.accessibleText || block.text)}<br><small>改写原因：${escapeHtml(block.changeReason || "未填写")}</small></td><td>${centralCell}</td><td>${choice}</td></tr>`;
  }).join("");
  const terms = project.glossary.map((term) => `<li><b>${escapeHtml(term.source)}</b> → ${escapeHtml(term.preferred)}（${escapeHtml(term.note)}）</li>`).join("");
  const batches = doneReceipts.map((receipt) => `<li>批次 #${receipt.seq} · ${escapeHtml(receipt.note)}</li>`).join("");
  return buildExportDocument(view, `<section class="appendix" aria-label="两边结论">
        <h2>同步结论（总校通用稿 × 成员校校本稿）</h2>
        <ul>
          <li>全章 ${project.blocks.length} 段，成员校校本稿改动 ${modified.length} 段，审核通过 ${approved} 段。</li>
          <li>双版本 ${duals.length} 段，其中待老师挑选 ${undecided.length} 段。</li>
          <li>已接入总校同步批次 ${doneReceipts.length} 批。</li>
        </ul>
        ${modified.length ? `<table>
          <caption>校本稿改动段落的两边结论</caption>
          <thead><tr><th scope="col">段落</th><th scope="col">成员校校本稿结论</th><th scope="col">总校通用稿结论</th><th scope="col">老师采用</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>` : `<p>成员校本章尚未改写段落。</p>`}
        <h3>统一术语（总校发布）</h3>
        <ul>${terms}</ul>
        ${batches ? `<h3>已接入批次</h3><ul>${batches}</ul>` : ""}
      </section>`);
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
          if (role === "member") (block as CollabBlock).conflictChoice = undefined;
        }
        if (field === "image-alt") {
          block.imageAlt = value;
          block.accessibleText = value;
          if (role === "member") (block as CollabBlock).conflictChoice = undefined;
        }
        if (field === "link-href") block.linkHref = value;
        if (field === "reason") block.changeReason = value;
        block.reviewStatus = "pending";
      }, "编辑无障碍文本", false);
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
  if (action === "role-central") switchRole("central");
  if (action === "role-member") switchRole("member");
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
      current.reviewStatus = "pending";
      if (role === "member") (current as CollabBlock).conflictChoice = undefined;
    }, "生成易读版本");
  }
  if (action === "approve") updateActiveBlock((block) => { block.reviewStatus = "approved"; }, "审核通过", true, false);
  if (action === "needs-work") updateActiveBlock((block) => { block.reviewStatus = "needs-work"; }, "标记需修改", true, false);
  if (action === "add-comment") {
    const input = app.querySelector<HTMLElement & { value: string }>("#new-comment");
    const body = input?.value.trim();
    if (body) updateActiveBlock((block) => {
      block.comments.unshift({ id: uid("comment"), author: role === "central" ? "总校编辑" : "成员校编辑", body, createdAt: new Date().toISOString(), resolved: false, replies: [] });
    }, "添加批注");
  }
  if (action === "reply") {
    const commentId = target.dataset.commentId ?? "";
    const input = app.querySelector<HTMLElement & { value: string }>(`#reply-${CSS.escape(commentId)}`);
    const body = input?.value.trim();
    if (body) updateActiveBlock((block) => {
      block.comments.find((comment) => comment.id === commentId)?.replies.push({ id: uid("reply"), author: role === "central" ? "总校编辑" : "成员校编辑", body, createdAt: new Date().toISOString() });
    }, "回复批注");
  }
  if (action === "resolve-comment") {
    const commentId = target.dataset.commentId ?? "";
    updateActiveBlock((block) => {
      const comment = block.comments.find((item) => item.id === commentId);
      if (comment) comment.resolved = !comment.resolved;
    }, "更新批注状态", true, false);
  }
  if (action === "choose-member" || action === "choose-central" || action === "rechoose") {
    const choice = action === "choose-member" ? "member" as const : action === "choose-central" ? "central" as const : undefined;
    commit("挑选双版本", (draft) => {
      const block = draft.blocks.find((item) => item.id === activeBlockId) as CollabBlock | undefined;
      if (block) block.conflictChoice = choice;
    });
  }
  if (action === "preview-normal") { previewMode = "normal"; render(); }
  if (action === "preview-assisted") { previewMode = "assisted"; render(); }
  if (action === "glossary") { showGlossary = true; render(); }
  if (action === "close-glossary") { showGlossary = false; render(); }
  if (action === "add-term") {
    if (role !== "central") { blocked("修改统一术语"); return; }
    const source = app.querySelector<HTMLElement & { value: string }>("#new-term-source");
    const preferred = app.querySelector<HTMLElement & { value: string }>("#new-term-preferred");
    if (source?.value.trim() && preferred?.value.trim()) {
      commit("添加术语", (draft) => { draft.glossary.push({ id: uid("term"), source: source.value.trim(), preferred: preferred.value.trim(), note: "总校新增术语" }); });
    }
  }
  if (action === "remove-term") {
    if (role !== "central") { blocked("删除统一术语"); return; }
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
    if (role === "central") {
      download(`${central.project.title}-通用稿.html`, exportCentralHtml(central));
      document.documentElement.dataset.lastAction = "已导出总校通用稿 HTML";
    } else {
      download(`${member.project.title}-校本阅读版.html`, exportMemberHtml(member));
      document.documentElement.dataset.lastAction = "已导出校本阅读版 HTML（含两边结论）";
    }
    render();
  }
  if (action === "import") app.querySelector<HTMLInputElement>("#chapter-file")?.click();
  if (action === "open-sync") { showSyncCenter = true; render(); }
  if (action === "close-sync") { showSyncCenter = false; render(); }
  if (action === "open-publish") { showPublish = true; render(); }
  if (action === "close-publish") { showPublish = false; render(); }
  if (action === "open-batches") { showBatches = true; render(); }
  if (action === "close-batches") { showBatches = false; render(); }
  if (action === "open-central-view") { showCentralView = true; render(); }
  if (action === "close-central-view") { showCentralView = false; render(); }
  if (action === "ack-migration") {
    if (member.migration) member.migration.acknowledged = true;
    saveSoon();
    render();
  }
  if (action === "do-publish") {
    const note = app.querySelector<HTMLElement & { value: string }>("#publish-note")?.value ?? "";
    const batch = publishBatch(central, note);
    if (batch) {
      toast(`已发布批次 #${batch.seq}：${batch.ops.length} 段改动，成员校可在同步中心接入`, "success");
      showPublish = false;
    } else {
      toast("通用稿相对上一批没有新改动", "primary");
    }
    saveSoon();
    render();
  }
  if (action === "resend-batch") {
    const batch = central.batches.find((item) => item.id === target.dataset.batchId);
    if (batch) {
      batch.resentAt = new Date().toISOString();
      toast(`批次 #${batch.seq} 已重新推送；成员校已接入的部分不会重复应用`, "primary");
      saveSoon();
      render();
    }
  }
  if (action === "receive-batch" || action === "retry-one" || action === "retry-all" || action === "resend-test") {
    const batch = central.batches.find((item) => item.id === target.dataset.batchId);
    if (batch) {
      const limit = action === "retry-all" ? Number.POSITIVE_INFINITY
        : action === "retry-one" ? 1
        : action === "resend-test" ? Number.POSITIVE_INFINITY
        : simulateFailure ? 1 : Number.POSITIVE_INFINITY;
      const result = receiveBatch(member, batch, limit);
      if (result === "duplicate") toast(`批次 #${batch.seq} 已完成接入，同一批重发不会重复应用`, "warning");
      else if (result === "done") toast(`批次 #${batch.seq} 已全部接入`, "success");
      else toast(`批次 #${batch.seq} 部分段落未接上，可在成员校这边逐段重试`, "warning");
      if (!project.blocks.some((block) => block.id === activeBlockId)) activeBlockId = project.blocks[0]?.id ?? "";
      saveSoon();
      render();
    }
  }
  if (action === "attempt-central-edit") blocked("直接修改通用稿");
});

app.addEventListener("sl-change", (event) => {
  const element = event.target as HTMLElement;
  if (element.id === "chapter-file") return;
  if (element.id === "simulate-failure") {
    simulateFailure = (element as HTMLElement & { checked: boolean }).checked;
    render();
    return;
  }
  if (element.id.startsWith("heading-level-")) {
    const level = Number((element as HTMLElement & { value: string }).value);
    updateActiveBlock((block) => { block.headingLevel = level; block.reviewStatus = "pending"; }, "修改标题层级");
  }
  if (element.id === "version-select") {
    selectedVersionId = (element as HTMLElement & { value: string }).value;
    render();
  }
  if (element.matches("[data-term-id]")) {
    if (role !== "central") { blocked("修改统一术语"); return; }
    const termId = element.dataset.termId;
    const value = (element as HTMLElement & { value: string }).value;
    commit("修改术语表", (draft) => { const term = draft.glossary.find((item) => item.id === termId); if (term) term.preferred = value; });
  }
});

app.addEventListener("change", (event) => {
  const input = event.target as HTMLInputElement;
  if (input.id !== "chapter-file" || !input.files?.[0]) return;
  void input.files[0].text().then((text) => {
    commit("导入章节文本", (draft) => {
      const parsed = parseImportedChapter(text);
      draft.blocks = role === "member"
        ? parsed.map((block) => ({ ...block, origin: "member" as const, localModified: true }))
        : parsed;
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
