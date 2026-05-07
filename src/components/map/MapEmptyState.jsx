import React from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import MapOutlinedIcon from "@mui/icons-material/MapOutlined";

import EmptyChartState from "../layout/EmptyChartState";

const MapEmptyState = ({ "data-testid": testId = "map-empty-state" }) => {
  const { t } = useTranslation();
  return (
    <EmptyChartState
      data-testid={testId}
      icon={MapOutlinedIcon}
      message={t("map_empty_state_message")}
    />
  );
};

MapEmptyState.propTypes = {
  "data-testid": PropTypes.string,
};

export default MapEmptyState;
