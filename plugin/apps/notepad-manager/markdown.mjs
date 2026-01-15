function escapeHtml(input) {
  return String(input ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderInlineMd(text) {
  let out = escapeHtml(text);
  out = out.replace(/`([^`]+?)`/g, '<code>$1</code>');
  out = out.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+?)\*/g, '<em>$1</em>');
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img alt="$1" src="$2" />');
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
  return out;
}

export function renderMarkdown(md) {
  const text = String(md || '').replace(/\r\n/g, '\n');
  const lines = text.split('\n');
  let html = '';
  let inCode = false;
  let listMode = '';
  let paragraph = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const content = paragraph.map((l) => renderInlineMd(l)).join('<br />');
    html += `<p>${content}</p>`;
    paragraph = [];
  };

  const closeList = () => {
    if (!listMode) return;
    html += listMode === 'ol' ? '</ol>' : '</ul>';
    listMode = '';
  };

  for (const rawLine of lines) {
    const line = String(rawLine ?? '');
    const trimmed = line.trimEnd();

    const fence = trimmed.trim().match(/^```(\S+)?\s*$/);
    if (fence) {
      flushParagraph();
      closeList();
      if (!inCode) {
        inCode = true;
        const lang = escapeHtml(fence[1] || '');
        html += `<pre><code data-lang="${lang}">`;
      } else {
        inCode = false;
        html += '</code></pre>';
      }
      continue;
    }

    if (inCode) {
      html += `${escapeHtml(line)}\n`;
      continue;
    }

    if (!trimmed.trim()) {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      const level = Math.min(6, heading[1].length);
      html += `<h${level}>${renderInlineMd(heading[2])}</h${level}>`;
      continue;
    }

    const quote = trimmed.match(/^>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeList();
      html += `<blockquote>${renderInlineMd(quote[1] || '')}</blockquote>`;
      continue;
    }

    const ul = trimmed.match(/^[-*+]\s+(.+)$/);
    if (ul) {
      flushParagraph();
      if (listMode && listMode !== 'ul') closeList();
      if (!listMode) {
        listMode = 'ul';
        html += '<ul>';
      }
      html += `<li>${renderInlineMd(ul[1])}</li>`;
      continue;
    }

    const ol = trimmed.match(/^\d+\.\s+(.+)$/);
    if (ol) {
      flushParagraph();
      if (listMode && listMode !== 'ol') closeList();
      if (!listMode) {
        listMode = 'ol';
        html += '<ol>';
      }
      html += `<li>${renderInlineMd(ol[1])}</li>`;
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  closeList();
  if (inCode) html += '</code></pre>';
  return html;
}

