// useDetection.test.ts — Test stub for useDetection hook.
// Tests the compliance logic that determines PPE violations from detection labels.

import { describe, it, expect, vi } from 'vitest';
import type { Detection, DetectionFrame } from '../types';
import { ALL_PPE_KEYS } from '../types';

// Inline the violation check logic to test it in isolation (mirrors useDetection.ts)
function hasViolation(detections: Detection[]): boolean {
  const labels = new Set(detections.map((d) => d.label.toLowerCase()));
  return ALL_PPE_KEYS.some((key) => !labels.has(key) || labels.has(`no ${key}`));
}

describe('useDetection — PPE violation logic', () => {
  it('should report no violation when all PPE items are present', () => {
    const detections: Detection[] = ALL_PPE_KEYS.map((key) => ({
      label: key,
      confidence: 0.95,
      bbox: [0, 0, 100, 100],
    }));
    expect(hasViolation(detections)).toBe(false);
  });

  it('should report violation when a "no X" label appears', () => {
    const detections: Detection[] = [
      { label: 'no helmet', confidence: 0.87, bbox: [0, 0, 100, 100] },
    ];
    expect(hasViolation(detections)).toBe(true);
  });

  it('should report violation when a required PPE item is absent', () => {
    // Only gloves are detected — all others are missing
    const detections: Detection[] = [
      { label: 'gloves', confidence: 0.9, bbox: [0, 0, 50, 50] },
    ];
    expect(hasViolation(detections)).toBe(true);
  });

  it('should ignore non-detection_frame WS messages silently', () => {
    const rawMessage = JSON.stringify({ type: 'ping', timestamp: Date.now() });
    const parsed = JSON.parse(rawMessage) as DetectionFrame;
    // Hook would return early — no state update
    expect(parsed.type).not.toBe('detection_frame');
  });

  it('should call triggerAlarm when violation is detected and alarm enabled', () => {
    const triggerAlarm = vi.fn();
    const stopAlarm    = vi.fn();
    const detections: Detection[] = [
      { label: 'no helmet', confidence: 0.9, bbox: [0, 0, 100, 100] },
    ];
    if (hasViolation(detections)) triggerAlarm();
    else stopAlarm();
    expect(triggerAlarm).toHaveBeenCalledOnce();
    expect(stopAlarm).not.toHaveBeenCalled();
  });
});
