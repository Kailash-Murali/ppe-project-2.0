import { createTheme } from '@mui/material/styles';

// ─── Design Tokens ────────────────────────────────────────────────────────────
// Primary:  #C0111F  (Red — active states, CTAs)
// Success:  #1AAB5A  (compliant / detected)
// Warning:  #F59E0B  (partial / borderline)
// Error:    #E11D48  (violation / missing PPE)
//
// Light surfaces: bg #F7F7F7 → paper #FFFFFF
// Dark  surfaces: bg #111111 → paper #1A1A1A
// ─────────────────────────────────────────────────────────────────────────────

export const buildTheme = (mode: 'light' | 'dark') =>
  createTheme({
    palette: {
      mode,
      primary: {
        main:          '#C0111F',
        dark:          '#9e0e19',
        light:         mode === 'light' ? '#FEE2E2' : 'rgba(192,17,31,0.15)',
        contrastText:  '#FFFFFF',
      },
      secondary: {
        main:         mode === 'light' ? '#1A1A1A' : '#F0F0F0',
        contrastText: mode === 'light' ? '#FFFFFF' : '#111111',
      },
      error:   { main: '#E11D48', light: 'rgba(225,29,72,0.10)' },
      success: { main: '#1AAB5A', light: mode === 'light' ? '#E6F4EC' : 'rgba(26,171,90,0.15)' },
      warning: { main: '#F59E0B', light: mode === 'light' ? '#FEF3C7' : 'rgba(245,158,11,0.15)' },
      background: {
        default: mode === 'light' ? '#F7F7F7' : '#111111',
        paper:   mode === 'light' ? '#FFFFFF' : '#1A1A1A',
      },
      text: {
        primary:   mode === 'light' ? '#1A1A1A' : '#F0F0F0',
        secondary: mode === 'light' ? '#6B7280' : '#9CA3AF',
        disabled:  mode === 'light' ? '#B0B7C0' : '#4B5563',
      },
      divider: mode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
      action: {
        hover:    mode === 'light' ? 'rgba(0,0,0,0.04)' : 'rgba(255,255,255,0.05)',
        selected: mode === 'light' ? '#FEE2E2'           : 'rgba(192,17,31,0.14)',
      },
    },
    typography: {
      fontFamily:       "'Inter', system-ui, sans-serif",
      fontWeightMedium: 500,
      fontWeightBold:   700,
      button:  { textTransform: 'none', fontWeight: 600, fontSize: '0.8125rem', letterSpacing: 0 },
      body1:   { fontSize: '0.875rem' },
      body2:   { fontSize: '0.8125rem' },
      caption: { fontSize: '0.75rem', letterSpacing: '0.03em' },
    },
    shape: { borderRadius: 6 },
    components: {
      MuiButton: {
        styleOverrides: {
          root: {
            boxShadow: 'none',
            '&:hover': { boxShadow: 'none' },
            borderRadius: 6,
          },
          contained: {
            '&:hover': { bgcolor: '#9e0e19' },
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          root: { backgroundImage: 'none' },
          outlined: {
            borderColor: mode === 'light' ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.10)',
          },
        },
      },
      MuiChip: {
        styleOverrides: { root: { fontWeight: 600, borderRadius: 4 } },
      },
      MuiDivider: {
        styleOverrides: {
          root: {
            borderColor: mode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)',
          },
        },
      },
      MuiTooltip: {
        styleOverrides: {
          tooltip: {
            fontSize: '0.75rem',
            backgroundColor: mode === 'light' ? '#1A1A1A' : '#F0F0F0',
            color:            mode === 'light' ? '#FFFFFF' : '#111111',
            borderRadius: 4,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            backgroundColor: mode === 'light' ? '#FFFFFF' : '#1A1A1A',
            borderBottom: `1px solid ${mode === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
          },
        },
      },
      MuiLinearProgress: {
        styleOverrides: {
          root: { borderRadius: 999 },
          bar:  { borderRadius: 999 },
        },
      },
    },
  });
