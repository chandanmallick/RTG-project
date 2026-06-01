import { Chip } from "@mui/material";

export default function StatusChip({ type }) {
  const config = {
    NEW: {
      bg: '#DCFCE7',
      color: '#166534',
    },

    MODIFIED: {
      bg: '#FEF3C7',
      color: '#92400E',
    },
  };

  return (
    <Chip
      label={type}
      size="small"
      sx={{
        bgcolor: config[type]?.bg,
        color: config[type]?.color,
        fontWeight: 700,
      }}
    />
  );
}