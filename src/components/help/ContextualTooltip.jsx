import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { IconButton, Tooltip } from "@mui/material";
import InfoOutlined from "@mui/icons-material/InfoOutlined";

const stop = (e) => e.stopPropagation();

const ContextualTooltip = ({ titleKey, ariaLabelKey, size = "small", sx }) => {
  const { t } = useTranslation();
  return (
    <Tooltip title={t(titleKey)} arrow enterDelay={200}>
      <IconButton
        aria-label={t(ariaLabelKey || titleKey)}
        size={size}
        onMouseDown={stop}
        onMouseUp={stop}
        onClick={stop}
        sx={{ color: "text.secondary", p: 0.25, ...sx }}
      >
        <InfoOutlined fontSize="inherit" />
      </IconButton>
    </Tooltip>
  );
};

ContextualTooltip.propTypes = {
  titleKey: PropTypes.string.isRequired,
  ariaLabelKey: PropTypes.string,
  size: PropTypes.oneOf(["small", "medium", "large"]),
  sx: PropTypes.object,
};

export default ContextualTooltip;
