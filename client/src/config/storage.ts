/**
 * Centralized Storage Keys
 * Manage all localStorage / sessionStorage keys here to avoid collisions and typos.
 */

export const STORAGE_KEYS = {
  // Session storage keys
  TOKEN: 'token',
  USER: 'user',
} as const;

export type StorageKeyType = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];
