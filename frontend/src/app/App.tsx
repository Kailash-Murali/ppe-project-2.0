import { useMemo, useState } from 'react';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { buildTheme } from './theme';
import { DashboardLayout } from './components/DashboardLayout';
import { LiveDetection } from './components/LiveDetection/LiveDetection';

/**
 * QueryClient is created here (not inside LiveDetection) so it survives
 * LiveDetection remounts and is available to any future top-level routes.
 */
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 3 } },
});

export default function App() {
  const [mode, setMode] = useState<'light' | 'dark'>('light');
  const theme = useMemo(() => buildTheme(mode), [mode]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <DashboardLayout mode={mode} onToggleMode={() => setMode((m) => (m === 'light' ? 'dark' : 'light'))}>
            <Routes>
              <Route path="/" element={<Navigate to="/live-detection" replace />} />
              <Route path="/live-detection" element={<LiveDetection />} />
            </Routes>
          </DashboardLayout>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
