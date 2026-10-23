import React, { useState, useMemo } from 'react';
import { Box, Typography, Button, Collapse, Chip, Stack } from '@mui/material';
import { AlertTriangle, ChevronDown, ChevronUp, Info, CheckCircle2 } from 'lucide-react';

/**
 * OptimizedWarnings: An executive, compact, world-class UI component for displaying
 * data availability notes, generator schedule notices, and coverage warnings without
 * cluttering the interface with dozens of repetitive bulky warning banners.
 */
export default function OptimizedWarnings({ warnings = [], title = "Data Availability & Entity Notes" }) {
  const [expanded, setExpanded] = useState(false);

  const parsed = useMemo(() => {
    if (!warnings || !Array.isArray(warnings) || !warnings.length) {
      return { total: 0, scheduleStations: [], excludedGenerators: [], generalNotices: [] };
    }

    // Deduplicate raw strings
    const uniqueRaw = Array.from(new Set(warnings.filter(Boolean)));
    const scheduleStations = [];
    const excludedGenerators = [];
    const generalNotices = [];

    uniqueRaw.forEach((w) => {
      const text = String(w).trim();

      // Check pattern 1: "X generating station(s) without separate schedule column (OD/UI unavailable): A, B, C"
      const groupedScheduleMatch = text.match(/^(\d+)\s+generating station\(s\)\s+without separate schedule column[^:]*:\s*(.*)$/i);
      if (groupedScheduleMatch) {
        const stationList = groupedScheduleMatch[2].split(',').map(s => s.trim()).filter(Boolean);
        scheduleStations.push(...stationList);
        return;
      }

      // Check pattern 2: "PLANT NAME: no separate schedule column; OD/UI remains unavailable."
      const singleScheduleMatch = text.match(/^(.*?):\s*no separate schedule column;\s*OD\/UI remains unavailable\.?$/i);
      if (singleScheduleMatch) {
        scheduleStations.push(singleScheduleMatch[1].trim());
        return;
      }

      // Check pattern 3: "State-sector or unclassified generators excluded from State drawal / ISGS / IPP: A, B, C"
      const excludedMatch = text.match(/^(?:State-sector or unclassified generators excluded[^:]*):\s*(.*)$/i);
      if (excludedMatch) {
        const genList = excludedMatch[1].split(',').map(s => s.trim()).filter(Boolean);
        excludedGenerators.push(...genList);
        return;
      }

      generalNotices.push(text);
    });

    const uniqStations = Array.from(new Set(scheduleStations));
    const uniqExcluded = Array.from(new Set(excludedGenerators));
    const totalCount = uniqStations.length + uniqExcluded.length + generalNotices.length;

    return {
      total: totalCount,
      scheduleStations: uniqStations,
      excludedGenerators: uniqExcluded,
      generalNotices,
    };
  }, [warnings]);

  if (!parsed.total) return null;

  // Build summary subtitle
  const summaryParts = [];
  if (parsed.scheduleStations.length > 0) {
    summaryParts.push(`${parsed.scheduleStations.length} station(s) lack separate schedule (OD/UI unavailable)`);
  }
  if (parsed.excludedGenerators.length > 0) {
    summaryParts.push(`${parsed.excludedGenerators.length} state-sector generator(s) excluded from ISGS/IPP drawal`);
  }
  if (parsed.generalNotices.length > 0) {
    summaryParts.push(`${parsed.generalNotices.length} system notice(s)`);
  }
  const summaryText = summaryParts.join(' · ');

  return (
    <Box
      sx={{
        my: 1.5,
        borderRadius: '9px',
        border: '1px solid #FCD34D',
        background: 'linear-gradient(135deg, #FEFCE8 0%, #FFFBEB 100%)',
        p: '7px 14px',
        boxShadow: '0 1px 3px rgba(217, 119, 6, 0.05)',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          flexWrap: 'wrap',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, minWidth: 0, flex: '1 1 auto' }}>
          <AlertTriangle size={15} color="#D97706" style={{ flexShrink: 0 }} />
          <Box sx={{ minWidth: 0 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography sx={{ fontSize: 12.5, fontWeight: 800, color: '#92400E' }}>
                {title}
              </Typography>
              <Chip
                size="small"
                label={`${parsed.total} Notice${parsed.total > 1 ? 's' : ''}`}
                sx={{
                  height: 18,
                  fontSize: 10,
                  fontWeight: 800,
                  bgcolor: '#FDE68A',
                  color: '#78350F',
                }}
              />
            </Box>
            <Typography
              sx={{
                fontSize: 11,
                color: '#B45309',
                mt: 0.1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                maxWidth: { xs: '260px', sm: '500px', md: '750px' },
              }}
              title={summaryText}
            >
              {summaryText}
            </Typography>
          </Box>
        </Box>

        <Button
          size="small"
          onClick={() => setExpanded((v) => !v)}
          endIcon={expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          sx={{
            textTransform: 'none',
            fontSize: 11,
            fontWeight: 800,
            color: '#92400E',
            bgcolor: 'rgba(251, 191, 36, 0.22)',
            '&:hover': { bgcolor: 'rgba(251, 191, 36, 0.38)' },
            px: 1.25,
            py: 0.25,
            minHeight: 24,
            borderRadius: '6px',
            border: '1px solid #FCD34D',
          }}
        >
          {expanded ? 'Hide Details' : 'View Details'}
        </Button>
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ mt: 1.25, pt: 1, borderTop: '1px solid #FDE68A' }}>
          {parsed.scheduleStations.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography
                sx={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: '#78350F',
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  mb: 0.5,
                }}
              >
                Generating Stations Without Separate Schedule ({parsed.scheduleStations.length})
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 0.5,
                  maxHeight: 110,
                  overflowY: 'auto',
                  p: 0.75,
                  bgcolor: 'rgba(255, 255, 255, 0.75)',
                  borderRadius: '6px',
                  border: '1px solid #FDE68A',
                }}
              >
                {parsed.scheduleStations.map((station) => (
                  <Chip
                    key={station}
                    size="small"
                    label={station}
                    sx={{
                      bgcolor: '#FFFFFF',
                      color: '#92400E',
                      border: '1px solid #FCD34D',
                      fontSize: 10,
                      fontWeight: 700,
                      height: 20,
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {parsed.excludedGenerators.length > 0 && (
            <Box sx={{ mb: 1 }}>
              <Typography
                sx={{
                  fontSize: 10.5,
                  fontWeight: 800,
                  color: '#78350F',
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                  mb: 0.5,
                }}
              >
                State-Sector / Unclassified Units Excluded from State Drawal ({parsed.excludedGenerators.length})
              </Typography>
              <Box
                sx={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 0.5,
                  maxHeight: 80,
                  overflowY: 'auto',
                  p: 0.75,
                  bgcolor: 'rgba(255, 255, 255, 0.75)',
                  borderRadius: '6px',
                  border: '1px solid #FDE68A',
                }}
              >
                {parsed.excludedGenerators.map((gen) => (
                  <Chip
                    key={gen}
                    size="small"
                    label={gen}
                    sx={{
                      bgcolor: '#FFFFFF',
                      color: '#92400E',
                      border: '1px solid #FCD34D',
                      fontSize: 10,
                      fontWeight: 700,
                      height: 20,
                    }}
                  />
                ))}
              </Box>
            </Box>
          )}

          {parsed.generalNotices.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4, mt: 0.5 }}>
              {parsed.generalNotices.map((notice, idx) => (
                <Typography key={idx} sx={{ fontSize: 11, color: '#92400E', lineHeight: 1.4 }}>
                  • {notice}
                </Typography>
              ))}
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  );
}
