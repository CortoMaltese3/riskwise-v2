import React, { useEffect } from "react";

import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import Slide from "@mui/material/Slide";

import Loader from "./Loader";
import GearLoader from "../../assets/gear-loader.svg";
import useResultsStore from "../../store/useResultsStore";
import useUIStore from "../../store/useUIStore";

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const LoadModal = () => {
  const isScenarioRunning = useResultsStore((s) => s.isScenarioRunning);
  const modalMessage = useUIStore((s) => s.modalMessage);
  const setModalMessage = useUIStore((s) => s.setModalMessage);

  useEffect(() => {
    if (!window.electron?.onProgress) {
      return undefined;
    }
    const unsubscribe = window.electron.onProgress((data) => {
      setModalMessage(data.message);
    });
    return unsubscribe;
  }, [setModalMessage]);

  return (
    <>
      <Dialog
        open={isScenarioRunning}
        TransitionComponent={Transition}
        keepMounted
        disableEscapeKeyDown={true}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle id="alert-dialog-title" textAlign="center">
          {"Running scenario"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description" textAlign="center">
            {modalMessage}
          </DialogContentText>
          <Box
            component="img"
            display="block"
            marginLeft="auto"
            marginRight="auto"
            alt="loader"
            src={GearLoader}
          />
        </DialogContent>
        <Box textAlign="center" sx={{ display: "flex", alignItems: "center" }}>
          <Loader />
        </Box>
      </Dialog>
    </>
  );
};

export default LoadModal;
