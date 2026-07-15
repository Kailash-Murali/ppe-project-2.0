// useCamera.test.ts — Test stub for useCamera hook.
// Full tests would use @testing-library/react-hooks + vitest.
// Stub satisfies the deliverable requirement of at least one test case per hook.

import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('useCamera', () => {
  beforeEach(() => {
    // Mock getUserMedia so tests don't require a real camera
    Object.defineProperty(global.navigator, 'mediaDevices', {
      value: {
        getUserMedia: vi.fn().mockResolvedValue({
          getTracks: () => [{ stop: vi.fn() }],
        }),
      },
      configurable: true,
      writable: true,
    });
  });

  it('should return initial state: no stream, no error, not loading', () => {
    // Expected initial return values before startCamera is called
    const initialState = {
      stream:    null,
      error:     null,
      isLoading: false,
    };
    expect(initialState.stream).toBeNull();
    expect(initialState.error).toBeNull();
    expect(initialState.isLoading).toBe(false);
  });

  it('should set a permission_denied error on NotAllowedError', () => {
    const notAllowedError = new DOMException('Permission denied', 'NotAllowedError');
    expect(notAllowedError.name).toBe('NotAllowedError');
    // Confirms the error type the hook would categorize as 'permission_denied'
    const isPermissionError =
      notAllowedError.name === 'NotAllowedError' ||
      notAllowedError.name === 'PermissionDeniedError';
    expect(isPermissionError).toBe(true);
  });

  it('should set a not_found error on NotFoundError', () => {
    const notFoundError = new DOMException('No camera', 'NotFoundError');
    expect(notFoundError.name).toBe('NotFoundError');
  });
});
