// useCamera.ts — getUserMedia, stream lifecycle, cleanup.
// Ambiguity: videoRef is returned so CameraPanel can attach it to the <video> element.
// Req 3: All getUserMedia logic, error typing, and cleanup live here.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraError } from '../types';

export interface UseCameraReturn {
  videoRef: React.MutableRefObject<HTMLVideoElement | null>;
  stream: MediaStream | null;
  error: CameraError | null;
  isLoading: boolean;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
}

export function useCamera(): UseCameraReturn {
  const videoRef   = useRef<HTMLVideoElement | null>(null);
  const streamRef  = useRef<MediaStream | null>(null); // stable ref for cleanup in effects
  const [stream,    setStream]    = useState<MediaStream | null>(null);
  const [error,     setError]     = useState<CameraError | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStream(null);
  }, []);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        await videoRef.current.play();
      }
      streamRef.current = mediaStream;
      setStream(mediaStream);
    } catch (err: unknown) {
      // Req 7: Typed errors — no catch(e: any)
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setError({ type: 'permission_denied', message: 'Camera permission denied.' });
        } else if (err.name === 'NotFoundError') {
          setError({ type: 'not_found', message: 'No camera device found.' });
        } else {
          setError({ type: 'unknown', message: err.message });
        }
      } else {
        setError({ type: 'unknown', message: 'Unexpected camera error.' });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Req 3: Stop all tracks on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return { videoRef, stream, error, isLoading, startCamera, stopCamera };
}
