import React from "react";
import { Skeleton, Stack, Typography } from "@mui/material";

export const SummaryRow = ({ label, value, align = "left" }) => (
  <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
    <Typography variant="body2" sx={{ color: "text.secondary" }}>
      {label}
    </Typography>
    <Typography variant="body2" sx={{ color: "text.primary", fontWeight: 500, textAlign: align }}>
      {value}
    </Typography>
  </Stack>
);

export const SummaryRowSkeleton = ({ label, "data-testid": testId }) => (
  <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
    <Typography variant="body2" sx={{ color: "text.secondary" }}>
      {label}
    </Typography>
    <Skeleton variant="text" width={60} data-testid={testId} />
  </Stack>
);
