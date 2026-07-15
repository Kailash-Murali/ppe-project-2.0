// StatusDot.tsx — Reusable ✅/❌ compliance indicator.
// Req 11: role="img" with aria-label for screen readers.
// Ambiguity: Kept as a pure presentational component — no business logic.

import { Box } from '@mui/material';

interface Props {
  isCompliant: boolean;
  /** Whether to pulse red when non-compliant (e.g., during active streaming) */
  pulse?: boolean;
}

export function StatusDot({ isCompliant, pulse = false }: Props) {
  return (
    <Box
      component="span"
      // Req 11: Accessibility attributes for StatusDot
      role="img"
      aria-label={isCompliant ? 'PPE item compliant' : 'PPE item violation'}
      sx={{
        display:      'inline-block',
        width:        14,
        height:       14,
        borderRadius: '50%',
        flexShrink:   0,
        bgcolor:      isCompliant ? '#18794E' : '#C0111F',
        boxShadow:    (!isCompliant && pulse)
          ? '0 0 0 4px rgba(192,17,31,0.25)'
          : 'none',
        transition: 'box-shadow 300ms ease, background-color 200ms ease',
      }}
    />
  );
}
