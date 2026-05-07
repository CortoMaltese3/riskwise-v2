import React from "react";
import { useTranslation } from "react-i18next";

import { Box, IconButton, Typography, Card, CardContent, Divider } from "@mui/material";
import InputIcon from "@mui/icons-material/Input";
import StackedLineChartIcon from "@mui/icons-material/StackedLineChart";

import useStore from "../../store";

const controls = [
  { id: "display_macro_parameters", icon: <InputIcon /> },
  { id: "display_macro_chart", icon: <StackedLineChartIcon /> },
];

const MainViewControls = () => {
  const { activeViewControl, setActiveViewControl } = useStore();
  const { t } = useTranslation();

  const handleSelect = (control) => {
    setActiveViewControl(control);
  };

  return (
    <Card
      sx={{
        width: "100%",
        maxWidth: 480,
        margin: "auto",
        bgcolor: "secondary.light",
        border: 1,
        borderColor: "common.black",
        borderRadius: (theme) => theme.spacing(2),
      }}
    >
      <CardContent sx={{ padding: 1, "&:last-child": { paddingBottom: 0.75 } }}>
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {controls.map((control, index) => (
            <React.Fragment key={control.id}>
              {index !== 0 && (
                <Divider orientation="vertical" flexItem sx={{ bgcolor: "common.black" }} />
              )}
              <IconButton
                onClick={() => handleSelect(control.id)}
                aria-label={t("select_view_control_aria", {
                  label: t(`macro_view_controls_${control.id}`),
                })}
                aria-pressed={control.id === activeViewControl}
                sx={{
                  flexGrow: 1,
                  color: "text.primary",
                  "&:hover": {
                    backgroundColor: "secondary.light",
                  },
                }}
              >
                {control.icon}
                <Typography
                  variant="body1"
                  sx={{ ml: 1, fontWeight: control.id === activeViewControl ? "bold" : "normal" }}
                >
                  {t(`macro_view_controls_${control.id}`)}
                </Typography>
              </IconButton>
            </React.Fragment>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
};

export default MainViewControls;
