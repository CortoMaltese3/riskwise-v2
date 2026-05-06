import React from "react";
import { useTranslation } from "react-i18next";
import { Link, Stack, Typography } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

import HomeCard from "./HomeCard";

// External-only entry points; internal shortcuts are covered by the
// GET STARTED CTAs. Clicks open in the OS browser via the renderer
// security handler in public/electron.js (setWindowOpenHandler →
// shell.openExternal for http(s) URLs).
const RESOURCES = [
  {
    id: "climada",
    labelKey: "home_resources_climada",
    url: "https://climada-python.readthedocs.io",
  },
  {
    id: "ckp",
    labelKey: "home_resources_ckp",
    url: "https://climateknowledgeportal.worldbank.org",
  },
  { id: "emdat", labelKey: "home_resources_emdat", url: "https://www.emdat.be" },
  { id: "giz", labelKey: "home_resources_giz", url: "https://www.giz.de/en/html/index.html" },
];

const ResourcesCard = () => {
  const { t } = useTranslation();
  return (
    <HomeCard data-testid="home-resources-card" title={t("home_resources_title")}>
      <Stack spacing={1.25} component="ul" sx={{ m: 0, p: 0, listStyle: "none" }}>
        {RESOURCES.map(({ id, labelKey, url }) => (
          <Stack
            key={id}
            component="li"
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ minWidth: 0 }}
          >
            <Link
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              data-testid={`home-resources-link-${id}`}
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, minWidth: 0 }}
            >
              <Typography variant="body2" component="span" noWrap>
                {t(labelKey)}
              </Typography>
              <OpenInNewIcon fontSize="inherit" aria-hidden="true" />
            </Link>
          </Stack>
        ))}
      </Stack>
    </HomeCard>
  );
};

export default ResourcesCard;
