const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

const OSC_SEQUENCE = new RegExp(`${ESC}\\][\\s\\S]*?(?:${BEL}|${ESC}\\\\)`, 'g');
const CSI_SEQUENCE = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, 'g');
const ESCAPE_SEQUENCE = new RegExp(`${ESC}[@-Z\\\\-_]`, 'g');

function stripControlCharacters(value: string): string {
  let result = '';
  for (const character of value) {
    const code = character.charCodeAt(0);
    if ((code > 31 && code < 127) || code > 159) {
      result += character;
    }
  }
  return result;
}

export function safeDisplayText(value: unknown): string {
  return stripControlCharacters(
    String(value).replace(OSC_SEQUENCE, '').replace(CSI_SEQUENCE, '').replace(ESCAPE_SEQUENCE, '')
  );
}

export function safeDisplayList(values: string[]): string {
  return values.length > 0 ? values.map((value) => safeDisplayText(value)).join(', ') : 'none';
}
