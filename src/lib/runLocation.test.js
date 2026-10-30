import { describe, it, expect } from 'vitest';
import { describeRunLocation, loadFraction } from './runLocation.js';

describe('describeRunLocation', () => {
  it('browser claim is always verified, no runner', () => {
    const d = describeRunLocation({ claim: 'browser' });
    expect(d).toMatchObject({ where: 'browser', verified: true });
  });
  it('cloud claim without runner is unverified, labelled by jobsMode', () => {
    expect(describeRunLocation({ claim: 'cloud', jobsMode: 'durable' })).toMatchObject({ verified: false, title: 'Cloud (Modal)' });
    expect(describeRunLocation({ claim: 'cloud' }).title).toBe('Cloud optimizer');
  });
  it('runner report verifies and names host', () => {
    const d = describeRunLocation({ claim: 'cloud', runner: { kind: 'self-hosted', host: 'picklehub', os: 'Linux', arch: 'aarch64', cpus: 4 } });
    expect(d).toMatchObject({ verified: true, where: 'self-hosted', title: 'Server picklehub', warning: null });
    expect(d.detail).toContain('4 cores');
  });
  it('flags this-computer claim answered by a cloud runner', () => {
    expect(describeRunLocation({ claim: 'this-computer', runner: { kind: 'modal', cpus: 4 } }).warning).toMatch(/Modal/);
  });
  it('tolerates junk runner', () => {
    expect(describeRunLocation({ claim: 'cloud', runner: 'x' }).verified).toBe(false);
    expect(describeRunLocation({ claim: 'cloud', runner: { kind: 'weird' } }).where).toBe('self-hosted');
  });
});

describe('loadFraction', () => {
  it('clamps and handles missing', () => {
    expect(loadFraction({ load1: 2, cpus: 4 })).toBe(0.5);
    expect(loadFraction({ load1: 9, cpus: 4 })).toBe(1);
    expect(loadFraction({ load1: null, cpus: 4 })).toBeNull();
    expect(loadFraction(null)).toBeNull();
  });
});
