import type { DataRepository } from './repository';

let repo: DataRepository | null = null;

export async function initRepository(): Promise<DataRepository> {
  const backend = import.meta.env.PUBLIC_BACKEND || 'express';

  if (backend === 'pocketbase') {
    const { createPocketBaseRepository } = await import('./adapters/pocketbase');
    repo = createPocketBaseRepository();
  } else {
    const { createExpressRepository } = await import('./adapters/express');
    repo = createExpressRepository();
  }

  return repo!;
}

export function getRepository(): DataRepository {
  if (!repo) {
    throw new Error('Repository not initialized. Call initRepository() first.');
  }
  return repo;
}

// Re-export types for convenience
export type { DataRepository } from './repository';
export type * from './types';
