import { Box, Stack, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";

export interface DisclaimerProps {
  paragraphs: string[];
}

export const Disclaimer = ({ paragraphs }: DisclaimerProps) => {
  const { t } = useTranslation();
  return (
    <Box
      data-testid="print-disclaimer"
      sx={{ "@media print": { pageBreakInside: "avoid", pageBreakBefore: "always" }, mt: 4 }}
    >
      <Typography variant="h5" gutterBottom>
        {t("print_section_disclaimer")}
      </Typography>
      <Stack spacing={1.5} data-testid="print-disclaimer-body">
        {paragraphs.map((paragraph, idx) => (
          <Typography key={idx} variant="body2">
            {paragraph}
          </Typography>
        ))}
      </Stack>
    </Box>
  );
};

export default Disclaimer;
