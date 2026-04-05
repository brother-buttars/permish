export type Platform = 'web' | 'tauri';

export function getPlatform(): Platform {
  if (typeof window === 'undefined') return 'web';

  // Tauri covers desktop (macOS, Windows, Linux) AND mobile (iOS, Android)
  if ('__TAURI__' in window || '__TAURI_INTERNALS__' in window) return 'tauri';

  return 'web';
}

export function isNative(): boolean {
  return getPlatform() === 'tauri';
}
