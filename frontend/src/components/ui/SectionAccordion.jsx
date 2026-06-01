import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Typography,
  Box,
} from "@mui/material";

import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";

export default function SectionAccordion({
  title,
  subtitle,
  count,
  children,
  actions,
  defaultExpanded = true,
}) {
  return (
    <Accordion
      defaultExpanded={defaultExpanded}
      disableGutters
      elevation={0}
      sx={{
        mb: 3,

        borderRadius: "28px !important",

        overflow: "hidden",

        background:
          "rgba(255,255,255,0.68)",

        backdropFilter: "blur(22px)",

        border:
          "1px solid rgba(255,255,255,0.8)",

        boxShadow:
          "0 16px 40px rgba(15,23,42,0.06)",

        "&:before": {
          display: "none",
        },
      }}
    >
      <AccordionSummary
        expandIcon={
          <ExpandMoreRoundedIcon
            sx={{
              color: "#fff",
            }}
          />
        }
        sx={{
          px: 3,
          py: 1.5,

          background:
            "linear-gradient(135deg,#5B4B8A,#7B6BD6)",

          color: "#fff",

          minHeight:
            "76px !important",

          "& .MuiAccordionSummary-content": {
            alignItems: "center",
          },
        }}
      >
        <Box
          sx={{
            flex: 1,

            display: "flex",

            justifyContent:
              "space-between",

            alignItems: "center",

            pr: 2,
          }}
        >
          <Box>
            <Typography
              sx={{
                fontSize: 18,
                fontWeight: 800,
              }}
            >
              {title}
            </Typography>

            {subtitle && (
              <Typography
                sx={{
                  mt: 0.5,

                  fontSize: 13,

                  opacity: 0.82,
                }}
              >
                {subtitle}
              </Typography>
            )}
          </Box>

          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1.5,
            }}
          >
            {count !== undefined && (
              <Box
                sx={{
                  px: 1.6,
                  py: 0.7,

                  borderRadius: "999px",

                  background:
                    "rgba(255,255,255,0.16)",

                  fontSize: 13,

                  fontWeight: 700,
                }}
              >
                {count}
              </Box>
            )}

            <Box
              onClick={(e) =>
                e.stopPropagation()
              }
              onFocus={(e) =>
                e.stopPropagation()
              }
            >
              {actions}
            </Box>
          </Box>
        </Box>
      </AccordionSummary>

      <AccordionDetails
        sx={{
          p: 3,

          background:
            "rgba(248,250,255,0.72)",
        }}
      >
        {children}
      </AccordionDetails>
    </Accordion>
  );
}