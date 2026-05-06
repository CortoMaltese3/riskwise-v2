import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { Box, Stack, Typography } from "@mui/material";

import { formatDate } from "../../lib/formatDate";
import HomeCard from "./HomeCard";

const WhatsNewCard = ({ version, releaseDate, bullets, error, locale }) => {
  const { t } = useTranslation();
  const formattedDate = releaseDate ? formatDate(releaseDate, locale) : "";
  const titleLabel = version
    ? t("home_whatsnew_title_with_version", { version })
    : t("home_whatsnew_title");

  if (error || bullets.length === 0) {
    return (
      <HomeCard data-testid="home-whatsnew-card" title={titleLabel}>
        <Typography variant="body2" color="text.secondary" data-testid="home-whatsnew-empty">
          {error ? t("home_whatsnew_error") : t("home_whatsnew_empty")}
        </Typography>
      </HomeCard>
    );
  }

  return (
    <HomeCard data-testid="home-whatsnew-card" title={titleLabel}>
      <Stack spacing={1}>
        {formattedDate ? (
          <Typography variant="caption" color="text.secondary">
            {formattedDate}
          </Typography>
        ) : null}
        <Box component="ul" sx={{ m: 0, pl: 2.5, color: "text.primary" }}>
          {bullets.map((line, idx) => (
            <Box component="li" key={idx} sx={{ mb: 0.5 }}>
              <Typography variant="body2" component="span">
                {line}
              </Typography>
            </Box>
          ))}
        </Box>
      </Stack>
    </HomeCard>
  );
};

WhatsNewCard.propTypes = {
  version: PropTypes.string,
  releaseDate: PropTypes.string,
  bullets: PropTypes.arrayOf(PropTypes.string).isRequired,
  error: PropTypes.bool,
  locale: PropTypes.string,
};

export default WhatsNewCard;
