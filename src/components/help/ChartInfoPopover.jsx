import React, { useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";
import { Box, IconButton, Popover, Typography } from "@mui/material";
import InfoOutlined from "@mui/icons-material/InfoOutlined";

const ChartInfoPopover = ({ titleKey, bodyKey, ariaLabelKey }) => {
  const { t } = useTranslation();
  const [anchorEl, setAnchorEl] = useState(null);
  const open = Boolean(anchorEl);
  const id = open ? `chart-info-popover-${titleKey}` : undefined;

  return (
    <>
      <IconButton
        aria-label={t(ariaLabelKey || titleKey)}
        aria-describedby={id}
        size="small"
        onClick={(e) => setAnchorEl(e.currentTarget)}
        sx={{ color: "text.secondary", p: 0.25 }}
      >
        <InfoOutlined fontSize="small" />
      </IconButton>
      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        slotProps={{ paper: { sx: { maxWidth: 360 } } }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            {t(titleKey)}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {t(bodyKey)}
          </Typography>
        </Box>
      </Popover>
    </>
  );
};

ChartInfoPopover.propTypes = {
  titleKey: PropTypes.string.isRequired,
  bodyKey: PropTypes.string.isRequired,
  ariaLabelKey: PropTypes.string,
};

export default ChartInfoPopover;
