import { describe, expect, it } from 'vitest';
import { orderWithPins, readPinnedScripts, togglePinnedScript } from '../src/web/src/pins';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    }
  };
}

describe('pinned scripts', () => {
  it('toggles pins on and off, persisted per project root', () => {
    const storage = memoryStorage();
    expect(togglePinnedScript(storage, '/a', 'dev')).toEqual(['dev']);
    expect(togglePinnedScript(storage, '/a', 'test')).toEqual(['dev', 'test']);
    expect(togglePinnedScript(storage, '/a', 'dev')).toEqual(['test']);
    // Another project has independent pins.
    expect(readPinnedScripts(storage, '/b')).toEqual([]);
    expect(readPinnedScripts(storage, '/a')).toEqual(['test']);
  });

  it('survives corrupted storage', () => {
    const storage = memoryStorage();
    storage.data.set('devsurface-pins:/a', '{not json');
    expect(readPinnedScripts(storage, '/a')).toEqual([]);
    expect(readPinnedScripts(null, '/a')).toEqual([]);
  });

  it('orders pinned scripts first while preserving relative order', () => {
    expect(orderWithPins(['build', 'dev', 'lint', 'test'], ['test', 'dev'])).toEqual([
      'dev',
      'test',
      'build',
      'lint'
    ]);
    expect(orderWithPins(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});
