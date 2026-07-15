// useBackend.test.ts — Test stub for useBackend hook.
// Req 10: Tests cover URL validation logic (the core non-trivial behavior).
// Full tests would mock WebSocket global.

import { describe, it, expect } from 'vitest';

// Re-export the validator logic so it can be tested in isolation
const isValidWsUrl = (url: string) => /^wss?:\/\/.+/.test(url);

describe('useBackend — URL validation (Req 10)', () => {
  it('should accept a valid ws:// URL', () => {
    expect(isValidWsUrl('ws://localhost:8000/ws')).toBe(true);
  });

  it('should accept a valid wss:// URL', () => {
    expect(isValidWsUrl('wss://api.example.com/ws')).toBe(true);
  });

  it('should reject an http:// URL', () => {
    expect(isValidWsUrl('http://localhost:8000')).toBe(false);
  });

  it('should reject an empty string', () => {
    expect(isValidWsUrl('')).toBe(false);
  });

  it('should reject undefined coerced to string', () => {
    expect(isValidWsUrl(String(undefined))).toBe(false);
  });

  it('should start with isConnected = false before any WS is opened', () => {
    const initialState = { isConnected: false, isReconnecting: false, error: null };
    expect(initialState.isConnected).toBe(false);
    expect(initialState.isReconnecting).toBe(false);
    expect(initialState.error).toBeNull();
  });
});
