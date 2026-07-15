/**
 * config.ts — Single source of truth for all environment variables.
 *
 * Import from here instead of calling import.meta.env inline throughout
 * components and hooks. This makes it easy to trace all env-var usages,
 * centralises validation, and keeps call sites clean.
 *
 * Vite replaces import.meta.env values at build time, so these constants
 * are effectively static strings in the compiled bundle.
 */

export const BACKEND_URL: string = import.meta.env.VITE_BACKEND_URL as string ?? '';
export const WS_URL: string = import.meta.env.VITE_WS_URL as string ?? '';
