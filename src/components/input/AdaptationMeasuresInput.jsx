import React, { useEffect, useState } from "react";

import { useTranslation } from "react-i18next";
import { Box, Card, CardContent, Chip, Stack, Tooltip, Typography } from "@mui/material";

import AdaptationMeasuresViewTitle from "../title/AdaptationMeasuresViewTitle";
import RiskWiseClient from "../../lib/RiskWiseClient";
import logger from "../../lib/logger.ts";
import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";

const AdaptationMeasuresInput = () => {
  const selectedCountry = useWorkspaceStore((s) => s.selectedCountry);
  const selectedHazard = useWorkspaceStore((s) => s.selectedHazard);
  const selectedSubTab = useUIStore((s) => s.selectedSubTab);
  const selectedTab = useUIStore((s) => s.selectedTab);
  const { t } = useTranslation();

  const [measures, setMeasures] = useState([]);

  const onFetchAdaptationMeasuresHandler = async () => {
    RiskWiseClient.fetchAdaptationMeasures(selectedCountry ?? "", selectedHazard)
      .then((response) => {
        const data = response?.result?.data;
        if (Array.isArray(data?.measures) && data.measures.length > 0) {
          setMeasures(data.measures);
          return;
        }
        // Older responses only carry the name list; synthesize minimal objects
        // so the chip / tooltip code path still has something to render.
        const names = data?.adaptationMeasures ?? [];
        setMeasures(
          names.map((name) => ({
            id: name,
            name,
            is_builtin: true,
            source_reference: null,
          }))
        );
      })
      .catch((error) => {
        logger.error("AdaptationMeasuresInput: fetchAdaptationMeasures failed", {
          error: error?.message ?? String(error),
        });
        setMeasures([]);
      });
  };

  useEffect(() => {
    if (selectedHazard) {
      onFetchAdaptationMeasuresHandler();
    }
  }, [selectedHazard, selectedCountry]);

  if (!(selectedTab === 1 && selectedSubTab === 1)) {
    return null;
  }

  return (
    <>
      <AdaptationMeasuresViewTitle />
      {measures.length > 0 ? (
        <Box
          sx={{
            mt: 2,
            padding: 2,
            borderRadius: (theme) => theme.spacing(1),
          }}
        >
          {measures.map((measure) => {
            const badgeLabel = measure.is_builtin
              ? t("adaptation_measure_badge_builtin")
              : t("adaptation_measure_badge_custom");
            const tooltipText =
              measure.source_reference ?? t("adaptation_measure_source_reference_missing");
            return (
              <Tooltip
                key={measure.id ?? measure.name}
                title={tooltipText}
                placement="top-start"
                arrow
              >
                <Card
                  variant="outlined"
                  sx={{
                    bgcolor: (theme) => theme.palette.primary.bgStrong,
                    mb: 2,
                    minHeight: 3,
                  }}
                >
                  <CardContent sx={{ p: 1 }}>
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      spacing={1}
                    >
                      <Typography
                        gutterBottom
                        variant="h6"
                        component="div"
                        sx={{ my: 0, wordWrap: "break-word" }}
                      >
                        {t(measure.name)}
                      </Typography>
                      <Chip
                        size="small"
                        label={badgeLabel}
                        color={measure.is_builtin ? "default" : "secondary"}
                        variant="outlined"
                      />
                    </Stack>
                  </CardContent>
                </Card>
              </Tooltip>
            );
          })}
        </Box>
      ) : (
        <Typography sx={{ mt: 2, textAlign: "center", fontStyle: "italic" }}>
          {
            selectedHazard
              ? t("adaptation_input_no_measures") /* No measures are found for selected hazard */
              : t("adaptation_input_no_hazard") /* No hazard is selected */
          }
        </Typography>
      )}
    </>
  );
};

export default AdaptationMeasuresInput;
