import React from "react";
import PropTypes from "prop-types";
import { Box, Button, Typography } from "@mui/material";
import { withTranslation } from "react-i18next";

import logger from "../../lib/logger.ts";

// App-root React error boundary (issue #12, scenario 6). Catches render /
// lifecycle exceptions in the component tree so a single crashing panel
// can't take the whole window black. The fallback exposes ``error_id`` so
// the user can correlate the toast with the main-log entry.
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorId: null };
  }

  static getDerivedStateFromError(error) {
    const errorId =
      typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    return { error, errorId };
  }

  componentDidCatch(error, info) {
    logger.error("[ErrorBoundary] caught render error", {
      errorId: this.state.errorId,
      error: error?.message ?? String(error),
      componentStack: info?.componentStack,
    });
  }

  handleReload = () => {
    this.setState({ error: null, errorId: null });
    window.electron?.send?.("reload");
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    const { t } = this.props;
    return (
      <Box
        role="alert"
        sx={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: 4,
          textAlign: "center",
        }}
      >
        <Typography variant="h5" gutterBottom>
          {t("error_boundary_title")}
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {t("error_boundary_description")}
        </Typography>
        <Typography variant="caption" sx={{ mb: 3, fontFamily: "monospace" }}>
          {t("error_id_label", { id: this.state.errorId })}
        </Typography>
        <Button variant="contained" onClick={this.handleReload}>
          {t("error_boundary_reload")}
        </Button>
      </Box>
    );
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
  t: PropTypes.func.isRequired,
};

export default withTranslation()(ErrorBoundary);
