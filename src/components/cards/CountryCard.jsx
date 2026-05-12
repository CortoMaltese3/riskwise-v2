import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Card, CardActionArea, Tooltip, Typography, CardContent } from "@mui/material";
import useResultsStore from "../../store/useResultsStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { selectCountry } from "../../store/orchestrators";
import RiskWiseClient from "../../lib/RiskWiseClient";
import { layoutTransition } from "../../theme/theme";

// Countries shipped with the repo get a translated display name; custom
// drop-ins (user-data/countries/<ISO3>/) fall back to the server-provided
// country name.
const BUILTIN_LABEL_KEYS = {
  EGY: "card_country_egypt",
  THA: "card_country_thailand",
};

const countryKey = (country) => country.name.toLowerCase();

const CountryCard = () => {
  const { t } = useTranslation();
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const isScenarioRunning = useResultsStore((s) => s.isScenarioRunning);
  const [countries, setCountries] = useState([]);

  useEffect(() => {
    let cancelled = false;
    RiskWiseClient.fetchCountries()
      .then((res) => {
        if (cancelled) return;
        if (res && res.success && res.result && Array.isArray(res.result.data)) {
          setCountries(res.result.data);
        }
      })
      .catch(() => {
        // Backend unavailable: the card degrades to an empty state rather
        // than crashing the renderer. The scenario picker downstream
        // handles the missing selection.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = async (country) => {
    const key = countryKey(country);
    if (selectedCountry === key) {
      selectCountry(""); // Deselect if already selected
    } else {
      selectCountry(key);
    }
    // Clear the temp directory to reset maps
    await window.electron.clearTempDir();
  };

  const isButtonSelected = (country) => selectedCountry === countryKey(country);

  const labelFor = (country) => {
    const tkey = BUILTIN_LABEL_KEYS[country.code];
    return tkey ? t(tkey) : country.name;
  };

  return (
    <Card
      sx={{
        maxWidth: 800,
        margin: "auto",
        bgcolor: "primary.bgStrong",
        border: 2,
        borderColor: "primary.dark",
        borderRadius: (theme) => theme.spacing(2),
      }}
    >
      <CardContent>
        <Typography
          gutterBottom
          variant="h5"
          component="div"
          color="text.primary"
          sx={{
            textAlign: "center",
            fontWeight: "bold",
            backgroundColor: "secondary.main",
            borderRadius: (theme) => theme.spacing(1),
            padding: 1,
          }}
        >
          {t("card_country_title")}
        </Typography>
        <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "center", gap: 2 }}>
          {countries.map((country) => (
            <Tooltip
              key={country.code}
              title={isScenarioRunning ? t("scenario_running_disabled_tooltip") : ""}
              placement="top"
            >
              <span style={{ width: "100%" }}>
                <CardActionArea
                  onClick={() => handleSelect(country)}
                  disabled={isScenarioRunning}
                  sx={{
                    backgroundColor: isButtonSelected(country)
                      ? "secondary.main"
                      : "secondary.light",
                    borderRadius: (theme) => theme.spacing(1),
                    textAlign: "center",
                    py: 1,
                    px: 0,
                    transition: layoutTransition(["transform"]),
                    "&:active": {
                      transform: "scale(0.96)",
                    },
                  }}
                >
                  <Typography variant="body1" color="text.primary">
                    {labelFor(country)}
                  </Typography>
                </CardActionArea>
              </span>
            </Tooltip>
          ))}
        </Box>
        <Box
          sx={{
            padding: 2,
            backgroundColor: "surface.muted",
            borderRadius: (theme) => theme.spacing(1),
          }}
        >
          <Typography variant="body2" color="text.primary">
            {t("card_country_remarks")}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default CountryCard;
