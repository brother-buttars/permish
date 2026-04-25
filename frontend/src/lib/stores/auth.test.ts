import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { createTestDatabase, type TestDatabase } from '$lib/data/test-helpers';
import { initializeLocalSchema } from '$lib/data/local/schema';
import { createLocalRepository } from '$lib/data/adapters/local';
import type { DataRepository } from '$lib/data/repository';

// Stub localStorage for the local adapter
const localStorageStub: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => localStorageStub[key] ?? null,
  setItem: (key: string, value: string) => {
    localStorageStub[key] = value;
  },
  removeItem: (key: string) => {
    delete localStorageStub[key];
  },
  clear: () => {
    for (const key of Object.keys(localStorageStub)) {
      delete localStorageStub[key];
    }
  }
});

// We need to mock getRepository to return our local adapter.
// The auth store imports getRepository from '$lib/data', so we mock that module.
vi.mock('$lib/data', () => {
  let _repo: DataRepository | null = null;
  return {
    getRepository: () => {
      if (!_repo) throw new Error('Repository not initialized');
      return _repo;
    },
    _setTestRepo: (repo: DataRepository) => {
      _repo = repo;
    },
    _clearTestRepo: () => {
      _repo = null;
    }
  };
});

// Import the mocked module so we can inject our repo.
// These exports only exist in the vi.mock factory above, hence the cast.
import * as dataModule from '$lib/data';
const { _setTestRepo, _clearTestRepo } = dataModule as unknown as {
  _setTestRepo: (repo: DataRepository) => void;
  _clearTestRepo: () => void;
};

// Import the auth store functions (they will use our mocked getRepository)
import { user, authLoading, checkAuth, login, register, logout } from './auth';

describe('auth store', () => {
  let db: TestDatabase;
  let repo: DataRepository;

  beforeEach(async () => {
    // Clear localStorage
    for (const key of Object.keys(localStorageStub)) {
      delete localStorageStub[key];
    }

    db = await createTestDatabase();
    await initializeLocalSchema(db);
    repo = createLocalRepository(db);

    // Inject the repo into the mocked getRepository
    ((_setTestRepo as any) as (r: DataRepository) => void)(repo);

    // Reset store values
    user.set(null);
    authLoading.set(true);
  });

  afterEach(async () => {
    try {
      await repo.auth.logout();
    } catch {
      // ignore
    }
    ((_clearTestRepo as any) as () => void)();
    try {
      db.close();
    } catch {
      // already closed
    }
  });

  describe('checkAuth', () => {
    it('should set user to null when no one is logged in', async () => {
      await checkAuth();
      expect(get(user)).toBeNull();
      expect(get(authLoading)).toBe(false);
    });

    it('should set user when someone is logged in', async () => {
      await repo.auth.register('check@test.com', 'pass', 'Check User', 'parent');

      await checkAuth();
      const u = get(user);
      expect(u).not.toBeNull();
      expect(u!.email).toBe('check@test.com');
      expect(u!.name).toBe('Check User');
      expect(get(authLoading)).toBe(false);
    });

    it('should set authLoading to false even on error', async () => {
      // Clear the repo to force an error
      ((_clearTestRepo as any) as () => void)();

      await checkAuth();
      expect(get(user)).toBeNull();
      expect(get(authLoading)).toBe(false);

      // Re-inject for afterEach cleanup
      ((_setTestRepo as any) as (r: DataRepository) => void)(repo);
    });
  });

  describe('register', () => {
    it('should register and set user store', async () => {
      const result = await register('reg@test.com', 'pass', 'Reg User', 'planner');
      expect(result.email).toBe('reg@test.com');

      const u = get(user);
      expect(u).not.toBeNull();
      expect(u!.email).toBe('reg@test.com');
      expect(u!.role).toBe('planner');
    });

    it('should throw on duplicate email', async () => {
      await register('dup@test.com', 'pass', 'User1', 'parent');
      await logout();

      await expect(register('dup@test.com', 'pass', 'User2', 'parent')).rejects.toThrow(
        'Email already registered'
      );
    });
  });

  describe('login', () => {
    it('should login and set user store', async () => {
      await repo.auth.register('login@test.com', 'secret', 'Login User', 'parent');
      await repo.auth.logout();

      user.set(null);
      const result = await login('login@test.com', 'secret');
      expect(result.email).toBe('login@test.com');

      const u = get(user);
      expect(u).not.toBeNull();
      expect(u!.email).toBe('login@test.com');
    });

    it('should throw on wrong password', async () => {
      await repo.auth.register('login@test.com', 'correct', 'User', 'parent');
      await repo.auth.logout();

      await expect(login('login@test.com', 'wrong')).rejects.toThrow(
        'Invalid email or password'
      );
    });
  });

  describe('logout', () => {
    it('should clear user store', async () => {
      await register('out@test.com', 'pass', 'Out User', 'parent');
      expect(get(user)).not.toBeNull();

      await logout();
      expect(get(user)).toBeNull();
    });
  });
});
