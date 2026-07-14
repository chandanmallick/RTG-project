import { Box, Typography } from "@mui/material";

/**
 * TabBar — UI Kit Section 8 pill-style tab navigation.
 *
 * @param {Array}    tabs       Array of { key, label, icon? }
 * @param {string}   activeTab  Currently active tab key
 * @param {function} onChange   Tab change handler (receives tab key)
 * @param {object}   sx         Additional MUI sx overrides
 */
export default function TabBar({
  tabs = [],
  activeTab,
  onChange,
  sx = {},
}) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "4px",
        p: "4px",
        backgroundColor: "var(--bg-surface)",
        border: "1px solid var(--border-color)",
        borderRadius: "var(--radius-lg)",
        ...sx,
      }}
    >
      {tabs.map((tab) => {
        const isActive = tab.key === activeTab;
        return (
          <Box
            key={tab.key}
            component="button"
            onClick={() => onChange(tab.key)}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              gap: 0.8,
              px: 2,
              py: 0.9,
              borderRadius: "var(--radius-md)",
              border: "none",
              backgroundColor: isActive ? "var(--grid-blue)" : "transparent",
              color: isActive ? "#FFFFFF" : "var(--steel-gray)",
              fontSize: "var(--font-body1)",
              fontWeight: isActive
                ? "var(--font-weight-bold)"
                : "var(--font-weight-medium)",
              fontFamily: "inherit",
              cursor: "pointer",
              transition: "all 0.2s ease",
              outline: "none",
              boxShadow: isActive
                ? "0 4px 12px rgba(13, 87, 183, 0.2)"
                : "none",
              "&:hover": {
                backgroundColor: isActive
                  ? "var(--grid-blue)"
                  : "rgba(13, 87, 183, 0.06)",
              },
              "&:focus-visible": {
                boxShadow: `0 0 0 3px rgba(13, 87, 183, 0.15)`,
              },
              "& svg": {
                width: 16,
                height: 16,
              },
            }}
          >
            {tab.icon}
            {tab.label}
          </Box>
        );
      })}
    </Box>
  );
}
