// CameraPanel.tsx — Webcam feed display with canvas bounding-box overlay.
// Req 1: Bounding boxes drawn on canvas — red for violation labels, green for present.
//        No raw confidence scores visible on the canvas.
// Req 11: aria-label on video, aria-live="polite" on error container.
// Ambiguity: bbox coords assumed [x1,y1,x2,y2] relative to a 640×480 source frame;
//            canvas is scaled to match the rendered video size.

import { useEffect, useRef, useState, useCallback } from 'react';
import { Box, Paper, Typography, CircularProgress, IconButton, Tooltip } from '@mui/material';
import { Fullscreen, FullscreenExit } from '@mui/icons-material';
import type { Detection, CameraError } from './types';

interface Props {
  /** Ref owned by useCamera; passed here to attach to the <video> element */
  videoRef:   React.MutableRefObject<HTMLVideoElement | null>;
  stream:     MediaStream | null;
  detections: Detection[];
  error:      CameraError | null;
  isLoading:  boolean;
}

/** Source frame width sent to the model (matches LiveDetection.tsx captureAndSendFrame) */
const FRAME_W = 640;

export function CameraPanel({
  videoRef,
  stream,
  detections,
  error,
  isLoading,
}: Props) {
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Sync canvas size to video natural dimensions on first metadata load
  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const onMeta = () => {
      canvas.width  = video.videoWidth  || FRAME_W;
      canvas.height = video.videoHeight || Math.round(FRAME_W * 3 / 4);
    };
    video.addEventListener('loadedmetadata', onMeta);
    return () => video.removeEventListener('loadedmetadata', onMeta);
  }, [videoRef]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!stream || detections.length === 0) return;

    // Inference frame height is derived from the webcam aspect ratio, matching
    // how LiveDetection.tsx encodes frames: width=640, height=round(640*(h/w))
    const video = videoRef.current;
    const frameH = video && video.videoWidth
      ? Math.round(FRAME_W * (video.videoHeight / video.videoWidth))
      : 360; // safe fallback for 16:9

    const scaleX = canvas.width  / FRAME_W;
    const scaleY = canvas.height / frameH;

    detections.forEach((det) => {
      // Person is used for alarm gating only — do not draw a bounding box for it
      if (det.label.toLowerCase() === 'person') return;

      const [x1, y1, x2, y2] = det.bbox;
      // Req 1: Red for violations ("no X"), green for present PPE
      const isViolation = det.label.toLowerCase().startsWith('no ');
      ctx.strokeStyle = isViolation ? '#ef4444' : '#22c55e';
      ctx.lineWidth   = 2.5;
      ctx.strokeRect(
        x1 * scaleX,
        y1 * scaleY,
        (x2 - x1) * scaleX,
        (y2 - y1) * scaleY,
      );
    });
  }, [detections, stream, videoRef]);

  // Track fullscreen state changes (including Esc key exit)
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  }, []);

  const isStreaming = stream !== null;

  return (
    <Paper
      variant="outlined"
      sx={{
        borderRadius: 2,
        overflow:     'hidden',
        // Responsive aspect ratio: wider (16:9) on mobile to fit small viewports,
        // traditional (4:3) on desktop where there is more vertical space.
        aspectRatio:  { xs: '16/9', md: '4/3' },
        display:      'flex',
        flexDirection:'column',
        bgcolor:      '#0D0D0D',
        position:     'relative',
      }}
    >
      {/* ── Video + canvas overlay ── */}
      <Box ref={containerRef} sx={{ position: 'relative', flex: 1, overflow: 'hidden', bgcolor: '#0D0D0D' }}>
        {/* Req 11: aria-label on video element */}
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Live camera feed"
          style={{
            width:      '100%',
            height:     '100%',
            objectFit:  'contain',
            display:    isStreaming ? 'block' : 'none',
          }}
        />

        {/* Canvas overlay for bounding boxes — must match video's objectFit */}
        <canvas
          ref={canvasRef}
          style={{
            position:  'absolute',
            top:       0,
            left:      0,
            width:     '100%',
            height:    '100%',
            objectFit: 'contain',
            pointerEvents: 'none',
            display:   isStreaming ? 'block' : 'none',
          }}
        />

        {/* Fullscreen toggle button — shown only while streaming */}
        {isStreaming && (
          <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}>
            <IconButton
              id="fullscreen-toggle-btn"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              onClick={toggleFullscreen}
              size="small"
              sx={{
                position:  'absolute',
                bottom:    8,
                right:     8,
                bgcolor:   'rgba(0,0,0,0.55)',
                color:     '#fff',
                '&:hover': { bgcolor: 'rgba(0,0,0,0.8)' },
              }}
            >
              {isFullscreen ? <FullscreenExit fontSize="small" /> : <Fullscreen fontSize="small" />}
            </IconButton>
          </Tooltip>
        )}

        {/* Placeholder when not streaming */}
        {!isStreaming && (
          // Req 11: aria-live="polite" on the camera status container
          <Box
            aria-live="polite"
            sx={{
              position:       'absolute',
              inset:          0,
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              flexDirection:  'column',
              gap:            1,
            }}
          >
            {isLoading ? (
              <CircularProgress size={28} />
            ) : error ? (
              <>
                <Typography variant="body2" color="error.light">
                  {error.type === 'permission_denied'
                    ? 'Camera permission denied'
                    : error.type === 'not_found'
                    ? 'No camera device found'
                    : 'Camera unavailable'}
                </Typography>
                <Typography variant="caption" color="grey.600">
                  {error.message}
                </Typography>
              </>
            ) : (
              <Typography variant="body2" color="grey.600">
                Camera feed not active
              </Typography>
            )}
          </Box>
        )}
      </Box>

    </Paper>
  );
}
