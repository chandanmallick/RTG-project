import { TextField } from "@mui/material";

export default function PremiumInput({
  value,
  onChange,
  placeholder,
  label,

  size = "small",

  type = "text",

  InputProps = {},

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
      InputProps={InputProps}
      sx={{
        "& .MuiOutlinedInput-root": {
          borderRadius: "18px",

          background:
            "rgba(255,255,255,0.72)",

          backdropFilter: "blur(18px)",

          transition:
            "all .22s ease",

          minHeight: 48,

          "& fieldset": {
            borderColor:
              "rgba(229,231,235,0.9)",

            transition:
              "all .22s ease",
          },

          "&:hover fieldset": {
            borderColor:
              "#00DF81",
          },

          "&.Mui-focused": {
            background:
              "rgba(255,255,255,0.92)",

            boxShadow:
              "0 0 0 4px rgba(0, 223, 129, 0.15)",
          },

          "&.Mui-focused fieldset": {
            borderColor:
              "#03624C",
          },

          "& input": {
            fontSize: 14,

            fontWeight: 500,

            color: "#111827",
          },

          "& input::placeholder": {
            color: "#9CA3AF",
            opacity: 1,
          },
        },

        "& .MuiInputLabel-root": {
          fontWeight: 600,

          color: "#6B7280",
        },

        ...sx,
      }}
    />
  );
}