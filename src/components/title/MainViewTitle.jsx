import React from "react";
import { useTranslation } from "react-i18next";

import useUIStore from "../../store/useUIStore";

import { Box, Typography } from "@mui/material";

const MainViewTitle = () => {
  const mapTitle = useUIStore((s) => s.mapTitle);
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
        {mapTitle && selectedTab === 1 ? `${mapTitle}` : t(`main_view_tab_${selectedTab}_title`)}
      </Typography>
    </Box>
  );
};

export default MainViewTitle;
