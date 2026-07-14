import { Box, Switch, Typography } from "@mui/material";

/**
 * ToggleSwitch — UI Kit Section 8 toggle element.
 *
 * @param {boolean}  checked   Toggle state
 * @param {function} onChange  Change handler
 * @param {string}   label    Label text
 * @param {boolean}  disabled Disabled state
 * @param {object}   sx       Additional MUI sx overrides
 */
export default function ToggleSwitch({
  checked = false,
  onChange,
  label,
  disabled = false,
  sx = {},
}) {
  return (
    <Box
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 1,
        ...sx,
      }}
    >
      <Switch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        sx={{
          width: 44,
          height: 24,
          p: 0,
          "& .MuiSwitch-switchBase": {
            p: 0,
            m: "2px",
            transitionDuration: "200ms",
            "&.Mui-checked": {
              transform: "translateX(20px)",
              color: "#FFFFFF",
              "& + .MuiSwitch-track": {
                backgroundColor: "var(--grid-green)",
                opacity: 1,
                border: 0,
              },
            },
            "&.Mui-disabled + .MuiSwitch-track": {
              opacity: 0.4,
            },
          },
          "& .MuiSwitch-thumb": {
            width: 20,
            height: 20,
            boxShadow: "0 2px 4px rgba(0,0,0,0.15)",
          },
          "& .MuiSwitch-track": {
            borderRadius: 12,
            backgroundColor: "var(--border-color)",
            opacity: 1,
            transition: "background-color 0.2s ease",
          },
        }}
      />
      {label && (
        <Typography
          sx={{
            fontSize: "var(--font-body1)",
            fontWeight: "var(--font-weight-medium)",
            color: disabled ? "var(--text-muted)" : "var(--text-primary)",
          }}
        >
          {label}
        </Typography>
      )}
    </Box>
  );
}
