import { describe, expect, it } from 'vitest';
import {
  hostPortFromEntry,
  parseComposePorts,
  parseDockerfileBaseImage
} from '../src/core/docker/composeMeta.js';

describe('hostPortFromEntry', () => {
  it('handles every compose port syntax', () => {
    expect(hostPortFromEntry('8080:80')).toBe(8080);
    expect(hostPortFromEntry('127.0.0.1:5432:5432')).toBe(5432);
    expect(hostPortFromEntry('3000')).toBe(3000);
    expect(hostPortFromEntry(9000)).toBe(9000);
    expect(hostPortFromEntry('8080:80/tcp')).toBe(8080);
    expect(hostPortFromEntry({ published: 8443, target: 443 })).toBe(8443);
    expect(hostPortFromEntry('not-a-port')).toBeNull();
  });
});

describe('parseComposePorts', () => {
  it('collects published host ports per service', () => {
    const compose = [
      'services:',
      '  web:',
      '    image: nginx',
      '    ports:',
      '      - "8080:80"',
      '      - "8443:443"',
      '  db:',
      '    image: postgres',
      '    ports:',
      '      - "127.0.0.1:5432:5432"',
      '  worker:',
      '    image: worker'
    ].join('\n');

    expect(parseComposePorts(compose)).toEqual([
      { service: 'web', hostPorts: [8080, 8443] },
      { service: 'db', hostPorts: [5432] }
    ]);
  });

  it('returns nothing for malformed yaml', () => {
    expect(parseComposePorts('services: [')).toEqual([]);
    expect(parseComposePorts('just: prose')).toEqual([]);
  });
});

describe('parseDockerfileBaseImage', () => {
  it('reads the first FROM line, allowing ARG and platform flags', () => {
    expect(parseDockerfileBaseImage('FROM node:20-alpine\nRUN npm ci')).toBe('node:20-alpine');
    expect(parseDockerfileBaseImage('# comment\nARG V=20\nFROM node:${V}\n')).toBe('node:${V}');
    expect(parseDockerfileBaseImage('FROM --platform=linux/amd64 debian:12')).toBe('debian:12');
    expect(parseDockerfileBaseImage('RUN echo no from')).toBeNull();
  });
});
