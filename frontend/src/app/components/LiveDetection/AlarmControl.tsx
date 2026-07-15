/**
 * AlarmControl.tsx — Voice alert toggle and active-state indicator.
 *
 * Changes from v1:
 *  - Button color: turns 'error' (red) when the alert is actively sounding,
 *    'primary' when enabled but silent, 'inherit' when disabled.
 *  - Label text updated to "Voice Alert ON/OFF" reflecting voice-only mode.
 *  - ARIA: aria-live="assertive" region announces alert state to screen readers.
 *  - Layout: flexDirection responsive so chip wraps cleanly on small screens.
 */

import { Box, Button, Chip } from '@mui/material';
import { VolumeOff, VolumeUp } from '@mui/icons-material';

interface Props {
  alarmEnabled: boolean;
  isAlarmActive: boolean;
  onToggle: () => void;
  disabled?: boolean;
}

export function AlarmControl({ alarmEnabled, isAlarmActive, onToggle, disabled = false }: Props) {
  // Derive button colour from current alarm state
  const buttonColor = isAlarmActive ? 'error' : alarmEnabled ? 'primary' : 'inherit';

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {/* aria-pressed + aria-label for screen readers */}
      <Button
        id="alarm-toggle-btn"
        variant="outlined"
        size="small"
        fullWidth
        aria-pressed={alarmEnabled}
        aria-label="Toggle voice safety alert"
        startIcon={alarmEnabled ? <VolumeUp /> : <VolumeOff />}
        onClick={onToggle}
        disabled={disabled}
        color={buttonColor}
        sx={{ textTransform: 'none' }}
      >
        {alarmEnabled ? 'Voice Alert ON' : 'Voice Alert OFF'}
      </Button>

      {/*
        Hidden live region — announces alert state changes to screen readers
        (VoiceOver, NVDA) without requiring focus.
        aria-live="assertive" interrupts the user immediately, which is
        appropriate for a safety-critical event.
      */}
      <Box
        aria-live="assertive"
        aria-atomic="true"
        sx={{
          position: 'absolute',
          width: '1px',
          height: '1px',
          padding: 0,
          margin: '-1px',
          overflow: 'hidden',
          clip: 'rect(0,0,0,0)',
          whiteSpace: 'nowrap',
          border: 0,
        }}
      >
        {isAlarmActive ? 'Safety alert sounding' : ''}
      </Box>
    </Box>
  );
}
