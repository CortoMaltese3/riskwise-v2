import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Card, CardActionArea, Typography, CardContent } from "@mui/material";
import useStore from "../../store";
import RiskWiseClient from "../../lib/RiskWiseClient";
import { layoutTransition } from "../../theme/theme";

// Mirror CountryCard — macro screen picks from the same registry-backed
// list so a custom country (user-data drop-in) appears on both pages
// with the same translated label.
const BUILTIN_LABEL_KEYS = {
  EGY: "card_country_egypt",
  THA: "card_country_thailand",
};

const countryKey = (country) => country.name.toLowerCase();

const CountryMacroCard = () => {
  const { t } = useTranslation();
  const { selectedMacroCountry, setSelectedMacroCountry } = useStore();
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
        // Backend unavailable: empty list is fine — nothing selectable.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSelect = async (country) => {
    const key = countryKey(country);
    if (selectedMacroCountry === key) {
      setSelectedMacroCountry(""); // Deselect if already selected
    } else {
      setSelectedMacroCountry(key);
    }
    await window.electron.clearTempDir();
  };

  const isButtonSelected = (country) => selectedMacroCountry === countryKey(country);

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
        marginBottom: 2,
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
            {t("card_country_macro_remarks")}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default CountryMacroCard;
