import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { Card, CardContent, Chip, Stack, TextField, Typography } from "@mui/material";

import useUIStore from "../../store/useUIStore";
import useWorkspaceStore from "../../store/useWorkspaceStore";
import { exposureCategoryMap } from "../../data/exposureCatalog";
import { TABS } from "../main/tabs";
import ContextualTooltip from "../help/ContextualTooltip";
import {
  categoryPaletteKey,
  cardTitleSx,
  disabledFieldSx,
  getInputCardSx,
} from "./inputCardStyles";

// Catalog assets carry a known category in `exposureCategoryMap`; Custom
// uploads carry whatever the upload dialog stored on the store. `null` means
// "Custom without a chosen category" — caller renders the grey chip in that
// case so the card never appears unstyled.
const resolveCategory = (selectedExposure, selectedExposureCategory) => {
  if (!selectedExposure) return null;
  return exposureCategoryMap[selectedExposure] ?? selectedExposureCategory ?? null;
};

const Exposure = () => {
  const isValidExposure = useWorkspaceStore((s) => s.isValidExposure);
  const selectedExposure = useWorkspaceStore((s) => s.selectedExposure);
  const selectedExposureCategory = useWorkspaceStore((s) => s.selectedExposureCategory);
  const setSelectedCard = useUIStore((s) => s.setSelectedCard);
  const setSelectedTab = useUIStore((s) => s.setSelectedTab);
  const { t } = useTranslation();
  const [clicked, setClicked] = useState(false);
  const [cardState, setCardState] = useState("default");

  const category = resolveCategory(selectedExposure, selectedExposureCategory);
  const paletteKey = categoryPaletteKey(category);
  const chipLabelKey = category ? `chip_category_${category}` : "chip_category_custom";

  const handleMouseDown = () => setClicked(true);
  const handleMouseUp = () => setClicked(false);

  const handleClick = () => {
    setSelectedCard("exposure");
    setSelectedTab(TABS.PARAMETERS);
  };

  useEffect(() => {
    if (selectedExposure && isValidExposure) {
      setCardState("valid");
    } else if (selectedExposure && !isValidExposure) {
      setCardState("invalid");
    } else {
      setCardState("default");
    }
  }, [isValidExposure, selectedExposure]);

  const cardSx = getInputCardSx(cardState, { clicked });

  // Catalog assets resolve via the existing `input_exposure_<category>_<asset>`
  // keys; a Custom upload with no category shows the raw key so the field is
  // never blank.
  let assetDisplayValue = "";
  if (selectedExposure) {
    assetDisplayValue = category
      ? t(`input_exposure_${category}_${selectedExposure}`)
      : selectedExposure;
  }

  return (
    <Card
      variant="outlined"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={handleClick}
      sx={{
        ...cardSx,
        borderLeftStyle: "solid",
        borderLeftWidth: (theme) => theme.spacing(0.5),
        borderLeftColor: (theme) => theme.palette.category[paletteKey].main,
      }}
    >
      <CardContent>
        <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1 }}>
          <Typography id="exposure-dropdown" variant="h6" component="div" m={0} sx={cardTitleSx}>
            {t("input_exposure_title")}
          </Typography>
          <ContextualTooltip titleKey="input_tooltip_exposure" />
          <Stack direction="row" sx={{ flexGrow: 1, justifyContent: "flex-end" }}>
            <Chip
              size="small"
              label={t(chipLabelKey)}
              sx={{
                bgcolor: `category.${paletteKey}.main`,
                color: `category.${paletteKey}.contrastText`,
                fontWeight: 600,
              }}
            />
          </Stack>
        </Stack>
        <TextField
          id="exposure-textfield"
          fullWidth
          variant="outlined"
          value={assetDisplayValue}
          placeholder={t("input_card_placeholder")}
          disabled
          InputProps={{ readOnly: true }}
          sx={disabledFieldSx}
        />
      </CardContent>
    </Card>
  );
};

export default Exposure;
