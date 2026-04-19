import React from "react";
import PropTypes from "prop-types";
import { Box, Button, Typography } from "@mui/material";

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
    // Surface to the main process log via the renderer console.
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", this.state.errorId, error, info);
  }

  handleReload = () => {
    this.setState({ error: null, errorId: null });
    window.electron?.send?.("reload");
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
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
          Something went wrong.
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          The application encountered an unexpected error. You can try to reload; if the problem
          persists, please share the error ID below with support.
        </Typography>
        <Typography variant="caption" sx={{ mb: 3, fontFamily: "monospace" }}>
          Error ID: {this.state.errorId}
        </Typography>
        <Button variant="contained" onClick={this.handleReload}>
          Reload
        </Button>
      </Box>
    );
  }
}

ErrorBoundary.propTypes = {
  children: PropTypes.node.isRequired,
};

export default ErrorBoundary;
