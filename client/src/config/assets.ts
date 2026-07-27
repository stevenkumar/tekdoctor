/**
 * Centralized Asset Paths
 * Manage references to public assets or source assets here.
 */

export const ASSETS = {
  // Brand logo
  LOGO: '/vite.svg',

  // Graphical elements
  HERO: '/src/assets/hero.png',
} as const;

export type AssetKeyType = typeof ASSETS[keyof typeof ASSETS];
