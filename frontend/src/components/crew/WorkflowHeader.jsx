import { Box, Button, Chip, Stack, Typography } from "@mui/material";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function WorkflowHeader({
  eyebrow = "Crew operations",
  title,
  subtitle,
  count,
  countLabel = "pending",
  onRefresh,
  children,
  accent = "#0057B7",
}) {
  const navigate = useNavigate();

  return (
    <Box
      sx={{
        position: "relative",
        overflow: "hidden",
        px: { xs: 1.5, md: 2.25 },
        py: { xs: 1.4, md: 1.7 },
        border: "1px solid #D8E4F0",
        borderRadius: 3,
        background: "linear-gradient(115deg, #FFFFFF 0%, #F6FAFF 68%, #EEF6FF 100%)",
        boxShadow: "0 8px 26px rgba(15, 67, 120, .08)",
        "&::before": { content: '""', position: "absolute", inset: "0 auto 0 0", width: 6, background: accent },
      }}
    >
      <Stack direction={{ xs: "column", sm: "row" }} alignItems={{ sm: "center" }} justifyContent="space-between" spacing={1.2}>
        <Stack direction="row" alignItems="center" spacing={1.25} sx={{ minWidth: 0 }}>
          <Button
            onClick={() => navigate("/crew/operations")}
            startIcon={<ArrowLeft size={15} />}
            size="small"
            sx={{ flexShrink: 0, minWidth: 0, px: 1.15, color: "#334155", border: "1px solid #D6E0EB", background: "#FFF", textTransform: "none", fontWeight: 850 }}
          >
            Operations
          </Button>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ color: accent, fontSize: 10, lineHeight: 1.2, fontWeight: 950, letterSpacing: ".09em", textTransform: "uppercase" }}>{eyebrow}</Typography>
            <Stack direction="row" alignItems="center" spacing={.8}>
              <Typography sx={{ color: "#0F172A", fontSize: { xs: 18, md: 21 }, lineHeight: 1.25, fontWeight: 950 }}>{title}</Typography>
              {Number.isFinite(Number(count)) && Number(count) > 0 && <Chip size="small" label={`${count} ${countLabel}`} sx={{ height: 22, color: accent, background: `${accent}12`, border: `1px solid ${accent}35`, fontSize: 10, fontWeight: 900 }} />}
            </Stack>
            {subtitle && <Typography sx={{ mt: .2, color: "#64748B", fontSize: 11.2, fontWeight: 650 }}>{subtitle}</Typography>}
          </Box>
        </Stack>
        <Stack direction="row" alignItems="center" spacing={.75} sx={{ flexShrink: 0 }}>
          {children}
          {onRefresh && <Button onClick={onRefresh} startIcon={<RefreshCw size={14} />} size="small" sx={{ color: "#0057B7", border: "1px solid #B9D2EF", background: "#FFF", textTransform: "none", fontWeight: 900 }}>Refresh</Button>}
        </Stack>
      </Stack>
    </Box>
  );
}
