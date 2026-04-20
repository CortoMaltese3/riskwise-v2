import React from "react";
import { Box, Skeleton, Stack } from "@mui/material";

// Variants tailored to the async panels used in the scenario views. Keeps
// Skeleton markup in one place so individual panels only pick a variant.
const LoadingSkeleton = ({ variant = "panel", "data-testid": testId }) => {
  if (variant === "map") {
    return (
      <Box
        data-testid={testId ?? "skeleton-map"}
        sx={{ width: "100%", height: "100%", minHeight: 320, position: "relative" }}
      >
        <Skeleton
          variant="rectangular"
          width="100%"
          height="100%"
          sx={{ borderRadius: 2, minHeight: 320 }}
          animation="wave"
        />
      </Box>
    );
  }

  if (variant === "chart") {
    return (
      <Stack
        data-testid={testId ?? "skeleton-chart"}
        spacing={1}
        sx={{ width: "100%", minHeight: 280 }}
      >
        <Skeleton variant="text" width="40%" />
        <Skeleton variant="rectangular" width="100%" height={240} animation="wave" />
      </Stack>
    );
  }

  return (
    <Stack data-testid={testId ?? "skeleton-panel"} spacing={1} sx={{ width: "100%" }}>
      <Skeleton variant="text" width="60%" />
      <Skeleton variant="rectangular" width="100%" height={96} animation="wave" />
      <Skeleton variant="text" width="80%" />
      <Skeleton variant="text" width="50%" />
    </Stack>
  );
};

export default LoadingSkeleton;
