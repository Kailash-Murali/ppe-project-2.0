// BackendStatus.tsx — Shows backend connectivity state.
// Req 4: Shows reconnecting indicator when WS is disconnected.
// Req 11: role="status" + aria-live="polite" for screen reader announcements.

import { Box, Typography, CircularProgress } from '@mui/material';
import type { BackendError } from './types';

interface Props {
  isConnected:    boolean;
  isReconnecting: boolean;
  error:          BackendError | null;
}

export function BackendStatus({ isConnected, isReconnecting, error }: Props) {
  const dotColor = isConnected
    ? '#18794E'
    : error
    ? '#C0111F'
    : '#9e9e9e';

  const message = isConnected
    ? 'Backend connected'
    : isReconnecting
    ? 'Reconnecting to backend…'
    : error
    ? error.type === 'invalid_url'
      ? `Configuration error: ${error.message}`
      : 'Backend disconnected'
    : 'Checking connection…';

  return (
    // Req 11: role="status" + aria-live="polite"
    <Box
      role="status"
      aria-live="polite"
      sx={{
        display:     'flex',
        alignItems:  'center',
        gap:         1,
        px:          1.5,
        py:          0.75,
        borderRadius: 1,
        bgcolor:     'action.hover',
        minWidth:    0,
      }}
    >
      {isReconnecting ? (
        <CircularProgress size={10} thickness={5} />
      ) : (
        <Box
          component="span"
          sx={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, bgcolor: dotColor }}
        />
      )}
      <Typography variant="caption" color={isConnected ? 'success.main' : error ? 'error.main' : 'text.secondary'} noWrap>
        {message}
      </Typography>
    </Box>
  );
}
