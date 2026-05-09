import React from "react";
import { useTranslation } from "react-i18next";

import { Box, Typography } from "@mui/material";
import useUIStore from "../../store/useUIStore";
import { TAB_CONFIG } from "../main/tabs";

const ResultsViewTitle = () => {
  const selectedTab = useUIStore((s) => s.selectedTab);
  const { t } = useTranslation();

  return (
    <Box sx={{ width: "100%" }}>
      <Typography
        variant="h6"
        component="div"
        sx={{
          margin: "auto",
          marginBottom: 2,
          bgcolor: "secondary.dark",
          color: "white",
          fontWeight: "bold",
          textAlign: "center",
          padding: 1,
          borderRadius: (theme) => theme.spacing(0.5),
        }}
      >
        {t(TAB_CONFIG[selectedTab]?.resultsTitleKey ?? "")}
      </Typography>
    </Box>
  );
};

export default ResultsViewTitle;
