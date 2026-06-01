import {
  Box,
  ButtonBase,
  Typography
} from "@mui/material";

export default function CompactMetricCard({
  title,
  value,
  unit,
  color,
  icon,
  onClick
}) {

  const cardSx = {
    borderRadius: "26px",
    overflow: "hidden",
    background: color,
    boxShadow:
      "0 14px 34px rgba(15,23,42,0.10)",
    display: "block",
    width: "100%",
    textAlign: "left",
    minHeight: 138,
    transition:
      "transform .2s ease, box-shadow .2s ease",
    ...(onClick && {
      cursor: "pointer",
      "&:hover": {
        transform:
          "translateY(-2px)",
        boxShadow:
          "0 18px 44px rgba(15,23,42,0.16)"
      },
      "&:focus-visible": {
        outline:
          `3px solid ${color}55`,
        outlineOffset: 3
      }
    })
  };

  const content = (

    <>

      <Box
        sx={{
          color: "#fff",
          px: 2.4,
          pt: 1.8,
          pb: 4.2,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1.5
        }}
      >
        <Typography
          sx={{
            fontSize: 15,
            fontWeight: 850,
            lineHeight: 1.2,
            color: "#fff"
          }}
        >
          {title}
        </Typography>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            width: 34,
            height: 34,
            borderRadius: "14px",
            background:
              "rgba(255,255,255,0.18)",
            color: "#fff",
            "& svg": {
              fontSize: 21
            }
          }}
        >
          {icon}
        </Box>
      </Box>

      <Box
        sx={{
          mt: -2.4,
          mx: 1.4,
          mb: 1.4,
          p: 2,
          minHeight: 86,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 1.5,
          borderRadius: "22px",
          background: "#fff",
          boxShadow:
            "0 -1px 0 rgba(255,255,255,0.7), 0 10px 24px rgba(15,23,42,0.08)"
        }}
      >

        <Box>

          <Typography
            sx={{
              fontSize: 24,
              fontWeight: 950,
              lineHeight: 1,
              color: "#111827"
            }}
          >
            {Number(value).toLocaleString()}
          </Typography>

          <Typography
            sx={{
              fontSize: 12,
              color: "#6B7280",
              fontWeight: 750,
              mt: 0.8,
              textTransform: "uppercase"
            }}
          >
            {unit}
          </Typography>

        </Box>

        <Box
          sx={{
            flexShrink: 0,
            px: onClick ? 1.8 : 1.2,
            height: 36,
            borderRadius: "999px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              onClick
                ? "#0F172A"
                : `${color}18`,
            color:
              onClick
                ? "#fff"
                : color,
            fontSize: 12,
            fontWeight: 850,
            whiteSpace: "nowrap",
            "& svg": {
              fontSize: 22
            }
          }}
        >
          {
            onClick
              ? "View Detail"
              : icon
          }
        </Box>

      </Box>

    </>
  );

  if (onClick) {

    return (

      <ButtonBase
        onClick={onClick}
        sx={cardSx}
      >
        {content}
      </ButtonBase>
    );
  }

  return (

    <Box
      sx={cardSx}
    >
      {content}

    </Box>
  );
}
