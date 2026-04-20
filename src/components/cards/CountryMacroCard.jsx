import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Box, Card, CardActionArea, Chip, Typography, CardContent } from "@mui/material";
import useStore from "../../store";
import RiskWiseClient from "../../lib/RiskWiseClient";

// Mirror CountryCard — macro screen picks from the same registry-backed
// list so a custom country (user-data drop-in) appears on both pages
// with the same Built-in / Custom labeling.
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
        bgcolor: "card.bg",
        border: "2px solid var(--mui-palette-primary-dark)",
        borderRadius: "16px",
        marginBottom: "16px",
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
            backgroundColor: "accent.main",
            borderRadius: "8px",
            padding: "8px",
          }}
        >
          {t("card_country_title")}
        </Typography>
        <Box
          sx={{
            display: "flex",
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {countries.map((country) => (
            <CardActionArea
              key={country.code}
              onClick={() => handleSelect(country)}
              sx={{
                backgroundColor: isButtonSelected(country) ? "accent.main" : "accent.light",
                flexGrow: 1,
                borderRadius: "8px",
                textAlign: "center",
                padding: "8px 0",
                margin: "8px",
                transition: "transform 0.1s ease-in-out",
                "&:active": {
                  transform: "scale(0.96)",
                },
              }}
            >
              <Typography variant="body1" color="text.primary">
                {labelFor(country)}
              </Typography>
              <Chip
                label={
                  country.source === "custom"
                    ? t("card_country_source_custom")
                    : t("card_country_source_builtin")
                }
                size="small"
                color={country.source === "custom" ? "secondary" : "primary"}
                variant="outlined"
                sx={{ marginTop: "4px" }}
              />
            </CardActionArea>
          ))}
        </Box>
        <Box sx={{ padding: 2, backgroundColor: "surface.muted", borderRadius: "8px" }}>
          <Typography variant="body2" color="text.primary">
            {t("card_country_macro_remarks")}
          </Typography>
        </Box>
      </CardContent>
    </Card>
  );
};

export default CountryMacroCard;
