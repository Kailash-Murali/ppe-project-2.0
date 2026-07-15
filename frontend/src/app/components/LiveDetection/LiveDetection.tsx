/**
 * LiveDetection.tsx — Root orchestrator: composes all sub-components and hooks.
 *
 * Changes from v1:
 *  - Environment variables imported from config.ts (single source of truth).
 *  - QueryClientProvider removed — moved up to App.tsx.
 *  - AbortSignal.timeout() replaced with AbortController + setTimeout for
 *    broader browser compatibility (AbortSignal.timeout is Chrome 103+ only).
 *  - setInterval frame capture replaced with requestAnimationFrame loop —
 *    rAF is automatically throttled when the tab is hidden, preventing queue
 *    buildup when the user switches away.
 *  - FileReader is tracked in a ref; the onload handler checks a live
 *    cancellation flag to prevent stale closures from sending after unmount.
 *  - Backpressure guard: checks WebSocket bufferedAmount before sending;
 *    skips the frame if the browser send buffer is above 64 KB.
 *  - useMutation for alarm acknowledge now has onSuccess / onError toast handlers.
 *  - Sidebar column width changed from fixed 320px to clamp(260px, 28vw, 340px).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Box, Typography, Stack, Alert, Paper, Button, CircularProgress } from '@mui/material';
import { PlayCircleOutline, StopCircleOutlined } from '@mui/icons-material';
import { Toaster, toast } from 'react-hot-toast';

import { BACKEND_URL, WS_URL } from '../../config';
import { CameraPanel }     from './CameraPanel';
import { CompliancePanel } from './CompliancePanel';
import { PPEControlsPanel } from './PPEControlsPanel';
import { ALL_PPE_KEYS } from './types';
import { AlarmControl }    from './AlarmControl';
import { useCamera }       from './hooks/useCamera';
import { useAlarm }        from './hooks/useAlarm';
import { useBackend }      from './hooks/useBackend';
import { useDetection }    from './hooks/useDetection';

// ── Environment variable validation ──────────────────────────────────────────
function getConfigError(): string | null {
  if (!BACKEND_URL || !/^https?:\/\/.+/.test(BACKEND_URL)) {
    return `VITE_BACKEND_URL is missing or malformed: "${BACKEND_URL}". ` +
           'Copy .env.example to .env and set a valid http(s):// URL.';
  }
  if (!WS_URL || !/^wss?:\/\/.+/.test(WS_URL)) {
    return `VITE_WS_URL is missing or malformed: "${WS_URL}". ` +
           'Copy .env.example to .env and set a valid ws(s):// URL.';
  }
  return null;
}

// Evaluated once at module load (import.meta.env is static at build time)
const CONFIG_ERROR = getConfigError();

// ── Inner component ───────────────────────────────────────────────────────────
function LiveDetectionInner() {
  const [alarmEnabled, setAlarmEnabled] = useState(true);
  const [activeClasses, setActiveClasses] = useState<string[]>([...ALL_PPE_KEYS]);

  // Notify backend when active classes change
  useEffect(() => {
    if (CONFIG_ERROR) return;
    fetch(`${BACKEND_URL}/active-classes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active_classes: activeClasses }),
    }).catch(() => {}); // fire-and-forget; non-critical for UI
  }, [activeClasses]);

  // ── Hooks ─────────────────────────────────────────────────────────────────
  const { triggerAlarm, stopAlarm, isAlarmActive } = useAlarm();
  const { isConnected, sendMessage, lastMessage } = useBackend();
  const { detections, isProcessing } = useDetection({
    lastMessage,
    alarmEnabled,
    triggerAlarm,
    stopAlarm,
    activeClasses,
  });
  const { videoRef, stream, error: cameraError, isLoading, startCamera, stopCamera } = useCamera();

  // ── Health check — AbortController for broad browser compatibility ─────────
  // AbortSignal.timeout() is Chrome 103+ only. AbortController + setTimeout
  // achieves the same result on all modern browsers.
  const { error: healthError } = useQuery({
    queryKey: ['backend-health'],
    queryFn: async () => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);
      try {
        const res = await fetch(`${BACKEND_URL}/health`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Health check returned ${res.status}`);
        return res.json() as Promise<{ status: string }>;
      } finally {
        clearTimeout(timer);
      }
    },
    enabled: !CONFIG_ERROR,
    refetchOnWindowFocus: false,
  });

  // ── PPE config fetch ──────────────────────────────────────────────────────
  useQuery({
    queryKey: ['ppe-config'],
    queryFn: async () => {
      const res = await fetch(`${BACKEND_URL}/ppe-config`);
      if (!res.ok) throw new Error('Failed to fetch PPE config');
      return res.json() as Promise<Record<string, string>>;
    },
    enabled: !CONFIG_ERROR,
    refetchOnWindowFocus: false,
  });

  // ── Alarm acknowledgement mutation — with success/error toast ─────────────
  const { mutate: acknowledgeAlarm } = useMutation({
    mutationFn: async (payload: { timestamp: number }) => {
      const res = await fetch(`${BACKEND_URL}/alarm/acknowledge`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Alarm acknowledgement failed');
      return res.json();
    },
    onSuccess: () => toast.success('Alarm acknowledged'),
    onError:   () => toast.error('Failed to acknowledge alarm'),
  });

  // ── Toast on health check failure ─────────────────────────────────────────
  useEffect(() => {
    if (healthError) {
      toast.error('Backend health check failed — is the server running?');
    }
  }, [healthError]);

  // ── Toast on camera permission error ─────────────────────────────────────
  useEffect(() => {
    if (cameraError?.type === 'permission_denied') {
      toast.error('Camera permission denied. Allow camera access and try again.');
    }
  }, [cameraError]);

  // ── Frame capture via requestAnimationFrame ───────────────────────────────
  // rAF replaces setInterval(fn, 33) for two reasons:
  //   1. rAF is capped at the display refresh rate (~60 fps), so we never
  //      submit more frames than the screen produces.
  //   2. rAF pauses automatically when the tab is hidden, preventing queue
  //      buildup when the user switches away — a key backpressure benefit.
  const captureCanvas  = useRef(document.createElement('canvas'));
  const sendingRef     = useRef(false);
  const rafHandleRef   = useRef<number>(0);
  // Cancellation flag prevents stale FileReader closures from sending after
  // the component unmounts or the camera stops.
  const cancelledRef   = useRef(false);

  const captureAndSendFrame = useCallback(() => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || sendingRef.current || !isConnected) return;

    // Backpressure: skip this frame if the WS send buffer is above 64 KB.
    // This prevents the browser from building an unbounded in-memory queue.
    const ws = (window as unknown as { __brayWs?: WebSocket }).__brayWs;
    if (ws && ws.bufferedAmount > 65536) {
      return;
    }

    const canvas = captureCanvas.current;
    const aspect = video.videoHeight / video.videoWidth;
    canvas.width  = 640;
    canvas.height = Math.round(640 * aspect);
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);

    sendingRef.current = true;
    canvas.toBlob((blob) => {
      if (!blob || cancelledRef.current) { sendingRef.current = false; return; }
      const reader = new FileReader();
      reader.onload = () => {
        // Guard: component may have unmounted while the FileReader was running
        if (cancelledRef.current || typeof reader.result !== 'string') {
          sendingRef.current = false;
          return;
        }
        sendMessage(JSON.stringify({
          type: 'frame',
          data: reader.result.split(',')[1],
        }));
        sendingRef.current = false;
      };
      reader.onerror = () => { sendingRef.current = false; };
      reader.readAsDataURL(blob);
    }, 'image/jpeg', 0.85);
  }, [videoRef, isConnected, sendMessage]);

  // rAF loop — runs only while the camera stream is active
  useEffect(() => {
    if (!stream || !isConnected) return;
    cancelledRef.current = false;

    const loop = () => {
      captureAndSendFrame();
      rafHandleRef.current = requestAnimationFrame(loop);
    };
    rafHandleRef.current = requestAnimationFrame(loop);

    return () => {
      cancelledRef.current = true;
      cancelAnimationFrame(rafHandleRef.current);
    };
  }, [stream, isConnected, captureAndSendFrame]);

  // ── Alarm handlers ────────────────────────────────────────────────────────
  const handleAlarmToggle = () => {
    const next = !alarmEnabled;
    setAlarmEnabled(next);
    if (!next) {
      stopAlarm();
      acknowledgeAlarm({ timestamp: Date.now() });
    }
  };

  const handleStopCamera = () => {
    stopCamera();
    stopAlarm();
    setAlarmEnabled(false);
  };

  const isBackendReady = isConnected && !CONFIG_ERROR;
  const isStreaming = stream !== null;

  return (
    <Box sx={{ p: 0 }}>
      {/* Config error banner */}
      {CONFIG_ERROR && (
        <Alert severity="error" sx={{ mb: 2, fontFamily: 'monospace', fontSize: 13 }}>
          <strong>Configuration Error:</strong> {CONFIG_ERROR}
        </Alert>
      )}

      {/* Page header */}
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5" fontWeight={700} gutterBottom>
          PPE Detection
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Real-time PPE compliance monitoring
        </Typography>
      </Box>

      {/* Main 2-column layout — sidebar scales with viewport on tablets */}
      <Box sx={{
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: 'clamp(260px, 28vw, 340px) 1fr' },
        gap: 3,
        alignItems: 'start',
      }}>

        {/* LEFT: Compliance sidebar + controls card */}
        <Stack spacing={2}>
          <CompliancePanel detections={detections} isStreaming={isStreaming} activeClasses={activeClasses} />

          {/* Controls card — camera start/stop + alarm toggle */}
          <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
            <Box sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
              <Typography sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'text.secondary' }}>
                Controls
              </Typography>
            </Box>
            <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
              {!isStreaming ? (
                <Button
                  id="start-camera-btn"
                  variant="contained"
                  startIcon={isLoading ? <CircularProgress size={16} /> : <PlayCircleOutline />}
                  disabled={!isBackendReady || isLoading}
                  onClick={startCamera}
                  size="small"
                  fullWidth
                  aria-label="Start camera"
                >
                  {isLoading ? 'Starting…' : 'Start Camera'}
                </Button>
              ) : (
                <Button
                  id="stop-camera-btn"
                  variant="outlined"
                  color="error"
                  startIcon={<StopCircleOutlined />}
                  onClick={handleStopCamera}
                  size="small"
                  fullWidth
                  aria-label="Stop camera"
                >
                  Stop Camera
                </Button>
              )}

              <AlarmControl
                alarmEnabled={alarmEnabled}
                isAlarmActive={isAlarmActive}
                onToggle={handleAlarmToggle}
                disabled={!isStreaming}
              />
            </Box>
          </Paper>

          <PPEControlsPanel
            activeClasses={activeClasses}
            onActiveClassChange={setActiveClasses}
          />
        </Stack>

        {/* RIGHT: Camera feed with bbox overlay */}
        <CameraPanel
          videoRef={videoRef}
          stream={stream}
          detections={detections}
          error={cameraError}
          isLoading={isLoading}
        />
      </Box>
    </Box>
  );
}

// ── Public export — QueryClientProvider now lives in App.tsx ──────────────────
export function LiveDetection() {
  return (
    <>
      {/* Toast container for all hook notifications */}
      <Toaster position="bottom-right" toastOptions={{ duration: 4000 }} />
      <LiveDetectionInner />
    </>
  );
}
