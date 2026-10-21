/**
 * DashboardLayout.tsx — Top-level shell: AppBar, nav, theme toggle, page slot.
 *
 * Changes from v1:
 *  - react-router → react-router-dom (correct package for web apps).
 *  - Mobile hamburger + Menu collapsed into a single <MobileNav> sub-component
 *    to remove the duplicated {!isDesktop && ...} blocks.
 *  - Hardcoded "52px" Toolbar height replaced with a TOOLBAR_HEIGHT constant
 *    so the AppBar and page content offset stay in sync automatically.
 *  - Inline hex colour strings replaced with theme palette tokens.
 *  - ARIA: nav landmark and hamburger button have descriptive labels.
 *  - Responsive page padding: xs=1.5, sm=2, md=3 (was fixed 3 on all sizes).
 */

import { useState, ReactNode } from 'react';
import {
  Box, AppBar, Toolbar, IconButton,
  Tooltip, useMediaQuery, useTheme,
  Menu, MenuItem as MuiMenuItem,
  Typography,
} from '@mui/material';
import {
  CameraAltOutlined, DarkModeOutlined,
  LightModeOutlined, MenuOutlined, BarChartOutlined,
} from '@mui/icons-material';
import { NavLink, useNavigate } from 'react-router-dom';

/** Single source of truth for AppBar height used across layout and offset. */
const TOOLBAR_HEIGHT = 52;

const NAV_ITEMS = [
  { to: '/live-detection', label: 'PPE Detection', icon: <CameraAltOutlined fontSize="small" /> },
  { to: '/model-metrics',  label: 'Model Metrics', icon: <BarChartOutlined  fontSize="small" /> },
];

type Props = { children: ReactNode; mode: 'light' | 'dark'; onToggleMode: () => void };

// ── Mobile hamburger + dropdown — extracted to remove duplicate JSX ────────────
function MobileNav() {
  const navigate = useNavigate();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);

  return (
    <>
      <IconButton
        size="small"
        aria-label="Open navigation menu"
        aria-haspopup="true"
        aria-expanded={Boolean(menuAnchor)}
        onClick={(e) => setMenuAnchor(e.currentTarget)}
      >
        <MenuOutlined fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={() => setMenuAnchor(null)}
        PaperProps={{ elevation: 2, sx: { mt: 1, minWidth: 220, borderRadius: 1.5 } }}
      >
        {NAV_ITEMS.map((item) => (
          <MuiMenuItem
            key={item.to}
            onClick={() => { navigate(item.to); setMenuAnchor(null); }}
            sx={{ fontSize: 13, gap: 1.5 }}
          >
            {item.icon}
            {item.label}
          </MuiMenuItem>
        ))}
      </Menu>
    </>
  );
}

// ── Main layout ────────────────────────────────────────────────────────────────
export function DashboardLayout({ children, mode, onToggleMode }: Props) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up('md'));

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', bgcolor: 'background.default' }}>

      {/* ── Topbar ── */}
      <AppBar
        position="fixed"
        elevation={0}
        sx={{
          bgcolor: 'background.paper',
          color: 'text.primary',
          borderBottom: '1px solid',
          borderColor: 'divider',
        }}
      >
        <Toolbar sx={{ minHeight: `${TOOLBAR_HEIGHT}px !important`, gap: 1.5, px: { xs: 2, md: 3 } }}>

          {/* Text-only logo */}
          <Box sx={{ display: 'flex', alignItems: 'center', mr: 2, flexShrink: 0 }}>
            <Typography
              variant="h6"
              noWrap
              sx={{
                fontWeight: 700,
                letterSpacing: '.05rem',
                color: 'primary.main',
                textDecoration: 'none',
                fontSize: '1rem',
              }}
            >
              PPE Detect
            </Typography>
          </Box>

          {/* Inline nav links — desktop only */}
          {isDesktop && (
            <Box component="nav" aria-label="Main navigation" sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
              {NAV_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} style={{ textDecoration: 'none' }}>
                  {({ isActive }) => (
                    <Box
                      sx={{
                        display: 'flex', alignItems: 'center', gap: 0.75,
                        px: 1.5, py: 0.75, borderRadius: 1,
                        fontSize: 13, fontWeight: isActive ? 600 : 500,
                        color: isActive ? 'primary.main' : 'text.secondary',
                        // Use theme palette token instead of hardcoded hex
                        bgcolor: isActive ? 'primary.light' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background 150ms ease, color 150ms ease',
                        '&:hover': {
                          bgcolor: isActive ? 'primary.light' : 'action.hover',
                          color: isActive ? 'primary.main' : 'text.primary',
                        },
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.icon}
                      {item.label}
                    </Box>
                  )}
                </NavLink>
              ))}
            </Box>
          )}

          <Box sx={{ flex: 1 }} />

          {/* Theme toggle */}
          <Tooltip title={mode === 'light' ? 'Dark mode' : 'Light mode'}>
            <IconButton onClick={onToggleMode} size="small" aria-label="Toggle colour theme">
              {mode === 'light' ? <DarkModeOutlined fontSize="small" /> : <LightModeOutlined fontSize="small" />}
            </IconButton>
          </Tooltip>

          {/* Mobile hamburger — rendered once via MobileNav sub-component */}
          {!isDesktop && <MobileNav />}
        </Toolbar>
      </AppBar>

      {/* ── Page content ── */}
      <Box
        component="main"
        sx={{
          flex: 1,
          pt: `${TOOLBAR_HEIGHT}px`,
          overflow: 'auto',
          minWidth: 0,
        }}
      >
        {/* Responsive padding: tighter on mobile, full on desktop */}
        <Box sx={{ p: { xs: 1.5, sm: 2, md: 3 } }}>{children}</Box>
      </Box>
    </Box>
  );
}
