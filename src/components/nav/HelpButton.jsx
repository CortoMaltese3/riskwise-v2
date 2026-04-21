import React from "react";
import { useTranslation } from "react-i18next";

import IconButton from "@mui/material/IconButton";
import HelpIcon from "@mui/icons-material/Help";

import useStore from "../../store";

const HelpButton = () => {
  const { t } = useTranslation();
  const toggleHelpMenu = useStore((s) => s.toggleHelpMenu);

  return (
    <IconButton onClick={toggleHelpMenu} color="inherit" aria-label={t("help_button_aria")}>
      <HelpIcon />
    </IconButton>
  );
};

export default HelpButton;
