// useDetection.ts — Parses WebSocket detection frames, triggers alarm on violation.
// Req 4: Subscribes to lastMessage from useBackend (WS push, no polling).
// Req 8: Detection logic feeds CompliancePanel via detections array.
// Ambiguity: triggerAlarm/stopAlarm are passed in from the parent (LiveDetection.tsx)
// so that alarm state is owned by useAlarm and shared with AlarmControl.
//
// Person-gating: alarm is suppressed if no "person" is detected in the frame.
// Speech: triggerAlarm is called with a message string; the spoken announcement
// fires only once per violation session (guarded inside useAlarm).

import { useEffect, useState } from 'react';
import type { Detection, DetectionFrame } from '../types';
import { PPE_LABEL_MAP } from '../types';

export interface UseDetectionParams {
  lastMessage:           string | null;
  alarmEnabled:          boolean;
  triggerAlarm:          (message?: string) => void;
  stopAlarm:             () => void;
  activeClasses:         string[];
}

export interface UseDetectionReturn {
  detections:   Detection[];
  isProcessing: boolean;
}

export function useDetection({
  lastMessage,
  alarmEnabled,
  triggerAlarm,
  stopAlarm,
  activeClasses,
}: UseDetectionParams): UseDetectionReturn {
  const [detections,   setDetections]   = useState<Detection[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Process the latest WS message whenever it changes
  useEffect(() => {
    if (!lastMessage) return;

    let parsed: DetectionFrame;
    try {
      parsed = JSON.parse(lastMessage) as DetectionFrame;
    } catch {
      // Req 7: silently discard non-JSON or unexpected messages
      return;
    }
    if (parsed.type !== 'detection_frame') return;

    setIsProcessing(true);
    setDetections(parsed.detections);

    const labels = new Set(parsed.detections.map((d) => d.label.toLowerCase()));

    // Person-gating: only check for PPE violations if a person is present.
    // If no person is in the frame, stop any active alarm and exit.
    const personDetected = labels.has('person');
    if (!personDetected) {
      stopAlarm();
      setIsProcessing(false);
      return;
    }

    // Req 4: Trigger alarm when a PPE violation is detected
    const missingItems: string[] = [];
    activeClasses.forEach((key) => {
      const isViolation = labels.has(`no ${key}`) || !labels.has(key);
      if (isViolation) {
        // Build human-readable label, e.g. "Safety Helmet"
        const displayLabel = PPE_LABEL_MAP[key] ?? key;
        missingItems.push(`${displayLabel} missing`);
      }
    });

    const hasViolation = missingItems.length > 0;

    if (alarmEnabled && hasViolation) {
      // Construct the spoken message, e.g. "Safety Helmet missing, Safety Gloves missing"
      const message = `Safety violation: ${missingItems.join(', ')}`;
      triggerAlarm(message);
    } else {
      stopAlarm();
    }

    setIsProcessing(false);
  }, [lastMessage, alarmEnabled, triggerAlarm, stopAlarm, activeClasses]);

  // Stop alarm immediately when user disables it
  useEffect(() => {
    if (!alarmEnabled) stopAlarm();
  }, [alarmEnabled, stopAlarm]);

  return { detections, isProcessing };
}
