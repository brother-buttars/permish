import { describe, it, expect, beforeEach, vi } from 'vitest';

// Provide window and localStorage stubs before importing the module.
// getDataMode() checks `typeof window === 'undefined'` before reading localStorage.
const store: Record<string, string> = {};
vi.stubGlobal('window', globalThis);
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    for (const key of Object.keys(store)) {
      delete store[key];
    }
  }
});

// Import AFTER stubbing
import { getDataMode, setDataMode, getRepository, getSyncManager, getBackupManager } from './index';

describe('data mode', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) {
      delete store[key];
    }
  });

  it('defaults to online when no localStorage value', () => {
    expect(getDataMode()).toBe('online');
  });

  it('returns local after setDataMode("local")', () => {
    setDataMode('local');
    expect(getDataMode()).toBe('local');
  });

  it('returns hybrid after setDataMode("hybrid")', () => {
    setDataMode('hybrid');
    expect(getDataMode()).toBe('hybrid');
  });

  it('persists mode in localStorage', () => {
    setDataMode('local');
    expect(store['permish_data_mode']).toBe('local');
  });

  it('reads mode from localStorage', () => {
    store['permish_data_mode'] = 'hybrid';
    expect(getDataMode()).toBe('hybrid');
  });

  it('can switch modes', () => {
    setDataMode('local');
    expect(getDataMode()).toBe('local');
    setDataMode('online');
    expect(getDataMode()).toBe('online');
    setDataMode('hybrid');
    expect(getDataMode()).toBe('hybrid');
  });
});

describe('getRepository', () => {
  it('throws when not initialized', () => {
    expect(() => getRepository()).toThrow('Repository not initialized');
  });
});

describe('getSyncManager', () => {
  it('returns null by default', () => {
    expect(getSyncManager()).toBeNull();
  });
});

describe('getBackupManager', () => {
  it('returns null by default', () => {
    expect(getBackupManager()).toBeNull();
  });
});
