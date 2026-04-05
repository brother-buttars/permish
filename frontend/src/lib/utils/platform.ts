export type Platform = 'web' | 'ios' | 'android' | 'tauri';

export function getPlatform(): Platform {
  if (typeof window === 'undefined') return 'web';

  // Check for Tauri
  if ('__TAURI__' in window || '__TAURI_INTERNALS__' in window) return 'tauri';

  // Check for Capacitor
  if ('Capacitor' in window) {
    const cap = (window as any).Capacitor;
    if (cap?.getPlatform?.() === 'ios') return 'ios';
    if (cap?.getPlatform?.() === 'android') return 'android';
  }

  return 'web';
}

export function isNative(): boolean {
  const p = getPlatform();
  return p === 'ios' || p === 'android' || p === 'tauri';
}

export function isMobile(): boolean {
  const p = getPlatform();
  return p === 'ios' || p === 'android';
}
