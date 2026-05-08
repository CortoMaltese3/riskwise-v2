import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Card, CardActionArea, Typography, CardContent } from "@mui/material";
import useStore from "../../store";
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
  const { selectedCountry, setSelectedCountry } = useStore();
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
      setSelectedCountry(""); // Deselect if already selected
    } else {
      setSelectedCountry(key);
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
        <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "center" }}>
          {countries.map((country) => (
            <CardActionArea
              key={country.code}
              onClick={() => handleSelect(country)}
              sx={{
                backgroundColor: isButtonSelected(country) ? "secondary.main" : "secondary.light",
                borderRadius: (theme) => theme.spacing(1),
                margin: 2,
                marginLeft: 0,
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
