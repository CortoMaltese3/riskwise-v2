import { Box, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

import gizLogo from "../../../../assets/giz_logo.png";
import unuEhsLogo from "../../../../assets/unu_ehs_logo.png";
import type { ScenarioWorkspaceItem } from "../../../../lib/RiskWiseClient";

export interface CoverPageProps {
  meta: ScenarioWorkspaceItem;
  horizon: string;
}

export const CoverPage = ({ meta, horizon }: CoverPageProps) => {
  const { t } = useTranslation();

  return (
    <Box
      data-testid="print-cover"
      sx={{
        minHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        alignItems: "center",
        textAlign: "center",
        py: 6,
        "@media print": {
          pageBreakAfter: "always",
          pageBreakInside: "avoid",
          minHeight: "95vh",
        },
      }}
    >
      <Box sx={{ width: "100%", mt: 6 }}>
        <Typography variant="h3" gutterBottom>
          {t("print_cover_title")}
        </Typography>
        <Typography variant="h5" sx={{ mt: 4, mb: 2 }}>
          {meta.name ?? meta.id}
        </Typography>
        <Stack spacing={0.5} sx={{ mt: 4 }}>
          <Typography variant="body1">
            <strong>{t("country")}:</strong> {meta.country ?? "—"}
          </Typography>
          <Typography variant="body1">
            <strong>{t("hazard_title")}:</strong> {meta.hazard_type ?? "—"}
          </Typography>
          <Typography variant="body1">
            <strong>{t("time_horizon_title")}:</strong> {horizon}
          </Typography>
          {meta.id ? (
            <Typography
              variant="body1"
              data-testid="print-cover-run-code"
              sx={{ fontSize: "0.85em" }}
            >
              <strong>{t("print_cover_run_code")}:</strong>{" "}
              <Box component="span" sx={{ fontFamily: "monospace" }}>
                {meta.id}
              </Box>
            </Typography>
          ) : null}
        </Stack>
      </Box>

      {/* Logos box is dir="ltr" so GIZ/UNU-EHS keep their physical order
          regardless of document direction (#464). */}
      <Box
        data-testid="print-cover-logos"
        dir="ltr"
        sx={{
          mt: 6,
          mb: 2,
          display: "flex",
          flexDirection: "row",
          gap: 6,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Box component="img" src={gizLogo} alt="GIZ" sx={{ height: 60, objectFit: "contain" }} />
        <Box
          component="img"
          src={unuEhsLogo}
          alt="UNU-EHS"
          sx={{ height: 60, objectFit: "contain" }}
        />
      </Box>
    </Box>
  );
};

export default CoverPage;
