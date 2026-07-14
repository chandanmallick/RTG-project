import { TextField, InputAdornment } from "@mui/material";

export default function PremiumInput({
  value,
  onChange,
  placeholder,
  label,
  size = "small",
  type = "text",
  InputProps = {},
  startIcon,
  endIcon,
  disabled = false,
  sx = {},
}) {
  return (
    <TextField
      fullWidth
      size={size}
      type={type}
      disabled={disabled}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      label={label}
      variant="outlined"
      InputProps={{
        ...InputProps,
        ...(startIcon && {
          startAdornment: (
            <InputAdornment position="start" sx={{ color: "var(--text-muted)" }}>
              {startIcon}
            </InputAdornment>
          ),
        }),
        ...(endIcon && {
          endAdornment: (
            <InputAdornment position="end" sx={{ color: "var(--text-muted)" }}>
              {endIcon}
            </InputAdornment>
          ),
        }),
      }}
      sx={{
        "& .MuiOutlinedInput-root": {
          borderRadius: "var(--radius-md)",
          backgroundColor: "var(--bg-card)",
          transition: "all .22s ease",
          minHeight: size === "small" ? 40 : 48,

          "& fieldset": {
            borderColor: "var(--border-color)",
            borderWidth: "1.5px",
            transition: "all .22s ease",
          },

          "&:hover fieldset": {
            borderColor: "var(--grid-blue)",
          },

          "&.Mui-focused": {
            backgroundColor: "#FFFFFF",
            boxShadow: "0 0 0 4px rgba(13, 87, 183, 0.1)",
          },

          "&.Mui-focused fieldset": {
            borderColor: "var(--grid-blue)",
            borderWidth: "1.5px",
          },

          "& input": {
            fontSize: "var(--font-body1)",
            fontWeight: "var(--font-weight-medium)",
            color: "var(--deep-navy)",
          },

          "& input::placeholder": {
            color: "var(--text-muted)",
            opacity: 1,
          },
        },

        "& .MuiInputLabel-root": {
          fontWeight: "var(--font-weight-semibold)",
          color: "var(--text-secondary)",
          "&.Mui-focused": {
            color: "var(--grid-blue)",
          },
        },

        ...sx,
      }}
    />
  );
}