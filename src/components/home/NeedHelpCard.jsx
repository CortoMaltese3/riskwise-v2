import React from "react";
import { useTranslation } from "react-i18next";
import { Button, Stack, Typography } from "@mui/material";

import useStore from "../../store";
import HomeCard from "./HomeCard";

const NeedHelpCard = () => {
  const { t } = useTranslation();
  const setGlossaryOpen = useStore((s) => s.setGlossaryOpen);

  return (
    <HomeCard data-testid="home-needhelp-card" title={t("home_needhelp_title")}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        alignItems={{ xs: "stretch", sm: "center" }}
      >
        <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
          {t("home_needhelp_body")}
        </Typography>
        <Stack direction="row" spacing={1} flexShrink={0}>
          <Button
            variant="outlined"
            size="small"
            onClick={() => setGlossaryOpen(true)}
            data-testid="home-open-glossary"
          >
            {t("home_needhelp_glossary")}
          </Button>
        </Stack>
      </Stack>
    </HomeCard>
  );
};

export default NeedHelpCard;
