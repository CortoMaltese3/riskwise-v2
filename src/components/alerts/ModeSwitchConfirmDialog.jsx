import React from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Slide,
} from "@mui/material";

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const ModeSwitchConfirmDialog = ({ open, pendingMode, onConfirm, onCancel }) => {
  const { t } = useTranslation();

  // explore → era uses the new copy; era → explore reuses the legacy
  // navigate_verification_* keys per issue #322 acceptance criteria.
  const bodyKey =
    pendingMode === "era" ? "mode_switch_confirm_to_era" : "navigate_verification_subtitle";

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      TransitionComponent={Transition}
      maxWidth="sm"
      fullWidth
      aria-labelledby="mode-switch-confirm-title"
      aria-describedby="mode-switch-confirm-description"
    >
      <DialogTitle id="mode-switch-confirm-title">{t("mode_switch_confirm_title")}</DialogTitle>
      <DialogContent>
        <DialogContentText id="mode-switch-confirm-description">{t(bodyKey)}</DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} color="inherit">
          {t("cancel")}
        </Button>
        <Button onClick={onConfirm} variant="contained" autoFocus>
          {t("navigate_verification_button")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default ModeSwitchConfirmDialog;
