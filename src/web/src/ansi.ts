/**
 * Minimal ANSI SGR parser for log rendering: foreground colors 30-37/90-97,
 * bold, and reset become CSS classes; every other escape sequence is
 * stripped. The output is plain text + class names — no HTML passes through.
 */

export interface AnsiSpan {
  text: string;
  className: string | null;
}

const FG_CLASSES: Record<number, string> = {
  30: 'ansi-black',
  31: 'ansi-red',
  32: 'ansi-green',
  33: 'ansi-yellow',
  34: 'ansi-blue',
  35: 'ansi-magenta',
  36: 'ansi-cyan',
  37: 'ansi-white',
  90: 'ansi-bright-black',
  91: 'ansi-red',
  92: 'ansi-green',
  93: 'ansi-yellow',
  94: 'ansi-blue',
  95: 'ansi-magenta',
  96: 'ansi-cyan',
  97: 'ansi-white'
};

const ESC = String.fromCharCode(27);
// Any CSI/OSC/simple escape sequence; SGR ("...m") is interpreted, the rest dropped.
const ANSI_PATTERN = new RegExp(
  `${ESC}(?:\\[([0-9;]*)m|\\[[0-9;?]*[A-LN-Za-ln-z]|\\][^${String.fromCharCode(7)}]*(?:${String.fromCharCode(7)}|${ESC}\\\\)|[@-Z\\\\-_])`,
  'g'
);

export function parseAnsiSpans(input: string): AnsiSpan[] {
  const spans: AnsiSpan[] = [];
  let color: string | null = null;
  let bold = false;
  let lastIndex = 0;

  const pushText = (text: string): void => {
    if (text.length === 0) {
      return;
    }
    const classes = [color, bold ? 'ansi-bold' : null].filter(
      (value): value is string => value !== null
    );
    spans.push({ text, className: classes.length > 0 ? classes.join(' ') : null });
  };

  for (const match of input.matchAll(ANSI_PATTERN)) {
    pushText(input.slice(lastIndex, match.index));
    lastIndex = (match.index ?? 0) + match[0].length;

    const sgr = match[1];
    if (sgr !== undefined) {
      const codes = sgr.length === 0 ? [0] : sgr.split(';').map((code) => Number(code));
      for (const code of codes) {
        if (code === 0) {
          color = null;
          bold = false;
        } else if (code === 1) {
          bold = true;
        } else if (code === 22) {
          bold = false;
        } else if (code === 39) {
          color = null;
        } else if (FG_CLASSES[code] !== undefined) {
          color = FG_CLASSES[code];
        }
      }
    }
  }
  pushText(input.slice(lastIndex));

  return spans;
}

/** Heuristic tone for a log line, used to tint obvious failures and warnings. */
export function logLineTone(message: string): 'error' | 'warn' | null {
  if (/error|err!|fatal|exception|unhandled|\bfailed\b|\bfailure\b/i.test(message)) {
    return 'error';
  }
  if (/\b(warn|warning|deprecated)\b/i.test(message)) {
    return 'warn';
  }
  return null;
}
