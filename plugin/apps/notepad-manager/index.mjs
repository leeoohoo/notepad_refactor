import { createNotesApi } from './api.mjs';
import { createNotepadLayerManager } from './layers.mjs';
import { normalizeString, setButtonEnabled } from './dom.mjs';
import { renderMarkdown } from './markdown.mjs';
import { parseTags, tagsToText } from './tags.mjs';
import { createNotepadManagerUi } from './ui.mjs';
import { createDsPathTreeView } from './ds-tree.mjs';

export function mount({ container, host, slots }) {
  if (!container) throw new Error('container is required');
  if (!host || typeof host !== 'object') throw new Error('host is required');

  const ctx =
    typeof host?.context?.get === 'function' ? host.context.get() : { pluginId: '', appId: '', theme: 'light' };
  const bridgeEnabled = Boolean(ctx?.bridge?.enabled);

  const api = createNotesApi({ host, bridgeEnabled });

  const {
    root,
    btnNewFolder,
    btnNewNote,
    btnSave,
    btnDelete,
    btnCopy,
    btnCopyMd,
    btnCopyDocx,
    btnToggleEdit,
    createHint,
    searchInput,
    btnClearSearch,
    folderList,
    tagRow,
    titleInput,
    folderSelect,
    tagsInput,
    infoBox,
    textarea,
    preview,
    setStatus,
  } = createNotepadManagerUi({ container, slots, ctx, bridgeEnabled });
  const layoutBreakpoint = 960;
  const compactLayoutBreakpoint = 520;
  const isCompactSurface = ctx?.surface === 'compact';
  let layoutObserver = null;
  let layoutResizeHandler = null;

  const resolveLayout = (width) => {
    const breakpoint = isCompactSurface ? compactLayoutBreakpoint : layoutBreakpoint;
    return width <= breakpoint ? 'stacked' : 'split';
  };

  const applyLayout = (width) => {
    if (!root) return;
    const next = resolveLayout(width);
    if (root.dataset.layout !== next) root.dataset.layout = next;
  };

  const readContainerWidth = () => {
    if (container?.getBoundingClientRect) return container.getBoundingClientRect().width;
    if (root?.getBoundingClientRect) return root.getBoundingClientRect().width;
    return 0;
  };

  applyLayout(readContainerWidth());

  if (typeof ResizeObserver !== 'undefined' && container?.nodeType === 1) {
    layoutObserver = new ResizeObserver((entries) => {
      const width = entries?.[0]?.contentRect?.width ?? readContainerWidth();
      applyLayout(width);
    });
    layoutObserver.observe(container);
  } else if (typeof window !== 'undefined') {
    layoutResizeHandler = () => applyLayout(readContainerWidth());
    window.addEventListener('resize', layoutResizeHandler);
  }

  let disposed = false;
  const { closeActiveLayer, showMenu, showDialog, confirmDialog } = createNotepadLayerManager({
    getDisposed: () => disposed,
    setStatus,
  });

  let folders = [];
  let tags = [];
  let notes = [];
  let selectedFolder = '';
  let selectedTags = [];
  let selectedNoteId = '';
  let currentNote = null;
  let currentContent = '';
  let dirty = false;
  let controlsEnabled = false;
  let editorMode = 'preview';
  let copying = false;
  let copyFeedbackTimer = null;
  let exporting = false;
  let exportFeedbackTimer = null;
  let exportingDocx = false;
  let docxFeedbackTimer = null;
  let activeTreeKey = '';
  const NOTE_KEY_PREFIX = '__note__:';
  const noteIndex = new Map();
  let refreshFoldersSeq = 0;
  let refreshNotesSeq = 0;
  let openNoteSeq = 0;
  let searchDebounceTimer = null;
  let searchWasActive = false;
  let expandedKeysBeforeSearch = null;

  const makeNoteKey = (folder, id) => {
    const noteId = normalizeString(id);
    const folderPath = normalizeString(folder);
    if (!noteId) return folderPath || '';
    const segment = `${NOTE_KEY_PREFIX}${noteId}`;
    return folderPath ? `${folderPath}/${segment}` : segment;
  };

  const parseTreeKey = (key) => {
    const raw = typeof key === 'string' ? key.trim() : '';
    if (!raw) return { kind: 'folder', folder: '' };
    const parts = raw.split('/').filter(Boolean);
    if (parts.length === 0) return { kind: 'folder', folder: '' };
    const last = parts[parts.length - 1] || '';
    if (last.startsWith(NOTE_KEY_PREFIX)) {
      const noteId = last.slice(NOTE_KEY_PREFIX.length);
      const folder = parts.slice(0, -1).join('/');
      return { kind: 'note', folder, noteId };
    }
    return { kind: 'folder', folder: parts.join('/') };
  };

  const clearCopyFeedbackTimer = () => {
    if (!copyFeedbackTimer) return;
    try {
      clearTimeout(copyFeedbackTimer);
    } catch {
      // ignore
    }
    copyFeedbackTimer = null;
  };

  const clearExportFeedbackTimer = () => {
    if (!exportFeedbackTimer) return;
    try {
      clearTimeout(exportFeedbackTimer);
    } catch {
      // ignore
    }
    exportFeedbackTimer = null;
  };

  const clearDocxFeedbackTimer = () => {
    if (!docxFeedbackTimer) return;
    try {
      clearTimeout(docxFeedbackTimer);
    } catch {
      // ignore
    }
    docxFeedbackTimer = null;
  };

  const flashCopyFeedback = (text) => {
    if (!btnCopy) return;
    const original = '复制';
    btnCopy.textContent = text;
    clearCopyFeedbackTimer();
    copyFeedbackTimer = setTimeout(() => {
      copyFeedbackTimer = null;
      btnCopy.textContent = original;
    }, 1000);
  };

  const flashExportFeedback = (text) => {
    if (!btnCopyMd) return;
    const original = '导出MD';
    btnCopyMd.textContent = text;
    clearExportFeedbackTimer();
    exportFeedbackTimer = setTimeout(() => {
      exportFeedbackTimer = null;
      btnCopyMd.textContent = original;
    }, 1000);
  };

  const flashDocxFeedback = (text) => {
    if (!btnCopyDocx) return;
    const original = '导出Word';
    btnCopyDocx.textContent = text;
    clearDocxFeedbackTimer();
    docxFeedbackTimer = setTimeout(() => {
      docxFeedbackTimer = null;
      btnCopyDocx.textContent = original;
    }, 1000);
  };

  const syncEditorControls = () => {
    const hasNote = Boolean(currentNote);
    const editable = controlsEnabled && hasNote && editorMode === 'edit';

    setButtonEnabled(btnSave, editable);
    setButtonEnabled(btnDelete, controlsEnabled && hasNote);
    setButtonEnabled(btnCopy, controlsEnabled && hasNote && !copying);
    setButtonEnabled(btnCopyMd, controlsEnabled && hasNote && !exporting);
    setButtonEnabled(btnCopyDocx, controlsEnabled && hasNote && !exportingDocx);
    setButtonEnabled(btnToggleEdit, controlsEnabled && hasNote);

    titleInput.disabled = !editable;
    folderSelect.disabled = !editable;
    tagsInput.disabled = !editable;
    textarea.disabled = !editable;
  };

  const setEditorMode = (mode, { focus } = {}) => {
    editorMode = mode === 'edit' ? 'edit' : 'preview';
    if (root) root.dataset.editorMode = editorMode;
    if (btnToggleEdit) btnToggleEdit.textContent = editorMode === 'edit' ? '预览' : '编辑';
    syncEditorControls();
    if (focus && editorMode === 'edit') {
      try {
        textarea.focus();
      } catch {
        // ignore
      }
    }
  };

  const copyPlainText = async (text) => {
    const value = typeof text === 'string' ? text : String(text ?? '');
    if (typeof navigator !== 'undefined' && navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return;
    }
    const el = document.createElement('textarea');
    el.value = value;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.top = '-1000px';
    el.style.left = '-1000px';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    el.setSelectionRange(0, el.value.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    if (!ok) throw new Error('copy failed');
  };

  const sanitizeFileName = (value) => {
    const base = normalizeString(value);
    if (!base) return 'note';
    const cleaned = base.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
    return cleaned || 'note';
  };

  const buildMarkdownFileName = (note) => {
    const base = sanitizeFileName(note?.title || '');
    return base.toLowerCase().endsWith('.md') ? base : `${base}.md`;
  };

  const buildDocxFileName = (note) => {
    const base = sanitizeFileName(note?.title || '');
    return base.toLowerCase().endsWith('.docx') ? base : `${base}.docx`;
  };

  const downloadBlob = (blob, fileName) => {
    if (typeof document === 'undefined' || typeof URL === 'undefined') {
      throw new Error('download not supported');
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // ignore
      }
    }, 1000);
  };

  const downloadMarkdown = (content, fileName) => {
    const text = typeof content === 'string' ? content : String(content ?? '');
    const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, fileName || 'note.md');
  };

  const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  const encodeUtf8 = (value) => {
    const text = typeof value === 'string' ? value : String(value ?? '');
    if (textEncoder) return textEncoder.encode(text);
    const encoded = unescape(encodeURIComponent(text));
    const out = new Uint8Array(encoded.length);
    for (let i = 0; i < encoded.length; i += 1) out[i] = encoded.charCodeAt(i);
    return out;
  };

  const escapeXml = (value) =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&apos;');

  const DOCX_MONO_FONT = 'Consolas';
  const INLINE_TOKEN_RE = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|!\[[^\]]*]\([^)]+\)|\[[^\]]+]\([^)]+\))/g;
  const HEADING_SIZES = [32, 28, 24, 22, 20, 18];

  const tokenizeInline = (text) => {
    const out = [];
    const value = String(text ?? '');
    let lastIndex = 0;
    let match = null;
    INLINE_TOKEN_RE.lastIndex = 0;
    while ((match = INLINE_TOKEN_RE.exec(value)) !== null) {
      if (match.index > lastIndex) {
        out.push({ text: value.slice(lastIndex, match.index), style: {} });
      }
      const token = match[0] || '';
      if (token.startsWith('`')) {
        out.push({ text: token.slice(1, -1), style: { font: DOCX_MONO_FONT } });
      } else if (token.startsWith('**')) {
        out.push({ text: token.slice(2, -2), style: { bold: true } });
      } else if (token.startsWith('*')) {
        out.push({ text: token.slice(1, -1), style: { italic: true } });
      } else if (token.startsWith('![')) {
        const imageMatch = token.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
        if (imageMatch) {
          const alt = imageMatch[1] || 'image';
          const url = imageMatch[2] || '';
          out.push({ text: `${alt} (${url})`, style: { italic: true } });
        } else {
          out.push({ text: token, style: {} });
        }
      } else if (token.startsWith('[')) {
        const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
        if (linkMatch) {
          const label = linkMatch[1] || '';
          const url = linkMatch[2] || '';
          out.push({ text: label, style: { underline: true, color: '0000FF' } });
          if (url) out.push({ text: ` (${url})`, style: {} });
        } else {
          out.push({ text: token, style: {} });
        }
      } else {
        out.push({ text: token, style: {} });
      }
      lastIndex = match.index + token.length;
    }
    if (lastIndex < value.length) {
      out.push({ text: value.slice(lastIndex), style: {} });
    }
    return out;
  };

  const buildRun = (text, style = {}) => {
    const value = String(text ?? '');
    if (!value) return '';
    const props = [];
    if (style.bold) props.push('<w:b/>');
    if (style.italic) props.push('<w:i/>');
    if (style.underline) props.push('<w:u w:val="single"/>');
    if (style.color) props.push(`<w:color w:val="${style.color}"/>`);
    if (style.font) {
      props.push(
        `<w:rFonts w:ascii="${style.font}" w:hAnsi="${style.font}" w:cs="${style.font}"/>`
      );
    }
    if (style.size) props.push(`<w:sz w:val="${style.size}"/>`);
    const rPr = props.length ? `<w:rPr>${props.join('')}</w:rPr>` : '';
    return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r>`;
  };

  const renderInlineRuns = (text, baseStyle = {}) => {
    const segments = tokenizeInline(text);
    if (!segments.length) return '';
    return segments
      .map((seg) => buildRun(seg.text, { ...baseStyle, ...seg.style }))
      .join('');
  };

  const buildRunsFromLines = (lines, { baseStyle = {}, code = false } = {}) => {
    const out = [];
    const list = Array.isArray(lines) ? lines : [];
    list.forEach((line, index) => {
      const text = String(line ?? '');
      if (code) {
        const safe = text === '' ? ' ' : text;
        out.push(buildRun(safe, { ...baseStyle, font: DOCX_MONO_FONT }));
      } else {
        out.push(renderInlineRuns(text, baseStyle));
      }
      if (index < list.length - 1) out.push('<w:r><w:br/></w:r>');
    });
    return out.join('');
  };

  const renderParagraphFromRuns = (
    runs,
    { indent, hanging, spacingBefore, spacingAfter, shading } = {}
  ) => {
    const pPrParts = [];
    if (indent) {
      const hangingAttr = hanging ? ` w:hanging="${hanging}"` : '';
      pPrParts.push(`<w:ind w:left="${indent}"${hangingAttr}/>`);
    }
    if (spacingBefore || spacingAfter) {
      const beforeAttr = spacingBefore ? ` w:before="${spacingBefore}"` : '';
      const afterAttr = spacingAfter ? ` w:after="${spacingAfter}"` : '';
      pPrParts.push(`<w:spacing${beforeAttr}${afterAttr}/>`);
    }
    if (shading) {
      pPrParts.push(`<w:shd w:val="clear" w:color="auto" w:fill="${shading}"/>`);
    }
    const pPr = pPrParts.length ? `<w:pPr>${pPrParts.join('')}</w:pPr>` : '';
    const safeRuns = runs || '<w:r><w:t xml:space="preserve"></w:t></w:r>';
    return `<w:p>${pPr}${safeRuns}</w:p>`;
  };

  const renderParagraph = (lines, { baseStyle, indent, hanging, code, shading, spacingAfter } = {}) => {
    const runs = buildRunsFromLines(lines, { baseStyle, code });
    return renderParagraphFromRuns(runs, {
      indent,
      hanging,
      shading: shading || (code ? 'EFEFEF' : undefined),
      spacingAfter,
    });
  };

  const parseMarkdownBlocks = (md) => {
    const text = String(md ?? '').replace(/\r\n/g, '\n');
    const lines = text.split('\n');
    const blocks = [];
    let paragraph = [];
    let inCode = false;
    let codeLines = [];
    let listMode = '';
    let listItems = [];

    const flushParagraph = () => {
      if (!paragraph.length) return;
      blocks.push({ type: 'paragraph', lines: paragraph.slice() });
      paragraph = [];
    };

    const closeList = () => {
      if (!listMode) return;
      blocks.push({ type: listMode, items: listItems.slice() });
      listMode = '';
      listItems = [];
    };

    lines.forEach((rawLine) => {
      const line = String(rawLine ?? '');
      const trimmedEnd = line.trimEnd();
      const trimmed = trimmedEnd.trim();

      const fence = trimmed.match(/^```(\S+)?\s*$/);
      if (fence) {
        flushParagraph();
        closeList();
        if (!inCode) {
          inCode = true;
          codeLines = [];
        } else {
          inCode = false;
          blocks.push({ type: 'code', lines: codeLines.slice() });
          codeLines = [];
        }
        return;
      }

      if (inCode) {
        codeLines.push(trimmedEnd);
        return;
      }

      if (!trimmed) {
        flushParagraph();
        closeList();
        return;
      }

      const heading = trimmedEnd.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        closeList();
        blocks.push({ type: 'heading', level: Math.min(6, heading[1].length), text: heading[2] });
        return;
      }

      const quote = trimmedEnd.match(/^>\s?(.*)$/);
      if (quote) {
        flushParagraph();
        closeList();
        blocks.push({ type: 'blockquote', text: quote[1] || '' });
        return;
      }

      const ul = trimmed.match(/^[-*+]\s+(.+)$/);
      if (ul) {
        flushParagraph();
        if (listMode && listMode !== 'ul') closeList();
        if (!listMode) listMode = 'ul';
        listItems.push(ul[1]);
        return;
      }

      const ol = trimmed.match(/^\d+\.\s+(.+)$/);
      if (ol) {
        flushParagraph();
        if (listMode && listMode !== 'ol') closeList();
        if (!listMode) listMode = 'ol';
        listItems.push(ol[1]);
        return;
      }

      paragraph.push(trimmedEnd);
    });

    flushParagraph();
    closeList();
    if (inCode) {
      blocks.push({ type: 'code', lines: codeLines.slice() });
    }
    return blocks;
  };

  const renderListItem = (prefix, text) => {
    const runs = buildRun(prefix) + renderInlineRuns(text);
    return renderParagraphFromRuns(runs, { indent: 720, hanging: 360 });
  };

  const renderDocxBlock = (block) => {
    if (!block) return '';
    switch (block.type) {
      case 'heading': {
        const size = HEADING_SIZES[Math.min(6, Math.max(1, block.level || 1)) - 1] || 24;
        return renderParagraph([block.text || ''], {
          baseStyle: { bold: true, size },
          spacingAfter: 120,
        });
      }
      case 'blockquote':
        return renderParagraph([block.text || ''], {
          baseStyle: { italic: true, color: '666666' },
          indent: 720,
        });
      case 'code':
        return renderParagraph(block.lines || [''], {
          baseStyle: { font: DOCX_MONO_FONT, size: 20 },
          indent: 720,
          code: true,
        });
      case 'ul':
        return (block.items || []).map((item) => renderListItem('• ', item)).join('');
      case 'ol':
        return (block.items || [])
          .map((item, index) => renderListItem(`${index + 1}. `, item))
          .join('');
      case 'paragraph':
      default:
        return renderParagraph(block.lines || ['']);
    }
  };

  const buildDocxDocumentXml = (content) => {
    const blocks = parseMarkdownBlocks(content);
    const body = blocks.length ? blocks.map((block) => renderDocxBlock(block)).join('') : renderParagraph(['']);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${body}
    <w:sectPr>
      <w:pgSz w:w="12240" w:h="15840"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="720" w:footer="720" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
  };

  const buildDocxFiles = (content, { title, now } = {}) => {
    const safeTitle = escapeXml(title || '');
    const stamp = (now || new Date()).toISOString();
    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
    const coreProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
  xmlns:dc="http://purl.org/dc/elements/1.1/"
  xmlns:dcterms="http://purl.org/dc/terms/"
  xmlns:dcmitype="http://purl.org/dc/dcmitype/"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${safeTitle}</dc:title>
  <dc:creator>ChatOS Notepad</dc:creator>
  <cp:lastModifiedBy>ChatOS Notepad</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${stamp}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${stamp}</dcterms:modified>
</cp:coreProperties>`;
    const appProps = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
  xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>ChatOS Notepad</Application>
</Properties>`;
    const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    return [
      { name: '[Content_Types].xml', data: encodeUtf8(contentTypes) },
      { name: '_rels/.rels', data: encodeUtf8(rootRels) },
      { name: 'docProps/core.xml', data: encodeUtf8(coreProps) },
      { name: 'docProps/app.xml', data: encodeUtf8(appProps) },
      { name: 'word/document.xml', data: encodeUtf8(buildDocxDocumentXml(content)) },
      { name: 'word/_rels/document.xml.rels', data: encodeUtf8(documentRels) },
    ];
  };

  const getDosDateTime = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const seconds = date.getSeconds();
    const dosTime = (hours << 11) | (minutes << 5) | Math.floor(seconds / 2);
    const dosDate = ((year - 1980) << 9) | (month << 5) | day;
    return { dosTime, dosDate };
  };

  const CRC32_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let c = i;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[i] = c >>> 0;
    }
    return table;
  })();

  const crc32 = (data) => {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i += 1) {
      crc = CRC32_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
  };

  const createZipBlob = (files, { now, mime } = {}) => {
    const stamp = now instanceof Date ? now : new Date();
    const { dosTime, dosDate } = getDosDateTime(stamp);
    const localChunks = [];
    const centralChunks = [];
    let offset = 0;
    let centralSize = 0;
    const generalPurposeFlag = 0x0800;
    files.forEach((file) => {
      const nameBytes = encodeUtf8(file.name);
      const data = file.data || new Uint8Array();
      const crc = crc32(data);
      const localHeader = new Uint8Array(30 + nameBytes.length);
      const localView = new DataView(localHeader.buffer);
      localView.setUint32(0, 0x04034b50, true);
      localView.setUint16(4, 20, true);
      localView.setUint16(6, generalPurposeFlag, true);
      localView.setUint16(8, 0, true);
      localView.setUint16(10, dosTime, true);
      localView.setUint16(12, dosDate, true);
      localView.setUint32(14, crc, true);
      localView.setUint32(18, data.length, true);
      localView.setUint32(22, data.length, true);
      localView.setUint16(26, nameBytes.length, true);
      localView.setUint16(28, 0, true);
      localHeader.set(nameBytes, 30);
      localChunks.push(localHeader, data);
      const centralHeader = new Uint8Array(46 + nameBytes.length);
      const centralView = new DataView(centralHeader.buffer);
      centralView.setUint32(0, 0x02014b50, true);
      centralView.setUint16(4, 20, true);
      centralView.setUint16(6, 20, true);
      centralView.setUint16(8, generalPurposeFlag, true);
      centralView.setUint16(10, 0, true);
      centralView.setUint16(12, dosTime, true);
      centralView.setUint16(14, dosDate, true);
      centralView.setUint32(16, crc, true);
      centralView.setUint32(20, data.length, true);
      centralView.setUint32(24, data.length, true);
      centralView.setUint16(28, nameBytes.length, true);
      centralView.setUint16(30, 0, true);
      centralView.setUint16(32, 0, true);
      centralView.setUint16(34, 0, true);
      centralView.setUint16(36, 0, true);
      centralView.setUint32(38, 0, true);
      centralView.setUint32(42, offset, true);
      centralHeader.set(nameBytes, 46);
      centralChunks.push(centralHeader);
      centralSize += centralHeader.length;
      offset += localHeader.length + data.length;
    });
    const centralOffset = offset;
    const endRecord = new Uint8Array(22);
    const endView = new DataView(endRecord.buffer);
    endView.setUint32(0, 0x06054b50, true);
    endView.setUint16(4, 0, true);
    endView.setUint16(6, 0, true);
    endView.setUint16(8, files.length, true);
    endView.setUint16(10, files.length, true);
    endView.setUint32(12, centralSize, true);
    endView.setUint32(16, centralOffset, true);
    endView.setUint16(20, 0, true);
    return new Blob([...localChunks, ...centralChunks, endRecord], { type: mime || 'application/zip' });
  };

  const createDocxBlob = (content, { title, now } = {}) => {
    const files = buildDocxFiles(content, { title, now });
    return createZipBlob(files, { now, mime: DOCX_MIME });
  };

  const downloadDocx = (content, fileName, meta) => {
    const blob = createDocxBlob(content, meta);
    downloadBlob(blob, fileName || 'note.docx');
  };

  const setControlsEnabled = (enabled) => {
    controlsEnabled = enabled;
    setButtonEnabled(btnNewFolder, enabled);
    setButtonEnabled(btnNewNote, enabled);
    searchInput.disabled = !enabled;
    setButtonEnabled(btnClearSearch, enabled);
    syncEditorControls();
  };

  const updateCreateHint = () => {
    const label = selectedFolder ? selectedFolder : '根目录';
    createHint.textContent = `新笔记将创建在：${label}`;
  };

  const showFolderMenu = (x, y, f) => {
    showMenu(x, y, [
      {
        label: '设为当前文件夹',
        onClick: async () => {
          selectedFolder = f;
          activeTreeKey = f;
          updateCreateHint();
          renderFolderList();
        },
      },
      {
        label: '在此新建笔记…',
        onClick: async () => {
          if (!(await ensureSafeToSwitch())) return;
          const values = await showDialog({
            title: '新建笔记',
            description: `目标文件夹：${f ? f : '根目录'}`,
            fields: [{ name: 'title', label: '标题', kind: 'text', value: '', placeholder: '可空' }],
            confirmText: '创建',
          });
          if (!values) return;
          const noteTitle = normalizeString(values.title);
          setStatus('Notes: creating note...', 'bad');
          const res = await api.createNote({ folder: f, title: noteTitle });
          if (!res?.ok) {
            setStatus(`Notes: ${res?.message || 'create note failed'}`, 'bad');
            return;
          }
          selectedFolder = f;
          updateCreateHint();
          await refreshFoldersAndTags();
          await refreshNotes();
          const id = res?.note?.id || '';
          if (id) await openNote(id);
          setStatus('Notes: note created', 'ok');
        },
      },
      {
        label: '新建子文件夹…',
        onClick: async () => {
          if (!(await ensureSafeToSwitch())) return;
          const values = await showDialog({
            title: '新建文件夹',
            fields: [
              {
                name: 'folder',
                label: '文件夹路径',
                kind: 'text',
                value: f ? `${f}/` : '',
                placeholder: '例如：work/ideas',
                required: true,
              },
            ],
            confirmText: '创建',
          });
          if (!values) return;
          const folder = normalizeString(values.folder);
          if (!folder) return;
          setStatus('Notes: creating folder...', 'bad');
          const res = await api.createFolder({ folder });
          if (!res?.ok) {
            setStatus(`Notes: ${res?.message || 'create folder failed'}`, 'bad');
            return;
          }
          selectedFolder = res?.folder || folder;
          updateCreateHint();
          await refreshFoldersAndTags();
          await refreshNotes();
          setStatus('Notes: folder created', 'ok');
        },
      },
      {
        label: '重命名文件夹…',
        disabled: !f,
        onClick: async () => {
          if (!(await ensureSafeToSwitch())) return;
          const values = await showDialog({
            title: '重命名文件夹',
            description: `当前：${f}`,
            fields: [{ name: 'to', label: '新路径', kind: 'text', value: f, placeholder: '例如：work/notes', required: true }],
            confirmText: '重命名',
          });
          if (!values) return;
          const to = normalizeString(values.to);
          if (!to) return;
          setStatus('Notes: renaming folder...', 'bad');
          const res = await api.renameFolder({ from: f, to });
          if (!res?.ok) {
            setStatus(`Notes: ${res?.message || 'rename failed'}`, 'bad');
            return;
          }
          if (selectedFolder === f) {
            selectedFolder = to;
          } else if (selectedFolder.startsWith(`${f}/`)) {
            selectedFolder = `${to}/${selectedFolder.slice(f.length + 1)}`;
          }
          if (currentNote?.folder === f) {
            currentNote.folder = to;
          } else if (currentNote?.folder && String(currentNote.folder).startsWith(`${f}/`)) {
            currentNote.folder = `${to}/${String(currentNote.folder).slice(f.length + 1)}`;
          }
          updateCreateHint();
          await refreshFoldersAndTags();
          await refreshNotes();
          renderEditor(true);
          setStatus('Notes: folder renamed', 'ok');
        },
      },
      {
        label: '删除文件夹（递归）',
        disabled: !f,
        danger: true,
        onClick: async () => {
          if (!(await ensureSafeToSwitch())) return;
          const ok = await confirmDialog(`确定删除文件夹「${f}」及其所有子目录与笔记吗？`, {
            title: '删除文件夹',
            danger: true,
            confirmText: '删除',
          });
          if (!ok) return;
          setStatus('Notes: deleting folder...', 'bad');
          const res = await api.deleteFolder({ folder: f, recursive: true });
          if (!res?.ok) {
            setStatus(`Notes: ${res?.message || 'delete folder failed'}`, 'bad');
            return;
          }
          if (selectedFolder === f || selectedFolder.startsWith(`${f}/`)) {
            selectedFolder = '';
          }
          updateCreateHint();
          await refreshFoldersAndTags();
          await refreshNotes();
          renderEditor(true);
          setStatus('Notes: folder deleted', 'ok');
        },
      },
    ]);
  };

  const showNoteMenu = (x, y, n) => {
    const noteId = normalizeString(n?.id);
    if (!noteId) return;
    showMenu(x, y, [
      {
        label: noteId === selectedNoteId ? '当前已打开' : '打开',
        disabled: noteId === selectedNoteId,
        onClick: async () => {
          if (noteId === selectedNoteId) return;
          if (!(await ensureSafeToSwitch())) return;
          await openNote(noteId);
        },
      },
      {
        label: '重命名…',
        onClick: async () => {
          const values = await showDialog({
            title: '重命名笔记',
            description: `ID: ${noteId}`,
            fields: [{ name: 'title', label: '标题', kind: 'text', value: n?.title || '', placeholder: '例如：周报', required: true }],
            confirmText: '重命名',
          });
          if (!values) return;
          const nextTitle = normalizeString(values.title);
          if (!nextTitle) return;
          if (noteId === selectedNoteId && currentNote) {
            currentNote.title = nextTitle;
            try {
              titleInput.value = nextTitle;
            } catch {
              // ignore
            }
            dirty = true;
            renderEditor(false);
            await doSave();
            return;
          }
          setStatus('Notes: updating note...', 'bad');
          const res = await api.updateNote({ id: noteId, title: nextTitle });
          if (!res?.ok) {
            setStatus(`Notes: ${res?.message || 'update failed'}`, 'bad');
            return;
          }
          await refreshFoldersAndTags();
          await refreshNotes();
          setStatus('Notes: note updated', 'ok');
        },
      },
      {
        label: '移动到文件夹…',
        onClick: async () => {
          const options = (Array.isArray(folders) ? folders : ['']).map((f) => ({ value: f, label: f ? f : '（根目录）' }));
          const values = await showDialog({
            title: '移动笔记',
            description: `当前：${n?.folder ? n.folder : '根目录'}`,
            fields: [{ name: 'folder', label: '目标文件夹', kind: 'select', options, value: n?.folder || '' }],
            confirmText: '移动',
          });
          if (!values) return;
          const nextFolder = normalizeString(values.folder);
          if (noteId === selectedNoteId && currentNote) {
            currentNote.folder = nextFolder;
            try {
              folderSelect.value = nextFolder;
            } catch {
              // ignore
            }
            dirty = true;
            renderEditor(false);
            await doSave();
            return;
          }
          setStatus('Notes: moving note...', 'bad');
          const res = await api.updateNote({ id: noteId, folder: nextFolder });
          if (!res?.ok) {
            setStatus(`Notes: ${res?.message || 'move failed'}`, 'bad');
            return;
          }
          await refreshFoldersAndTags();
          await refreshNotes();
          setStatus('Notes: note moved', 'ok');
        },
      },
      {
        label: '设置标签…',
        onClick: async () => {
          const values = await showDialog({
            title: '设置标签',
            description: '用逗号分隔，例如：work, todo',
            fields: [{ name: 'tags', label: '标签', kind: 'text', value: tagsToText(n?.tags), placeholder: 'tag1, tag2' }],
            confirmText: '应用',
          });
          if (!values) return;
          const nextTags = parseTags(values.tags);
          if (noteId === selectedNoteId && currentNote) {
            currentNote.tags = nextTags;
            try {
              tagsInput.value = tagsToText(nextTags);
            } catch {
              // ignore
            }
            dirty = true;
            renderEditor(false);
            await doSave();
            return;
          }
          setStatus('Notes: updating tags...', 'bad');
          const res = await api.updateNote({ id: noteId, tags: nextTags });
          if (!res?.ok) {
            setStatus(`Notes: ${res?.message || 'update failed'}`, 'bad');
            return;
          }
          await refreshFoldersAndTags();
          await refreshNotes();
          setStatus('Notes: tags updated', 'ok');
        },
      },
      {
        label: '删除',
        danger: true,
        onClick: async () => {
          if (noteId === selectedNoteId && currentNote) {
            await doDelete();
            return;
          }
          const ok = await confirmDialog(`确定删除「${n?.title || 'Untitled'}」吗？`, {
            title: '删除笔记',
            danger: true,
            confirmText: '删除',
          });
          if (!ok) return;
          setStatus('Notes: deleting note...', 'bad');
          const res = await api.deleteNote({ id: noteId });
          if (!res?.ok) {
            setStatus(`Notes: ${res?.message || 'delete failed'}`, 'bad');
            return;
          }
          await refreshFoldersAndTags();
          await refreshNotes();
          setStatus('Notes: note deleted', 'ok');
        },
      },
    ]);
  };

  const showTreeMenu = (x, y, key) => {
    const parsed = parseTreeKey(key);
    if (parsed.kind === 'note') {
      const note = noteIndex.get(parsed.noteId);
      if (note) showNoteMenu(x, y, note);
      return;
    }
    showFolderMenu(x, y, parsed.folder);
  };

  const folderTree = createDsPathTreeView({
    container: folderList,
    getLabel: (key) => {
      const parsed = parseTreeKey(key);
      if (parsed.kind === 'note') {
        const note = noteIndex.get(parsed.noteId);
        return note?.title || 'Untitled';
      }
      return parsed.folder ? parsed.folder.split('/').slice(-1)[0] : '（根目录）';
    },
    getTitle: (key) => {
      const parsed = parseTreeKey(key);
      if (parsed.kind === 'note') {
        const note = noteIndex.get(parsed.noteId);
        const folderText = parsed.folder ? parsed.folder : '根目录';
        const updatedAt = note?.updatedAt ? ` · ${note.updatedAt}` : '';
        return `${note?.title || 'Untitled'} · ${folderText}${updatedAt}`;
      }
      return parsed.folder ? parsed.folder : '全部笔记的根目录';
    },
    getIconClass: (key) => {
      const parsed = parseTreeKey(key);
      if (parsed.kind === 'note') return 'ds-tree-icon-note';
      return parsed.folder ? 'ds-tree-icon-folder' : 'ds-tree-icon-home';
    },
    getSortMeta: (key) => {
      if (!key) return { group: -1, label: '' };
      const parsed = parseTreeKey(key);
      if (parsed.kind === 'note') {
        const note = noteIndex.get(parsed.noteId);
        return { group: 1, label: note?.title || 'Untitled' };
      }
      return { group: 0, label: parsed.folder.split('/').slice(-1)[0] };
    },
    onSelect: async (key) => {
      if (disposed) return;
      const parsed = parseTreeKey(key);
      if (parsed.kind === 'note') {
        const noteId = parsed.noteId;
        if (!noteId) return;
        if (noteId === selectedNoteId) {
          if (activeTreeKey !== key) {
            activeTreeKey = key;
            renderFolderList();
          }
          return;
        }
        if (!(await ensureSafeToSwitch())) return;
        if (selectedFolder !== parsed.folder) {
          selectedFolder = parsed.folder;
          updateCreateHint();
        }
        activeTreeKey = key;
        renderFolderList();
        await openNote(noteId);
        return;
      }
      const folder = parsed.folder;
      if (folder === selectedFolder && activeTreeKey === folder) return;
      activeTreeKey = folder;
      selectedFolder = folder;
      updateCreateHint();
      renderFolderList();
    },
    onContextMenu: (ev, key) => {
      if (disposed) return;
      showTreeMenu(ev?.clientX ?? 0, ev?.clientY ?? 0, key);
    },
  });

  const ensureSafeToSwitch = async () => {
    if (!dirty) return true;
    return await confirmDialog('当前笔记有未保存的修改，确定丢弃并继续吗？', {
      title: '未保存的更改',
      danger: true,
      confirmText: '丢弃并继续',
    });
  };

  const renderFolderOptions = () => {
    folderSelect.innerHTML = '';
    const opts = [''].concat(folders.filter((f) => f !== ''));
    for (const f of opts) {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f ? f : '（根目录）';
      folderSelect.appendChild(opt);
    }
  };

  const renderFolderList = () => {
    const query = normalizeString(searchInput.value);
    const isFiltering = Boolean(query) || selectedTags.length > 0;

    const paths = isFiltering ? [] : Array.isArray(folders) ? [...folders] : [];
    if (isFiltering && selectedFolder) paths.push(selectedFolder);
    const currentId = normalizeString(currentNote?.id);
    (Array.isArray(notes) ? notes : []).forEach((n) => {
      const id = normalizeString(n?.id);
      if (!id) return;
      if (currentId && id === currentId) return;
      paths.push(makeNoteKey(n?.folder, id));
    });
    if (currentId) {
      paths.push(makeNoteKey(normalizeString(currentNote?.folder) || selectedFolder, currentId));
    }

    const fallbackKey = selectedNoteId
      ? makeNoteKey(normalizeString(currentNote?.folder) || selectedFolder, selectedNoteId)
      : selectedFolder;
    const selectedKey = activeTreeKey || fallbackKey;

    const parsed = parseTreeKey(selectedKey);
    const folderToExpand = parsed.kind === 'note' ? parsed.folder : parsed.folder;
    if (!isFiltering && searchWasActive) {
      searchWasActive = false;
      folderTree.setExpandedKeys(Array.isArray(expandedKeysBeforeSearch) ? expandedKeysBeforeSearch : ['']);
      expandedKeysBeforeSearch = null;
    }

    if (isFiltering && !searchWasActive) {
      searchWasActive = true;
      expandedKeysBeforeSearch = folderTree.getExpandedKeys();
    }

    const expanded = new Set(isFiltering ? [''] : folderTree.getExpandedKeys());
    expanded.add('');
    if (folderToExpand) expanded.add(folderToExpand);
    if (isFiltering) {
      const addFolderAndParents = (folder) => {
        const value = normalizeString(folder);
        if (!value) return;
        const parts = value.split('/').filter(Boolean);
        let acc = '';
        for (const part of parts) {
          acc = acc ? `${acc}/${part}` : part;
          expanded.add(acc);
        }
      };
      notes.forEach((n) => addFolderAndParents(n?.folder));
      addFolderAndParents(selectedFolder);
      if (currentNote?.folder) addFolderAndParents(currentNote.folder);
    }
    folderTree.setExpandedKeys(Array.from(expanded));

    folderTree.render({ paths, selectedKey });
  };

  const renderTags = () => {
    if (!tagRow || !tagRow.isConnected) return;
    tagRow.innerHTML = '';
    if (!Array.isArray(tags) || tags.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'np-meta';
      empty.textContent = '暂无标签';
      tagRow.appendChild(empty);
      return;
    }
    for (const t of tags) {
      const chip = document.createElement('div');
      chip.className = 'np-chip';
      chip.dataset.active = selectedTags.some((x) => x.toLowerCase() === String(t.tag || '').toLowerCase()) ? '1' : '0';
      chip.textContent = `${t.tag} (${t.count})`;
      chip.addEventListener('click', async () => {
        if (disposed) return;
        const key = String(t.tag || '').toLowerCase();
        const idx = selectedTags.findIndex((x) => x.toLowerCase() === key);
        if (idx >= 0) selectedTags.splice(idx, 1);
        else selectedTags.push(t.tag);
        await refreshNotes();
        renderTags();
      });
      tagRow.appendChild(chip);
    }
  };

  const renderEditor = (force = false) => {
    if (!currentNote) {
      infoBox.textContent = '未选择笔记';
      titleInput.value = '';
      tagsInput.value = '';
      textarea.value = '';
      preview.innerHTML = '<div class="np-meta">预览区</div>';
      setEditorMode('preview');
      return;
    }
    infoBox.textContent = dirty ? `未保存 · ${currentNote.updatedAt || ''}` : `${currentNote.updatedAt || ''}`;
    if (force || document.activeElement !== titleInput) titleInput.value = currentNote.title || '';
    if (force || document.activeElement !== folderSelect) folderSelect.value = currentNote.folder || '';
    if (force || document.activeElement !== tagsInput) tagsInput.value = tagsToText(currentNote.tags);
    if (force || document.activeElement !== textarea) textarea.value = currentContent;
    preview.innerHTML = renderMarkdown(currentContent);
    syncEditorControls();
  };

  const refreshFoldersAndTags = async () => {
    const seq = (refreshFoldersSeq += 1);
    let folderRes = null;
    let tagRes = null;
    const shouldLoadTags = Boolean(tagRow && tagRow.isConnected);
    try {
      [folderRes, tagRes] = await Promise.all([
        api.listFolders(),
        shouldLoadTags ? api.listTags() : Promise.resolve({ ok: true, tags: [] }),
      ]);
    } catch (err) {
      if (disposed || seq !== refreshFoldersSeq) return;
      setStatus(`Notes: ${err?.message || String(err)}`, 'bad');
      return;
    }
    if (disposed || seq !== refreshFoldersSeq) return;

    folders = Array.isArray(folderRes?.folders) ? folderRes.folders : [''];
    if (!folders.includes('')) folders.unshift('');
    tags = Array.isArray(tagRes?.tags) ? tagRes.tags : [];
    renderFolderOptions();
    renderFolderList();
    if (shouldLoadTags) renderTags();
  };

  const refreshNotes = async () => {
    const seq = (refreshNotesSeq += 1);
    const query = normalizeString(searchInput.value);
    const includeContent = query.length >= 2;
    let res = null;
    try {
      if (!query || !includeContent) {
        res = await api.listNotes({
          folder: '',
          recursive: true,
          tags: selectedTags,
          match: 'all',
          query,
          limit: 500,
        });
      } else {
        res = await api.searchNotes({
          query,
          folder: '',
          recursive: true,
          tags: selectedTags,
          match: 'all',
          includeContent: true,
          limit: 200,
        });
      }
    } catch (err) {
      if (disposed || seq !== refreshNotesSeq) return;
      setStatus(`Notes: ${err?.message || String(err)}`, 'bad');
      return;
    }
    if (disposed || seq !== refreshNotesSeq) return;

    if (!res?.ok) {
      notes = [];
      setStatus(`Notes: ${res?.message || 'list notes failed'}`, 'bad');
    } else {
      notes = Array.isArray(res?.notes) ? res.notes : [];
    }
    noteIndex.clear();
    notes.forEach((n) => {
      const id = normalizeString(n?.id);
      if (!id) return;
      noteIndex.set(id, n);
    });
    const currentId = normalizeString(currentNote?.id);
    if (currentId && currentNote) noteIndex.set(currentId, currentNote);
    renderFolderList();
  };

  const openNote = async (id) => {
    const seq = (openNoteSeq += 1);
    let res = null;
    try {
      res = await api.getNote({ id });
    } catch (err) {
      if (disposed || seq !== openNoteSeq) return false;
      setStatus(`Notes: ${err?.message || String(err)}`, 'bad');
      return false;
    }
    if (disposed || seq !== openNoteSeq) return false;
    if (!res?.ok) {
      setStatus(`Notes: ${res?.message || 'load failed'}`, 'bad');
      return false;
    }
    selectedNoteId = id;
    currentNote = res.note || null;
    currentContent = String(res.content ?? '');
    dirty = false;
    setEditorMode('preview');
    activeTreeKey = makeNoteKey(res.note?.folder, id);
    if (currentNote) noteIndex.set(id, currentNote);
    renderFolderList();
    renderEditor(true);
    return true;
  };

  const doSave = async () => {
    if (!currentNote) return;
    const nextTitle = normalizeString(titleInput.value);
    const nextFolder = normalizeString(folderSelect.value);
    const nextTags = parseTags(tagsInput.value);
    let res = null;
    try {
      res = await api.updateNote({ id: currentNote.id, title: nextTitle, folder: nextFolder, tags: nextTags, content: currentContent });
    } catch (err) {
      setStatus(`Notes: ${err?.message || String(err)}`, 'bad');
      return;
    }
    if (!res?.ok) {
      setStatus(`Notes: ${res?.message || 'save failed'}`, 'bad');
      return;
    }
    currentNote = res.note || currentNote;
    dirty = false;
    setStatus('Notes: saved', 'ok');
    await refreshFoldersAndTags();
    await refreshNotes();
    renderEditor(true);
  };

  const doDelete = async () => {
    if (!currentNote) return;
    const ok = await confirmDialog(`确定删除「${currentNote.title || 'Untitled'}」吗？`, {
      title: '删除笔记',
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    let res = null;
    try {
      res = await api.deleteNote({ id: currentNote.id });
    } catch (err) {
      setStatus(`Notes: ${err?.message || String(err)}`, 'bad');
      return;
    }
    if (!res?.ok) {
      setStatus(`Notes: ${res?.message || 'delete failed'}`, 'bad');
      return;
    }
    selectedNoteId = '';
    currentNote = null;
    currentContent = '';
    dirty = false;
    setStatus('Notes: deleted', 'ok');
    await refreshFoldersAndTags();
    await refreshNotes();
    renderEditor(true);
  };

  btnNewFolder.addEventListener('click', async () => {
    if (disposed) return;
    const values = await showDialog({
      title: '新建文件夹',
      fields: [
        {
          name: 'folder',
          label: '文件夹路径',
          kind: 'text',
          value: selectedFolder ? `${selectedFolder}/` : '',
          placeholder: '例如：work/ideas',
          required: true,
        },
      ],
      confirmText: '创建',
    });
    if (!values) return;
    const folder = normalizeString(values.folder);
    if (!folder) return;
    setStatus('Notes: creating folder...', 'bad');
    let res = null;
    try {
      res = await api.createFolder({ folder });
    } catch (err) {
      setStatus(`Notes: ${err?.message || String(err)}`, 'bad');
      return;
    }
    if (!res?.ok) {
      setStatus(`Notes: ${res?.message || 'create folder failed'}`, 'bad');
      return;
    }
    const created = normalizeString(res?.folder) || folder;
    if (created && !dirty) {
      selectedFolder = created;
      updateCreateHint();
    }
    await refreshFoldersAndTags();
    if (created && !dirty) {
      await refreshNotes();
    }
    setStatus('Notes: folder created', 'ok');
  });

  btnNewNote.addEventListener('click', async () => {
    if (disposed) return;
    if (!(await ensureSafeToSwitch())) return;
    const values = await showDialog({
      title: '新建笔记',
      description: `目标文件夹：${selectedFolder ? selectedFolder : '根目录'}`,
      fields: [{ name: 'title', label: '标题', kind: 'text', value: '', placeholder: '可空' }],
      confirmText: '创建',
    });
    if (!values) return;
    const title = normalizeString(values.title);
    setStatus('Notes: creating note...', 'bad');
    let res = null;
    try {
      res = await api.createNote({ folder: selectedFolder, title });
    } catch (err) {
      setStatus(`Notes: ${err?.message || String(err)}`, 'bad');
      return;
    }
    if (!res?.ok) {
      setStatus(`Notes: ${res?.message || 'create note failed'}`, 'bad');
      return;
    }
    await refreshFoldersAndTags();
    await refreshNotes();
    const id = res?.note?.id || '';
    if (id) await openNote(id);
    setStatus('Notes: note created', 'ok');
  });

  btnSave.addEventListener('click', () => doSave());
  btnDelete.addEventListener('click', () => doDelete());
  btnToggleEdit.addEventListener('click', () => {
    if (disposed || !currentNote) return;
    setEditorMode(editorMode === 'edit' ? 'preview' : 'edit', { focus: true });
  });
  btnCopy.addEventListener('click', async () => {
    if (disposed || !currentNote || copying) return;
    copying = true;
    syncEditorControls();
    try {
      await copyPlainText(currentContent || '');
      flashCopyFeedback('已复制');
    } catch {
      flashCopyFeedback('复制失败');
    } finally {
      copying = false;
      syncEditorControls();
    }
  });
  btnCopyMd.addEventListener('click', () => {
    if (disposed || !currentNote || exporting) return;
    exporting = true;
    syncEditorControls();
    try {
      const fileName = buildMarkdownFileName(currentNote);
      downloadMarkdown(currentContent || '', fileName);
      flashExportFeedback('已导出');
    } catch {
      flashExportFeedback('导出失败');
    } finally {
      exporting = false;
      syncEditorControls();
    }
  });
  btnCopyDocx.addEventListener('click', () => {
    if (disposed || !currentNote || exportingDocx) return;
    exportingDocx = true;
    syncEditorControls();
    try {
      const fileName = buildDocxFileName(currentNote);
      downloadDocx(currentContent || '', fileName, { title: currentNote?.title || '' });
      flashDocxFeedback('已导出');
    } catch {
      flashDocxFeedback('导出失败');
    } finally {
      exportingDocx = false;
      syncEditorControls();
    }
  });

  searchInput.addEventListener('input', async () => {
    if (disposed) return;
    if (searchDebounceTimer) {
      try {
        clearTimeout(searchDebounceTimer);
      } catch {
        // ignore
      }
    }
    const query = normalizeString(searchInput.value);
    const delayMs = query.length >= 2 ? 320 : 180;
    searchDebounceTimer = setTimeout(() => {
      searchDebounceTimer = null;
      refreshNotes();
    }, delayMs);
  });

  searchInput.addEventListener('keydown', async (ev) => {
    if (disposed) return;
    const key = ev?.key;
    if (key === 'Escape') {
      try {
        ev.preventDefault();
      } catch {
        // ignore
      }
      if (!searchInput.value) return;
      if (searchDebounceTimer) {
        try {
          clearTimeout(searchDebounceTimer);
        } catch {
          // ignore
        }
        searchDebounceTimer = null;
      }
      searchInput.value = '';
      await refreshNotes();
      return;
    }
    if (key !== 'Enter') return;
    if (!normalizeString(searchInput.value)) return;
    if (!(await ensureSafeToSwitch())) return;
    const first = Array.isArray(notes) && notes.length > 0 ? notes[0] : null;
    const id = normalizeString(first?.id);
    if (!id) return;
    try {
      ev.preventDefault();
    } catch {
      // ignore
    }
    await openNote(id);
  });

  btnClearSearch?.addEventListener('click', async () => {
    if (disposed) return;
    if (!searchInput.value) return;
    if (searchDebounceTimer) {
      try {
        clearTimeout(searchDebounceTimer);
      } catch {
        // ignore
      }
      searchDebounceTimer = null;
    }
    searchInput.value = '';
    await refreshNotes();
    try {
      searchInput.focus();
    } catch {
      // ignore
    }
  });

  titleInput.addEventListener('input', () => {
    if (!currentNote) return;
    dirty = true;
    currentNote.title = normalizeString(titleInput.value);
    renderEditor(false);
  });

  folderSelect.addEventListener('change', () => {
    if (!currentNote) return;
    dirty = true;
    currentNote.folder = normalizeString(folderSelect.value);
    renderEditor(false);
  });

  tagsInput.addEventListener('input', () => {
    if (!currentNote) return;
    dirty = true;
    currentNote.tags = parseTags(tagsInput.value);
    renderEditor(false);
  });

  textarea.addEventListener('input', () => {
    if (!currentNote) return;
    dirty = true;
    currentContent = String(textarea.value ?? '');
    renderEditor(false);
  });

  const bootstrap = async () => {
    if (!bridgeEnabled) {
      setControlsEnabled(false);
      setStatus('Notes: bridge disabled (must run in ChatOS desktop UI)', 'bad');
      return;
    }
    setControlsEnabled(false);
    try {
      const res = await api.init();
      if (!res?.ok) {
        setStatus(`Notes: ${res?.message || 'init failed'}`, 'bad');
        return;
      }
      await refreshFoldersAndTags();
      await refreshNotes();
      updateCreateHint();
      setStatus('Notes: ready', 'ok');
      setControlsEnabled(true);
      renderEditor(true);
    } catch (err) {
      setStatus(`Notes: ${err?.message || String(err)}`, 'bad');
    }
  };

  bootstrap();

  return () => {
    disposed = true;
    clearCopyFeedbackTimer();
    clearExportFeedbackTimer();
    clearDocxFeedbackTimer();
    if (searchDebounceTimer) {
      try {
        clearTimeout(searchDebounceTimer);
      } catch {
        // ignore
      }
      searchDebounceTimer = null;
    }
    if (layoutObserver) {
      try {
        layoutObserver.disconnect();
      } catch {
        // ignore
      }
      layoutObserver = null;
    }
    if (layoutResizeHandler && typeof window !== 'undefined') {
      try {
        window.removeEventListener('resize', layoutResizeHandler);
      } catch {
        // ignore
      }
      layoutResizeHandler = null;
    }
    closeActiveLayer();
  };
}
