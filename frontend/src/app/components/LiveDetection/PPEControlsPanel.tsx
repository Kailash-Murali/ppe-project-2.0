// PPEControlsPanel.tsx — Collapsible card with per-class checkboxes + confidence sliders.

import { useState } from 'react';
import {
  Box,
  Paper,
  Typography,
  IconButton,
  Collapse,
  FormControlLabel,
  Checkbox,
  Slider,
} from '@mui/material';
import { ExpandMore, ExpandLess } from '@mui/icons-material';
import { ALL_PPE_KEYS, PPE_LABEL_MAP } from './types';

interface PPEControlsPanelProps {
  activeClasses:        string[];
  onActiveClassChange:  (classes: string[]) => void;
}

export function PPEControlsPanel({
  activeClasses,
  onActiveClassChange,
}: PPEControlsPanelProps) {
  const [expanded, setExpanded] = useState(true);

  const handleCheckboxChange = (key: string, checked: boolean) => {
    if (!checked && activeClasses.length <= 1) {
      // Minimum-one-active-class guard: ignore unchecking the last class
      return;
    }
    const next = checked
      ? [...activeClasses, key]
      : activeClasses.filter((k) => k !== key);
    onActiveClassChange(next);
  };

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          px: 2.5,
          py: 1.5,
          ...(expanded && {
            borderBottom: '1px solid',
            borderColor: 'divider',
          }),
        }}
      >
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'text.secondary',
          }}
        >
          PPE Controls
        </Typography>
        <IconButton size="small" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? <ExpandLess /> : <ExpandMore />}
        </IconButton>
      </Box>

      {/* Collapsible body */}
      <Collapse in={expanded}>
        {/* Checkboxes */}
        <Box sx={{ px: 2, pt: 1.5, pb: 0.5, display: 'flex', flexDirection: 'column' }}>
          {ALL_PPE_KEYS.map((key) => (
            <FormControlLabel
              key={key}
              control={
                <Checkbox
                  size="small"
                  checked={activeClasses.includes(key)}
                  onChange={(_e, checked) => handleCheckboxChange(key, checked)}
                />
              }
              label={PPE_LABEL_MAP[key] ?? key}
            />
          ))}
        </Box>


      </Collapse>
    </Paper>
  );
}
