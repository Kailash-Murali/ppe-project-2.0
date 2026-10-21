/**
 * ModelMetrics.tsx — Federated vs Baseline model comparison dashboard.
 *
 * Shows:
 *  - Hero stat cards (mAP50, mAP50-95, Precision, Recall) with delta badges
 *  - Per-class mAP50 grouped bar chart and radar chart (recharts)
 *  - Cross-zone accuracy table (solo A, solo B, centralized, FedAvg)
 *  - "Pending" placeholder state when federated run hasn't completed yet
 *
 * To update once the federated run completes:
 *   1. Fill in the `federated` values in OVERALL_METRICS, CLASS_METRICS, RADAR_DATA.
 *   2. Fill in ZONE_ROWS and change status to 'done'.
 */

import { useState } from 'react';
import {
  Box, Typography, Paper, Chip, Divider,
  ToggleButton, ToggleButtonGroup,
} from '@mui/material';
import {
  TrendingUpOutlined, TrendingDownOutlined,
  HubOutlined, CheckCircleOutlined,
} from '@mui/icons-material';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Legend, Tooltip as RechartsTip, Cell,
} from 'recharts';

// ─── Colour tokens (mirrors theme.ts) ─────────────────────────────────────────
const RED   = '#C0111F';
const BLUE  = '#3B82F6';
const GREEN = '#1AAB5A';
const AMBER = '#F59E0B';
const MUTED = '#9CA3AF';

// ─── Static metric data ────────────────────────────────────────────────────────
// Replace `federated: null` with real numbers once `eval_comparison.py` runs.

interface OverallMetric {
  label: string;
  unit: string;
  baseline: number;
  federated: number | null;
}

const OVERALL_METRICS: OverallMetric[] = [
  { label: 'mAP50',      unit: '%', baseline: 62.4, federated: null },
  { label: 'mAP50-95',  unit: '%', baseline: 38.1, federated: null },
  { label: 'Precision', unit: '%', baseline: 71.3, federated: null },
  { label: 'Recall',    unit: '%', baseline: 58.9, federated: null },
];

interface ClassMetric {
  cls: string;
  baseline: number;
  federated: number | null;
}

const CLASS_METRICS: ClassMetric[] = [
  { cls: 'Boots',      baseline: 68.2, federated: null },
  { cls: 'Glasses',    baseline: 52.1, federated: null },
  { cls: 'Gloves',     baseline: 71.4, federated: null },
  { cls: 'Helmet',     baseline: 79.3, federated: null },
  { cls: 'No Boots',   baseline: 61.5, federated: null },
  { cls: 'No Glasses', baseline: 47.8, federated: null },
  { cls: 'No Gloves',  baseline: 64.2, federated: null },
  { cls: 'No Helmet',  baseline: 55.6, federated: null },
];

interface RadarPoint {
  axis: string;
  baseline: number;
  federated: number;
}

const RADAR_DATA: RadarPoint[] = [
  { axis: 'mAP50',        baseline: 62, federated: 0 },
  { axis: 'mAP50-95',     baseline: 38, federated: 0 },
  { axis: 'Precision',    baseline: 71, federated: 0 },
  { axis: 'Recall',       baseline: 59, federated: 0 },
  { axis: 'Cross-Zone A', baseline: 48, federated: 0 },
  { axis: 'Cross-Zone B', baseline: 44, federated: 0 },
];

interface ZoneRow {
  model: string;
  zoneA: number | null;
  zoneB: number | null;
  crossZoneAvg: number | null;
  status: 'done' | 'pending';
}

// Baseline cross-zone values filled from notebook: model was trained on pooled data,
// here we show a rough same-data validation number as the baseline reference.
const ZONE_ROWS: ZoneRow[] = [
  { model: 'Baseline (best.pt)',  zoneA: 62.4, zoneB: 61.8, crossZoneAvg: 62.1, status: 'done' },
  { model: 'Node A Solo',         zoneA: null,  zoneB: null,  crossZoneAvg: null, status: 'pending' },
  { model: 'Node B Solo',         zoneA: null,  zoneB: null,  crossZoneAvg: null, status: 'pending' },
  { model: 'Centralized Pooled',  zoneA: null,  zoneB: null,  crossZoneAvg: null, status: 'pending' },
  { model: 'FedAvg Global',       zoneA: null,  zoneB: null,  crossZoneAvg: null, status: 'pending' },
];

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <Typography
      sx={{
        fontSize: 11, fontWeight: 700, letterSpacing: '0.10em',
        textTransform: 'uppercase', color: 'text.secondary', mb: 2,
      }}
    >
      {children}
    </Typography>
  );
}

function PendingBadge() {
  return (
    <Chip
      label="Pending"
      size="small"
      sx={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.04em',
        bgcolor: 'warning.light', color: AMBER,
        border: '1px solid', borderColor: AMBER,
        height: 20,
      }}
    />
  );
}

function MetricCard({ label, unit, baseline, federated }: OverallMetric) {
  const hasFed = federated !== null;
  const delta  = hasFed ? (federated as number) - baseline : null;
  const isUp   = delta !== null && delta >= 0;

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2.5, borderRadius: 2, position: 'relative', overflow: 'hidden',
        transition: 'box-shadow 200ms ease',
        '&:hover': { boxShadow: 3 },
      }}
    >
      {/* Left accent stripe — grey when pending, green/red when result in */}
      <Box
        sx={{
          position: 'absolute', top: 0, left: 0, bottom: 0, width: 4,
          bgcolor: hasFed ? (isUp ? GREEN : RED) : MUTED,
          borderRadius: '2px 0 0 2px',
        }}
      />

      <Box sx={{ pl: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>

        {/* Baseline value */}
        <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 0.5, mt: 0.5 }}>
          <Typography sx={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>
            {baseline.toFixed(1)}
          </Typography>
          <Typography variant="caption" color="text.secondary">{unit}</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">Baseline</Typography>

        {/* Federated value + delta OR pending */}
        <Box sx={{ mt: 1.5 }}>
          {hasFed ? (
            <>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                <Typography sx={{ fontSize: 20, fontWeight: 700, color: isUp ? GREEN : RED }}>
                  {(federated as number).toFixed(1)}{unit}
                </Typography>
                <Chip
                  icon={
                    isUp
                      ? <TrendingUpOutlined sx={{ fontSize: 13 }} />
                      : <TrendingDownOutlined sx={{ fontSize: 13 }} />
                  }
                  label={`${isUp ? '+' : ''}${(delta as number).toFixed(1)}${unit}`}
                  size="small"
                  sx={{
                    bgcolor: isUp ? 'success.light' : 'error.light',
                    color:   isUp ? GREEN : RED,
                    fontWeight: 700, fontSize: 11, height: 22,
                  }}
                />
              </Box>
              <Typography variant="caption" color="text.secondary">FedAvg Global</Typography>
            </>
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography sx={{ fontSize: 20, fontWeight: 700, color: 'text.disabled' }}>—</Typography>
              <PendingBadge />
            </Box>
          )}
        </Box>
      </Box>
    </Paper>
  );
}

function BarTooltip({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <Paper elevation={3} sx={{ p: 1.5, borderRadius: 1.5, minWidth: 140 }}>
      <Typography sx={{ fontWeight: 700, mb: 0.5, fontSize: 13 }}>{label}</Typography>
      {payload.map((p: any) => (
        <Box key={p.name} sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
          <Typography variant="caption" sx={{ color: p.color, fontWeight: 600 }}>{p.name}</Typography>
          <Typography variant="caption" sx={{ fontWeight: 700 }}>
            {p.value != null && p.value > 0 ? `${(p.value as number).toFixed(1)}%` : '—'}
          </Typography>
        </Box>
      ))}
    </Paper>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
export function ModelMetrics() {
  const [chartMode, setChartMode] = useState<'bar' | 'radar'>('bar');
  const fedAvailable = OVERALL_METRICS.some((m) => m.federated !== null);

  return (
    <Box sx={{ maxWidth: 1100, mx: 'auto' }}>

      {/* ── Page header ── */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Model Metrics
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Baseline <strong>best.pt</strong> vs Federated <strong>FedAvg Global</strong> checkpoint
          </Typography>
        </Box>

        <Chip
          icon={
            fedAvailable
              ? <CheckCircleOutlined sx={{ fontSize: 15 }} />
              : <HubOutlined sx={{ fontSize: 15 }} />
          }
          label={fedAvailable ? 'Federated results available' : 'Federated training in progress'}
          size="small"
          sx={{
            fontWeight: 700, fontSize: 12,
            bgcolor: fedAvailable ? 'success.light' : 'warning.light',
            color:   fedAvailable ? GREEN : AMBER,
            border: '1px solid',
            borderColor: fedAvailable ? GREEN : AMBER,
          }}
        />
      </Box>

      {/* ── Hero metric cards (2×2 on mobile, 4 across on desktop) ── */}
      <SectionLabel>Overall Performance</SectionLabel>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr 1fr', md: 'repeat(4, 1fr)' },
          gap: 2,
          mb: 4,
        }}
      >
        {OVERALL_METRICS.map((m) => (
          <MetricCard key={m.label} {...m} />
        ))}
      </Box>

      <Divider sx={{ mb: 4 }} />

      {/* ── Per-class chart ── */}
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2, flexWrap: 'wrap', gap: 1 }}>
        <SectionLabel>Per-Class mAP50</SectionLabel>
        <ToggleButtonGroup
          value={chartMode}
          exclusive
          size="small"
          onChange={(_, v: 'bar' | 'radar' | null) => v && setChartMode(v)}
          sx={{ mb: 2 }}
        >
          <ToggleButton value="bar"   sx={{ px: 2, fontSize: 12 }}>Bar</ToggleButton>
          <ToggleButton value="radar" sx={{ px: 2, fontSize: 12 }}>Radar</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      <Paper variant="outlined" sx={{ borderRadius: 2, p: 2.5, mb: 4 }}>
        {chartMode === 'bar' ? (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={CLASS_METRICS} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" />
              <XAxis
                dataKey="cls"
                tick={{ fontSize: 11, fill: MUTED }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: MUTED }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => `${v}%`}
              />
              <RechartsTip content={<BarTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 12 }} />
              <Bar dataKey="baseline"  name="Baseline" fill={RED}  radius={[3, 3, 0, 0]} maxBarSize={28} />
              <Bar dataKey="federated" name="FedAvg"   fill={BLUE} radius={[3, 3, 0, 0]} maxBarSize={28}>
                {CLASS_METRICS.map((row, i) => (
                  <Cell key={i} fill={BLUE} fillOpacity={row.federated != null ? 1 : 0.2} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={RADAR_DATA} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
              <PolarGrid stroke="rgba(0,0,0,0.08)" />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: MUTED }} />
              <Radar name="Baseline" dataKey="baseline"  stroke={RED}  fill={RED}  fillOpacity={0.18} strokeWidth={2} />
              <Radar name="FedAvg"   dataKey="federated" stroke={BLUE} fill={BLUE} fillOpacity={0.12} strokeWidth={2} strokeDasharray="4 2" />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </RadarChart>
          </ResponsiveContainer>
        )}

        {!fedAvailable && (
          <Box
            sx={{
              mt: 1.5, p: 1.5, borderRadius: 1.5,
              bgcolor: 'warning.light',
              border: '1px dashed', borderColor: AMBER,
              display: 'flex', alignItems: 'center', gap: 1,
            }}
          >
            <Typography variant="caption" sx={{ color: AMBER, fontWeight: 600 }}>
              FedAvg bars will appear once <code>eval_comparison.py</code> runs and the values above are updated.
            </Typography>
          </Box>
        )}
      </Paper>

      <Divider sx={{ mb: 4 }} />

      {/* ── Cross-zone table ── */}
      <SectionLabel>Cross-Zone Accuracy (mAP50)</SectionLabel>
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden', mb: 2 }}>

        {/* Header row */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr 90px',
            px: 2.5, py: 1.25,
            bgcolor: 'action.hover',
            borderBottom: '1px solid', borderColor: 'divider',
          }}
        >
          {['Model', 'Zone A val', 'Zone B val', 'Cross-Zone Avg', 'Status'].map((h) => (
            <Typography
              key={h}
              sx={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'text.secondary' }}
            >
              {h}
            </Typography>
          ))}
        </Box>

        {ZONE_ROWS.map((row, i) => {
          const isFedAvg = row.model.startsWith('FedAvg');
          return (
            <Box
              key={row.model}
              sx={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr 90px',
                px: 2.5, py: 1.5,
                borderBottom: i < ZONE_ROWS.length - 1 ? '1px solid' : 'none',
                borderColor: 'divider',
                bgcolor: isFedAvg ? 'primary.light' : 'transparent',
                alignItems: 'center',
                transition: 'background 150ms ease',
                '&:hover': { bgcolor: isFedAvg ? 'primary.light' : 'action.hover' },
              }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Typography sx={{ fontWeight: isFedAvg ? 700 : 500, fontSize: 13, color: isFedAvg ? 'primary.main' : 'text.primary' }}>
                  {row.model}
                </Typography>
                {isFedAvg && (
                  <Chip
                    label="Goal"
                    size="small"
                    sx={{ height: 18, fontSize: 10, fontWeight: 700, bgcolor: 'primary.main', color: '#fff' }}
                  />
                )}
              </Box>

              {[row.zoneA, row.zoneB, row.crossZoneAvg].map((v, j) => (
                <Typography
                  key={j}
                  sx={{
                    fontSize: 13, fontWeight: 600,
                    color: v != null
                      ? (isFedAvg ? 'primary.main' : 'text.primary')
                      : 'text.disabled',
                  }}
                >
                  {v != null ? `${v.toFixed(1)}%` : '—'}
                </Typography>
              ))}

              <Box>
                {row.status === 'done'
                  ? (
                    <Chip
                      label="Done"
                      size="small"
                      sx={{ bgcolor: 'success.light', color: GREEN, fontWeight: 700, fontSize: 10, height: 20 }}
                    />
                  ) : (
                    <PendingBadge />
                  )}
              </Box>
            </Box>
          );
        })}
      </Paper>

      <Typography variant="caption" color="text.secondary">
        Key goal: FedAvg global cross-zone accuracy should exceed both solo models' cross-zone scores.
      </Typography>
    </Box>
  );
}
