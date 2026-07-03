import { describe, expect, it } from 'vitest';
import {
  parseLsofOwner,
  parseNetstatListeners,
  parseTasklistName
} from '../src/core/scanner/portOwner.js';

describe('parseNetstatListeners', () => {
  it('maps listening ports to PIDs from netstat -ano output', () => {
    const output = [
      'Active Connections',
      '',
      '  Proto  Local Address          Foreign Address        State           PID',
      '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       1234',
      '  TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       889',
      '  TCP    192.168.1.5:52144      142.250.4.68:443       ESTABLISHED     4021',
      '  UDP    0.0.0.0:5353           *:*                                    777'
    ].join('\r\n');

    const listeners = parseNetstatListeners(output);
    expect(listeners.get(3000)).toBe(1234);
    expect(listeners.get(5173)).toBe(889);
    // Established connections and UDP sockets are not listeners.
    expect(listeners.has(52144)).toBe(false);
    expect(listeners.has(5353)).toBe(false);
  });

  it('keeps the first PID when a port appears twice', () => {
    const output = [
      '  TCP    0.0.0.0:3000           0.0.0.0:0              LISTENING       10',
      '  TCP    [::]:3000              [::]:0                 LISTENING       20'
    ].join('\n');

    expect(parseNetstatListeners(output).get(3000)).toBe(10);
  });

  it('returns an empty map for garbage input', () => {
    expect(parseNetstatListeners('not netstat output at all').size).toBe(0);
  });
});

describe('parseTasklistName', () => {
  it('extracts the image name from CSV output', () => {
    const output = '"node.exe","1234","Console","1","120,564 K"\r\n';
    expect(parseTasklistName(output)).toBe('node.exe');
  });

  it('returns null when tasklist reports no matching process', () => {
    expect(
      parseTasklistName('INFO: No tasks are running which match the specified criteria.')
    ).toBe(null);
  });
});

describe('parseLsofOwner', () => {
  it('extracts pid and command from lsof field output', () => {
    const output = ['p4321', 'cnode', 'Lchandan', 'f23'].join('\n');
    expect(parseLsofOwner(output)).toEqual({ pid: 4321, name: 'node' });
  });

  it('returns null when no process field is present', () => {
    expect(parseLsofOwner('')).toBe(null);
    expect(parseLsofOwner('cvite\n')).toBe(null);
  });
});
