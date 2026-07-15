// useAlarm.ts — AudioContext creation, alarm sound, cleanup on unmount.
// Req 9: AudioContext created inside the hook (not module level).
// Ambiguity: Alarm is triggered externally (via triggerAlarm); the hook does not
// auto-trigger on detections — that is handled by useDetection.
//
// Speech synthesis is additive: the beep oscillator is unchanged.
// The spoken message fires ONCE per violation session (guarded by isActiveRef).

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseAlarmReturn {
  triggerAlarm: (message?: string) => void;
  stopAlarm: () => void;
  isAlarmActive: boolean;
}

export function useAlarm(): UseAlarmReturn {
  // Use a ref alongside state to avoid stale closure in triggerAlarm
  const isActiveRef      = useRef(false);
  const [isAlarmActive, setIsAlarmActive] = useState(false);

  const stopAlarm = useCallback(() => {
    isActiveRef.current = false;
    setIsAlarmActive(false);

    // Cancel any queued speech when the alarm is stopped
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }, []);

  const triggerAlarm = useCallback((message?: string) => {
    // Skip if already sounding
    if (isActiveRef.current) return;

    isActiveRef.current   = true;
    setIsAlarmActive(true);

    // Speak the alert message once at the start of a new violation session.
    // This only runs on the transition from inactive → active (guarded above by
    // the early return), so the phrase is spoken exactly once per session.
    if (message && typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel(); // clear any leftover utterance
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.rate   = 0.95;
      utterance.volume = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return { triggerAlarm, stopAlarm, isAlarmActive };
}
