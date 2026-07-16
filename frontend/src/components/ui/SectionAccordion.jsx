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
        mb: 1.5,

        borderRadius: "16px !important",

        overflow: "hidden",

        background:
          "linear-gradient(180deg, #F7FAFD 0%, #FFFFFF 56px)",

        border:
          "1px solid rgba(184, 204, 227, 0.72)",

        boxShadow:
          "0 12px 30px rgba(15, 111, 219, 0.07)",

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
              fontSize: 20,
            }}
          />
        }
        sx={{
          px: 2,
          py: 0.75,

          background:
            "linear-gradient(135deg, #08103A 0%, #0057B7 100%)",

          color: "#fff",

          minHeight:
            "52px !important",

          "& .MuiAccordionSummary-content": {
            alignItems: "center",
            margin: "4px 0",
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

            pr: 1.5,
          }}
        >
          <Box>
            <Typography
              sx={{
                fontSize: 15,
                fontWeight: 800,
                lineHeight: 1.2,
              }}
            >
              {title}
            </Typography>

            {subtitle && (
              <Typography
                sx={{
                  mt: 0.25,

                  fontSize: 11.5,

                  opacity: 0.82,
                  lineHeight: 1.2,
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
                  px: 1.2,
                  py: 0.3,

                  borderRadius: "999px",

                  background:
                    "rgba(255,255,255,0.16)",

                  fontSize: 11,

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
              onKeyDown={(e) =>
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
          p: 1.5,

          background:
            "linear-gradient(180deg, #EAF1FB 0%, #FFFFFF 100%)",
        }}
      >
        {children}
      </AccordionDetails>
    </Accordion>
  );
}
