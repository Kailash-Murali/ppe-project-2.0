// useBackend.ts — WebSocket connection, exponential backoff reconnect, backend health.
// Req 4: Replaces HTTP polling. All real-time data arrives via WS push.
// Req 6: Reads VITE_WS_URL — never hardcodes URLs.
// Req 10: Validates URL before opening socket.
// Ambiguity: WS URL comes from Vite env (VITE_WS_URL), not REACT_APP_WS_URL (CRA only).

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import type { BackendError } from '../types';

// Req 10: URL validator
const isValidWsUrl = (url: string) => /^wss?:\/\/.+/.test(url);

const MAX_RETRIES    = 5;
const BASE_DELAY_MS  = 1000;

export interface UseBackendReturn {
  isConnected:   boolean;
  isReconnecting: boolean;
  lastPing:      number | null;
  error:         BackendError | null;
  sendMessage:   (data: string) => void;
  lastMessage:   string | null;
}

export function useBackend(): UseBackendReturn {
  // Req 6: Read from Vite env — validated, never hardcoded
  const wsUrl = import.meta.env.VITE_WS_URL as string | undefined;

  const wsRef            = useRef<WebSocket | null>(null);
  const retryCountRef    = useRef(0);
  const retryTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isUnmountedRef   = useRef(false);

  const [isConnected,    setIsConnected]    = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastPing,       setLastPing]       = useState<number | null>(null);
  const [error,          setError]          = useState<BackendError | null>(null);
  const [lastMessage,    setLastMessage]    = useState<string | null>(null);

  const connect = useCallback(() => {
    if (isUnmountedRef.current) return;

    // Req 10: Validate before attempting connection
    if (!wsUrl || !isValidWsUrl(wsUrl)) {
      console.error(`[useBackend] Invalid or missing VITE_WS_URL: "${wsUrl ?? ''}"`);
      setError({ type: 'invalid_url', message: `Invalid WebSocket URL: "${wsUrl ?? ''}"` });
      return;
    }

    // Close stale connection if any
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close();
    }

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (isUnmountedRef.current) return;
      retryCountRef.current = 0;
      setIsConnected(true);
      setIsReconnecting(false);
      setLastPing(Date.now());
      setError(null);
      toast.success('Backend connected');
    };

    ws.onmessage = (event: MessageEvent<string>) => {
      setLastPing(Date.now());
      setLastMessage(event.data);
    };

    ws.onclose = () => {
      if (isUnmountedRef.current) return;
      setIsConnected(false);
      const retries = retryCountRef.current;
      if (retries < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * Math.pow(2, retries);
        setIsReconnecting(true);
        // Req 7: Toast for disconnect/reconnect
        toast(`Reconnecting… attempt ${retries + 1}/${MAX_RETRIES}`, { icon: '🔄' });
        retryTimerRef.current = setTimeout(() => {
          retryCountRef.current += 1;
          connect();
        }, delay);
      } else {
        setIsReconnecting(false);
        toast.error('Backend disconnected — max retries reached');
        setError({ type: 'connection_failed', message: 'Max reconnect attempts reached.' });
      }
    };

    // onerror fires before onclose; meaningful info is in onclose
    ws.onerror = () => { /* handled in onclose */ };
  }, [wsUrl]); // wsUrl is static (import.meta.env), so connect is stable

  useEffect(() => {
    isUnmountedRef.current = false;
    connect();
    return () => {
      isUnmountedRef.current = true;
      retryTimerRef.current && clearTimeout(retryTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((data: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  return { isConnected, isReconnecting, lastPing, error, sendMessage, lastMessage };
}
