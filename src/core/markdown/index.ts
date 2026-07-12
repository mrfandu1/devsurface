/**
 * A deliberately small, safe Markdown renderer for the in-dashboard doc
 * viewer. Everything is HTML-escaped first; only the handful of constructs
 * below are then re-introduced as markup, so document content can never
 * inject scripts, styles, or handlers. Links are restricted to http(s) and
 * anchor targets and always open with rel="noopener".
 */

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isSafeHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || href.startsWith('#');
}

/** Inline constructs: code, bold, italic, links, images-as-links. */
function renderInline(escaped: string): string {
  let html = escaped;
  // Inline code first so its contents are protected from other rules.
  html = html.replace(/`([^`]+)`/g, (_match, code: string) => `<code>${code}</code>`);
  // Images become plain links (no remote fetches from the dashboard).
  html = html.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_match, alt: string, href: string) =>
    isSafeHref(href)
      ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${alt.length > 0 ? alt : href}</a>`
      : alt
  );
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_match, text: string, href: string) =>
    isSafeHref(href)
      ? `<a href="${href}" target="_blank" rel="noopener noreferrer">${text}</a>`
      : text
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  return html;
}

/**
 * Render Markdown to safe HTML. Supports headings, paragraphs, fenced code
 * blocks, ordered/unordered lists, blockquotes, horizontal rules, and the
 * inline set above. Unsupported constructs degrade to escaped text.
 */
export function renderMarkdownSafe(markdown: string): string {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let inCode = false;
  let codeBuffer: string[] = [];
  let listTag: 'ul' | 'ol' | null = null;
  let paragraph: string[] = [];

  const closeParagraph = (): void => {
    if (paragraph.length > 0) {
      out.push(`<p>${renderInline(escapeHtml(paragraph.join(' ')))}</p>`);
      paragraph = [];
    }
  };
  const closeList = (): void => {
    if (listTag !== null) {
      out.push(`</${listTag}>`);
      listTag = null;
    }
  };

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      if (inCode) {
        out.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
        codeBuffer = [];
        inCode = false;
      } else {
        closeParagraph();
        closeList();
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading !== null) {
      closeParagraph();
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${renderInline(escapeHtml(heading[2].trim()))}</h${level}>`);
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
      closeParagraph();
      closeList();
      out.push('<hr />');
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote !== null) {
      closeParagraph();
      closeList();
      out.push(`<blockquote>${renderInline(escapeHtml(quote[1]))}</blockquote>`);
      continue;
    }

    const unordered = /^\s*[-*+]\s+(.*)$/.exec(line);
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (unordered !== null || ordered !== null) {
      closeParagraph();
      const tag = unordered !== null ? 'ul' : 'ol';
      if (listTag !== tag) {
        closeList();
        out.push(`<${tag}>`);
        listTag = tag;
      }
      out.push(`<li>${renderInline(escapeHtml((unordered ?? ordered)![1]))}</li>`);
      continue;
    }

    if (line.trim().length === 0) {
      closeParagraph();
      closeList();
      continue;
    }

    paragraph.push(line.trim());
  }

  if (inCode && codeBuffer.length > 0) {
    out.push(`<pre><code>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
  }
  closeParagraph();
  closeList();
  return out.join('\n');
}
