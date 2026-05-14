import React from "react";
import { useTranslation } from "react-i18next";

import { Box, IconButton, Tooltip, Typography, Card, CardContent, Divider } from "@mui/material";
import MapIcon from "@mui/icons-material/Map";
import BarChartIcon from "@mui/icons-material/BarChart";
import InputIcon from "@mui/icons-material/Input";

import useUIStore from "../../store/useUIStore";
import { TABS } from "../main/tabs";

const allControls = [
  { id: "display_parameters", icon: <InputIcon /> },
  { id: "display_map", icon: <MapIcon /> },
  { id: "display_chart", icon: <BarChartIcon /> },
];

const MainViewControls = () => {
  const activeViewControl = useUIStore((s) => s.activeViewControl);
  const setActiveViewControl = useUIStore((s) => s.setActiveViewControl);
  const selectedTab = useUIStore((s) => s.selectedTab);
  const { t } = useTranslation();

  // The top-level Adaptation section (#371) keeps the chart + map toggle
  // (map is stubbed) but drops the parameter editor since there is no
  // parameter card in the side column.
  const isAdaptation = selectedTab === TABS.ADAPTATION;
  const controls = isAdaptation
    ? allControls.filter((c) => c.id !== "display_parameters")
    : allControls;

  const handleSelect = (control) => {
    if (control.id === "display_map" && isAdaptation) return;
    setActiveViewControl(control.id);
  };

  const renderControlButton = (control, mapDisabled) => {
    const isPressed = control.id === activeViewControl;
    return (
      <IconButton
        onClick={() => handleSelect(control)}
        disabled={mapDisabled}
        aria-label={t("select_view_control_aria", {
          label: t(`main_view_controls_${control.id}`),
        })}
        aria-pressed={isPressed}
        data-testid={mapDisabled ? "main-view-controls-map-button-disabled" : undefined}
        sx={{
          flexGrow: 1,
          color: "text.primary",
          "&:hover": {
            backgroundColor: "secondary.light",
          },
        }}
      >
        {control.icon}
        <Typography variant="body1" sx={{ ml: 1, fontWeight: isPressed ? "bold" : "normal" }}>
          {t(`main_view_controls_${control.id}`)}
        </Typography>
      </IconButton>
    );
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
          {controls.map((control, index) => {
            // The Adaptation tab's map surface is intentionally stubbed
            // (#371); we disable the toggle and surface the explanatory
            // tooltip here now that the duplicate switcher in the side
            // panel has been removed (#412 D1).
            const mapDisabled = isAdaptation && control.id === "display_map";
            const button = renderControlButton(control, mapDisabled);
            const wrapped = mapDisabled ? (
              <Tooltip title={t("adaptation_map_disabled_tooltip")}>
                <span style={{ display: "flex", flex: 1 }}>{button}</span>
              </Tooltip>
            ) : (
              button
            );
            return (
              <React.Fragment key={control.id}>
                {index !== 0 && (
                  <Divider orientation="vertical" flexItem sx={{ bgcolor: "common.black" }} />
                )}
                {wrapped}
              </React.Fragment>
            );
          })}
        </Box>
      </CardContent>
    </Card>
  );
};

export default MainViewControls;
