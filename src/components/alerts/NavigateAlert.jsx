import React, { useState } from "react";
import { useTranslation } from "react-i18next";

import useStore from "../../store";
import { layoutTransition } from "../../theme/theme";

import {
  Box,
  Button,
  Card,
  CardActionArea,
  CardContent,
  Dialog,
  DialogTitle,
  DialogContent,
  Slide,
  Typography,
} from "@mui/material";

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const NavigateAlert = () => {
  const { selectedAppOption, setSelectedAppOption } = useStore();
  const { t } = useTranslation();

  const options = ["era", "explore"];
  const [showVerification, setShowVerification] = useState(false);

  const handleSelect = (option) => {
    if (option === "explore") {
      // Show verification message for "explore" option
      setShowVerification(true);
    } else {
      setSelectedAppOption(option);
    }
  };

  const handleVerification = () => {
    // Call onChangeOption with "explore" after verification
    setSelectedAppOption("explore");
    setShowVerification(false); // Reset verification state
  };

  if (showVerification) {
    // Render verification dialog/message
    return (
      <Dialog
        open={showVerification}
        TransitionComponent={Transition}
        maxWidth="sm"
        fullWidth
        aria-labelledby="navigate-verification-modal-title"
        aria-describedby="navigate-verification-modal-description"
      >
        <DialogTitle id="navigate-verification-dialog-title" textAlign="center">
          <Typography
            variant="h6"
            component="div"
            sx={{
              mt: 2,
              bgcolor: "secondary.dark",
              color: "white",
              fontWeight: "bold",
              textAlign: "center",
              padding: 1,
              borderRadius: (theme) => theme.spacing(0.5),
            }}
          >
            {t("navigate_verification_title")}
          </Typography>
        </DialogTitle>

        <DialogContent>
          <Box
            sx={{
              maxWidth: 800,
              mb: 2,
              border: 2,
              borderColor: "border.strong",
              borderRadius: (theme) => theme.spacing(2),
            }}
          >
            <Typography //Use this approach to add new lines without risking inserting html
              component="div"
              sx={{
                margin: "auto",
                marginBottom: 2,
                textAlign: "left",
                padding: 1,
                borderRadius: (theme) => theme.spacing(0.5),
              }}
            >
              {t("navigate_verification_subtitle")}
            </Typography>
          </Box>

          <Box textAlign="center" marginTop={2}>
            <Button
              onClick={handleVerification}
              variant="contained"
              sx={{
                maxWidth: 800,
                mb: 2,
                border: 2,
                borderColor: "error.dark",
                borderRadius: (theme) => theme.spacing(2),
                backgroundColor: "white",
                color: "black",
                ":hover": {
                  backgroundColor: "secondary.light",
                },
                "text-transform": "none",
              }}
            >
              {t("navigate_verification_button")}
            </Button>
          </Box>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={selectedAppOption === "" ? true : false}
      TransitionComponent={Transition}
      maxWidth="sm"
      fullWidth
      aria-labelledby="navigate-modal-title"
      aria-describedby="navigate-modal-description"
    >
      <DialogTitle id="navigate-dialog-title" textAlign="center">
        <Typography
          variant="h6"
          component="div"
          sx={{
            mt: 2,
            bgcolor: "secondary.dark",
            color: "white",
            fontWeight: "bold",
            textAlign: "center",
            padding: 1,
            borderRadius: (theme) => theme.spacing(0.5),
          }}
        >
          {t("welcome_title")}
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Card
          sx={{
            maxWidth: 800,
            mb: 2,
            // bgcolor: "primary.bg",
            border: 2,
            borderColor: "border.strong",
            borderRadius: (theme) => theme.spacing(2),
          }}
        >
          <Typography //Use this approach to add new lines without risking inserting html
            component="div"
            sx={{
              margin: "auto",
              marginBottom: 2,
              textAlign: "left",
              padding: 1,
              borderRadius: (theme) => theme.spacing(0.5),
            }}
          >
            {t("welcome_subtitle")
              .split("/n")
              .map((line, index) => (
                <p key={index}>{line}</p>
              ))}
          </Typography>
        </Card>

        <Card
          sx={{
            maxWidth: 800,
            margin: "auto",
            marginBottom: 2,
            bgcolor: "primary.bgStrong",
            border: 2,
            borderColor: "primary.dark",
            borderRadius: (theme) => theme.spacing(2),
          }}
        >
          <CardContent>
            <Typography
              gutterBottom
              variant="h5"
              component="div"
              color="text.primary"
              sx={{
                textAlign: "center",
                fontWeight: "bold",
                backgroundColor: "secondary.main",
                borderRadius: (theme) => theme.spacing(1),
                padding: 1,
              }}
            >
              {t("card_option_title")}
            </Typography>
            {/* Flex container for buttons, make sure it's not wrapping and it's filling the width */}
            <Box sx={{ display: "flex", flexDirection: "row", justifyContent: "center" }}>
              {options.map((option) => (
                <CardActionArea
                  key={option}
                  onClick={() => handleSelect(option)}
                  sx={{
                    backgroundColor: "secondary.light",
                    flexGrow: 1,
                    borderRadius: (theme) => theme.spacing(1),
                    marginLeft: 0,
                    marginRight: 0,
                    textAlign: "center",
                    py: 1,
                    px: 0,
                    margin: 1, // Keep some space between the buttons
                    "&:first-of-type": {
                      marginLeft: 0, // Remove left margin for the first button
                    },
                    "&:last-of-type": {
                      marginRight: 0, // Remove right margin for the last button
                    },
                    transition: layoutTransition(["transform"]),
                    "&:active": {
                      transform: "scale(0.96)", // Slightly scale down when clicked
                    },
                  }}
                >
                  <Typography variant="body1" color="text.primary">
                    {t(`card_option_${option}`)}
                  </Typography>
                </CardActionArea>
              ))}
            </Box>
            <Box
              sx={{
                padding: 2,
                backgroundColor: "surface.muted",
                borderRadius: (theme) => theme.spacing(1),
              }}
            >
              <Typography variant="body2" color="text.primary">
                {t("card_option_remarks")}
              </Typography>
            </Box>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
};

export default NavigateAlert;
