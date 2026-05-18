import React, { forwardRef } from "react";
import PropTypes from "prop-types";
import { Snackbar, Stack, Button } from "@mui/material";
import MuiAlert from "@mui/material/Alert";
import { useTranslation } from "react-i18next";
import useUIStore from "../../store/useUIStore";
import { layoutTransition } from "../../theme/theme";

const Alert = forwardRef(function Alert(props, ref) {
  return <MuiAlert elevation={6} ref={ref} variant="filled" {...props} />;
});

const AlertMessage = () => {
  const { t } = useTranslation();
  const alertMessage = useUIStore((s) => s.alertMessage);
  const alertSeverity = useUIStore((s) => s.alertSeverity);
  const alertShowMessage = useUIStore((s) => s.alertShowMessage);
  const setAlertShowMessage = useUIStore((s) => s.setAlertShowMessage);

  const handleCloseMessage = () => {
    setAlertShowMessage(false);
  };

  const handleLinkClick = (event, path) => {
    event.preventDefault();
    window.electron.openReport(path);
  };

  if (!(alertMessage && alertShowMessage)) {
    return null;
  }

  const [messageText, path] = alertMessage.split("::");

  return (
    <Stack spacing={2} sx={{ width: "100%" }}>
      <Snackbar
        open={alertShowMessage}
        autoHideDuration={10000}
        onClose={handleCloseMessage}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
      >
        <Alert onClose={handleCloseMessage} severity={alertSeverity} sx={{ width: "100%" }}>
          <span>{messageText}</span>
          {path && (
            <Button
              onClick={(event) => handleLinkClick(event, path)}
              sx={{
                color: "white",
                marginLeft: 1,
                border: 1,
                borderColor: "common.white",
                transition: layoutTransition(["background-color"]),
                maxWidth: "100%",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                py: 0.5,
                px: 1,
                // Translucent white overlays for the "View" button hover /
                // active states. `<Alert variant="filled">` is always painted
                // in a saturated severity colour regardless of scheme, so a
                // white translucent overlay reads correctly in both light
                // and dark mode — see the rgba exceptions block in
                // src/theme/theme.ts (issue #289).
                "&:hover": {
                  backgroundColor: "rgba(255, 255, 255, 0.1)",
                },
                "&:active": {
                  backgroundColor: "rgba(255, 255, 255, 0.2)",
                },
              }}
            >
              {t("alert_message_view")}
            </Button>
          )}
        </Alert>
      </Snackbar>
    </Stack>
  );
};

AlertMessage.propTypes = {
  handleCloseMessage: PropTypes.func.isRequired,
  message: PropTypes.string.isRequired,
  severity: PropTypes.oneOf(["error", "warning", "info", "success"]).isRequired,
  showMessage: PropTypes.bool.isRequired,
};

export default AlertMessage;
