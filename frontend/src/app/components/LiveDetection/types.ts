// types.ts — All shared TypeScript types and the PPE label lookup map.
// Ambiguity: bbox assumed to be [x1, y1, x2, y2] in pixels relative to a 640×480 frame.

// ── Core detection types ────────────────────────────────────────────────────

export interface Detection {
  label: string;
  confidence: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] pixel coords
}

/** Req 4: Expected WebSocket message shape */
export interface DetectionFrame {
  type: 'detection_frame';
  timestamp: number;
  detections: Detection[];
}

/** Req 8: Output shape from the useMemo in CompliancePanel */
export interface PPEItem {
  itemKey: string;
  displayLabel: string;
  isCompliant: boolean;
}

// ── Label map ───────────────────────────────────────────────────────────────

export type PPELabelMap = Record<string, string>;

/**
 * Req 1, 8: Plain const (not state) mapping raw model class names to
 * human-readable display labels. Lives here so it can be imported by both
 * CompliancePanel (for sidebar text) and useDetection (for compliance logic).
 */
export const PPE_LABEL_MAP: PPELabelMap = {
  helmet:       'Safety Helmet',
  gloves:       'Safety Gloves',
  glasses:      'Safety Glasses',
  boots:        'Safety Boots',
  'no helmet':  'Safety Helmet',
  'no gloves':  'Safety Gloves',
  'no glasses': 'Safety Glasses',
  'no boots':   'Safety Boots',
};

/** Canonical PPE present-form keys */
export const ALL_PPE_KEYS = ['helmet', 'gloves', 'glasses', 'boots'] as const;
export type PPEKey = typeof ALL_PPE_KEYS[number];

// ── Typed error discriminated unions ────────────────────────────────────────

/** Req 7: Typed camera errors — no catch(e: any) */
export type CameraError =
  | { type: 'permission_denied'; message: string }
  | { type: 'not_found'; message: string }
  | { type: 'unknown'; message: string };

/** Req 7, 10: Typed backend/WS errors */
export type BackendError =
  | { type: 'invalid_url'; message: string }
  | { type: 'connection_failed'; message: string };
