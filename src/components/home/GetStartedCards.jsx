import React from "react";
import { useTranslation } from "react-i18next";
import { Box, Card, CardActionArea, Stack, Typography } from "@mui/material";
import AssessmentIcon from "@mui/icons-material/Assessment";
import PublicIcon from "@mui/icons-material/Public";
import FolderIcon from "@mui/icons-material/Folder";
import EastIcon from "@mui/icons-material/East";
import WestIcon from "@mui/icons-material/West";

import useUIStore from "../../store/useUIStore";
import { isRtl } from "../../i18nConfig";

const ICONS = {
  risk: AssessmentIcon,
  macro: PublicIcon,
  workspace: FolderIcon,
};

const CTA_DEFINITIONS = [
  { id: "risk", titleKey: "home_cta_risk_title", subtitleKey: "home_cta_risk_subtitle" },
  { id: "macro", titleKey: "home_cta_macro_title", subtitleKey: "home_cta_macro_subtitle" },
  {
    id: "workspace",
    titleKey: "home_cta_workspace_title",
    subtitleKey: "home_cta_workspace_subtitle",
  },
];

const CARD_SX = {
  position: "relative",
  height: "100%",
  overflow: "hidden",
  "&::before": {
    content: '""',
    position: "absolute",
    top: 0,
    insetInlineStart: 0,
    insetInlineEnd: 0,
    height: 4,
    bgcolor: "primary.main",
  },
};

const ACTION_AREA_SX = { height: "100%", p: 2.5, alignItems: "stretch" };

const GetStartedCards = () => {
  const { t, i18n } = useTranslation();
  const setActiveSection = useUIStore((s) => s.setActiveSection);
  const rtl = isRtl(i18n.language);
  const ArrowIcon = rtl ? WestIcon : EastIcon;

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", sm: "repeat(3, 1fr)" },
        gap: 2,
      }}
    >
      {CTA_DEFINITIONS.map(({ id, titleKey, subtitleKey }) => {
        const Icon = ICONS[id];
        return (
          <Card key={id} variant="outlined" sx={CARD_SX}>
            <CardActionArea
              onClick={() => setActiveSection(id)}
              aria-label={t(titleKey)}
              data-testid={`home-cta-${id}`}
              sx={ACTION_AREA_SX}
            >
              <Stack spacing={1.5} sx={{ height: "100%" }}>
                <Icon color="primary" />
                <Typography variant="h6" component="h3">
                  {t(titleKey)}
                </Typography>
                <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
                  {t(subtitleKey)}
                </Typography>
                <Stack
                  direction="row"
                  alignItems="center"
                  spacing={0.5}
                  sx={{ color: "primary.main" }}
                >
                  <Typography variant="body2" component="span">
                    {t("home_cta_open")}
                  </Typography>
                  <ArrowIcon fontSize="small" />
                </Stack>
              </Stack>
            </CardActionArea>
          </Card>
        );
      })}
    </Box>
  );
};

export default GetStartedCards;
