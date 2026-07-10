import { describe, expect, it } from 'vitest';
import { logLineTone, parseAnsiSpans } from '../src/web/src/ansi';

const ESC = String.fromCharCode(27);

describe('parseAnsiSpans', () => {
  it('splits colored segments into classed spans', () => {
    const spans = parseAnsiSpans(`plain ${ESC}[31mred${ESC}[0m after`);
    expect(spans).toEqual([
      { text: 'plain ', className: null },
      { text: 'red', className: 'ansi-red' },
      { text: ' after', className: null }
    ]);
  });

  it('handles bold, bright colors, and combined codes', () => {
    const spans = parseAnsiSpans(`${ESC}[1;32mok${ESC}[0m`);
    expect(spans).toEqual([{ text: 'ok', className: 'ansi-green ansi-bold' }]);

    const bright = parseAnsiSpans(`${ESC}[90mdim${ESC}[39m end`);
    expect(bright[0]).toEqual({ text: 'dim', className: 'ansi-bright-black' });
  });

  it('strips non-SGR escape sequences entirely', () => {
    const spans = parseAnsiSpans(`${ESC}[2Kcleared ${ESC}[1A line`);
    expect(spans.map((span) => span.text).join('')).toBe('cleared  line');
  });

  it('passes plain text through untouched', () => {
    expect(parseAnsiSpans('hello world')).toEqual([{ text: 'hello world', className: null }]);
  });
});

describe('logLineTone', () => {
  it('detects errors and warnings without false alarms', () => {
    expect(logLineTone('TypeError: boom')).toBe('error');
    expect(logLineTone('build failed with 3 errors')).toBe('error');
    expect(logLineTone('Warning: deprecated API')).toBe('warn');
    expect(logLineTone('compiled successfully')).toBe(null);
  });
});
