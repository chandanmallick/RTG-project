import { Box } from "@mui/material";

export default function FloatingBlobs() {
  return (
    <>
      <Box
        sx={{
          position: "fixed",
          top: -120,
          right: -100,
          width: 420,
          height: 420,
          borderRadius: "50%",
          background: "rgba(108,99,255,0.18)",
          filter: "blur(120px)",
          zIndex: 0,
        }}
      />

      <Box
        sx={{
          position: "fixed",
          bottom: -160,
          left: -100,
          width: 420,
          height: 420,
          borderRadius: "50%",
          background: "rgba(91,75,138,0.16)",
          filter: "blur(120px)",
          zIndex: 0,
        }}
      />
    </>
  );
}