import React from "react";
import { useTranslation } from "react-i18next";

import IconButton from "@mui/material/IconButton";
import HelpIcon from "@mui/icons-material/Help";

import useUIStore from "../../store/useUIStore";

const HelpButton = () => {
  const { t } = useTranslation();
  const toggleHelpMenu = useUIStore((s) => s.toggleHelpMenu);

  return (
    <IconButton onClick={toggleHelpMenu} color="inherit" aria-label={t("help_button_aria")}>
      <HelpIcon />
    </IconButton>
  );
};

export default HelpButton;
