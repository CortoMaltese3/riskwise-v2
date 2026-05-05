import React from "react";
import { useTranslation } from "react-i18next";

import { Box, Typography } from "@mui/material";

const DataInputViewTitle = () => {
  const { t } = useTranslation();

  return (
    <Box sx={{ width: "100%" }}>
      <Typography
        variant="h6"
        component="div"
        sx={{
          margin: "auto",
          marginBottom: 2,
          bgcolor: "accent.dark",
          color: "white",
          fontWeight: "bold",
          textAlign: "center",
          padding: 1,
          borderRadius: (theme) => theme.spacing(0.5),
        }}
      >
        {t(`input_view_title`)}
      </Typography>
    </Box>
  );
};

export default DataInputViewTitle;
