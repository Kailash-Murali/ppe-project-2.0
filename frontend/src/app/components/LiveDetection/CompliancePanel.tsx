// CompliancePanel.tsx — PPE compliance list derived via useMemo.
// Req 8: useMemo derives compliance items from raw detections; only recomputes when
//        detections reference changes.
// Req 1: Confidence scores NOT shown in the main UI; StatusDot indicates compliance.

import { useMemo } from 'react';
import { Box, Typography, Paper, Chip } from '@mui/material';
import { CheckCircleOutlined, CancelOutlined } from '@mui/icons-material';
import { StatusDot } from './StatusDot';
import type { Detection, PPEItem } from './types';
import { PPE_LABEL_MAP } from './types';

interface Props {
  detections:    Detection[];
  isStreaming:   boolean;
  activeClasses: string[];
}

export function CompliancePanel({ detections, isStreaming, activeClasses }: Props) {
  // Req 8: useMemo — only recomputes when detections reference changes
  const ppeItems = useMemo((): PPEItem[] => {
    const labels = new Set(detections.map((d) => d.label.toLowerCase()));
    return activeClasses.map((key) => {
      const absentKey  = `no ${key}`;
      const isPresent  = labels.has(key);
      const isAbsent   = labels.has(absentKey);
      const isCompliant = isPresent && !isAbsent;
      return {
        itemKey:      key,
        // Req 1: Human-friendly label from lookup table; no raw score in display
        displayLabel: PPE_LABEL_MAP[key] ?? key,
        isCompliant,
      };
    });
  }, [detections, activeClasses]);

  const anyMissing = isStreaming && ppeItems.some((p) => !p.isCompliant);

  return (
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
      {/* Header */}
      <Box sx={{ px: 2.5, py: 1.5, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Typography
          sx={{
            fontSize: 11, fontWeight: 700,
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: 'text.secondary',
          }}
        >
          Compliance Monitor
        </Typography>
      </Box>

      {/* PPE item rows */}
      <Box sx={{ px: 2, py: 1 }}>
        {ppeItems.map((item, i) => (
          <Box
            key={item.itemKey}
            sx={{
              display: 'flex', alignItems: 'center', gap: 2,
              py: 1.5, px: 0.5,
              borderBottom: i < ppeItems.length - 1 ? '1px solid' : 'none',
              borderColor: 'divider',
            }}
          >
            {/* Req 11: StatusDot has role="img" + aria-label (in StatusDot.tsx) */}
            <StatusDot isCompliant={item.isCompliant} pulse={isStreaming} />

            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 600, fontSize: 14 }}>
                {item.displayLabel}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {!isStreaming
                  ? 'Camera inactive'
                  : item.isCompliant
                  ? 'Detected'
                  : 'Not detected'}
              </Typography>
            </Box>

            {/* Icon — labelled via the containing row context */}
            {isStreaming && (
              item.isCompliant
                ? <CheckCircleOutlined sx={{ fontSize: 18, color: 'success.main' }} aria-hidden="true" />
                : <CancelOutlined     sx={{ fontSize: 18, color: 'error.main' }}   aria-hidden="true" />
            )}
          </Box>
        ))}
      </Box>

      {/* Non-compliant banner */}
      {anyMissing && (
        <Box sx={{ px: 2, pb: 2 }}>
          <Chip
            label="⚠ PPE Missing"
            color="error"
            size="small"
            sx={{ fontWeight: 700, width: '100%' }}
          />
        </Box>
      )}
    </Paper>
  );
}
