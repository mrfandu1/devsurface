import { describe, expect, it } from 'vitest';
import { renderMarkdownSafe } from '../src/core/markdown/index.js';

describe('renderMarkdownSafe', () => {
  it('renders headings, paragraphs, lists, and inline styles', () => {
    const html = renderMarkdownSafe('# Title\n\nSome **bold** and `code`.\n\n- one\n- two');
    expect(html).toContain('<h1>Title</h1>');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<li>one</li>');
  });

  it('renders fenced code blocks with escaped contents', () => {
    const html = renderMarkdownSafe('```\nconst a = "<div>";\n```');
    expect(html).toContain('<pre><code>');
    expect(html).toContain('&lt;div&gt;');
    expect(html).not.toContain('<div>');
  });

  it('escapes raw HTML so scripts can never run', () => {
    const html = renderMarkdownSafe('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('allows only http(s) and anchor links', () => {
    expect(renderMarkdownSafe('[ok](https://example.com)')).toContain('href="https://example.com"');
    const blocked = renderMarkdownSafe('[bad](javascript:alert(1))');
    expect(blocked).not.toContain('href');
    expect(blocked).toContain('bad');
  });

  it('renders blockquotes and horizontal rules', () => {
    const html = renderMarkdownSafe('> quoted wisdom\n\n---');
    expect(html).toContain('<blockquote>quoted wisdom</blockquote>');
    expect(html).toContain('<hr />');
  });
});
