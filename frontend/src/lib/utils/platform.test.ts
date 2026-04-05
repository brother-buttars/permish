import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getPlatform, isNative } from './platform';

// Provide a minimal window object for Node environment
vi.stubGlobal('window', {});

describe('getPlatform', () => {
  beforeEach(() => {
    // Clean up any Tauri globals from previous tests
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('returns web by default', () => {
    expect(getPlatform()).toBe('web');
  });

  it('returns tauri when __TAURI_INTERNALS__ exists', () => {
    (window as any).__TAURI_INTERNALS__ = {};
    expect(getPlatform()).toBe('tauri');
  });

  it('returns tauri when __TAURI__ exists', () => {
    (window as any).__TAURI__ = {};
    expect(getPlatform()).toBe('tauri');
  });

  it('returns tauri when both __TAURI__ and __TAURI_INTERNALS__ exist', () => {
    (window as any).__TAURI__ = {};
    (window as any).__TAURI_INTERNALS__ = {};
    expect(getPlatform()).toBe('tauri');
  });
});

describe('isNative', () => {
  beforeEach(() => {
    delete (window as any).__TAURI__;
    delete (window as any).__TAURI_INTERNALS__;
  });

  it('returns false when on web', () => {
    expect(isNative()).toBe(false);
  });

  it('returns true when Tauri globals are present', () => {
    (window as any).__TAURI_INTERNALS__ = {};
    expect(isNative()).toBe(true);
  });
});
