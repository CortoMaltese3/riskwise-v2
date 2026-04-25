import React, { useMemo } from "react";
import { Joyride, ACTIONS, EVENTS, STATUS } from "react-joyride";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";

import useStore from "../../store";
import { isRtl } from "../../i18nConfig";
import { buildJoyrideLocale, buildJoyrideStyles } from "./joyrideTheme";

// First-run walkthrough (issue #88): three fixed steps that auto-appear until
// ``hasSeenWalkthrough`` is persisted. Finish, Skip, or Close all terminate
// the walkthrough identically via ``finishWalkthrough`` so the flag gets set
// regardless of how the user dismisses it.
const Walkthrough = () => {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const walkthroughActive = useStore((s) => s.walkthroughActive);
  const finishWalkthrough = useStore((s) => s.finishWalkthrough);

  const rtl = isRtl(i18n.language);

  const steps = useMemo(
    () => [
      {
        target: "body",
        placement: "center",
        title: t("onboarding_walkthrough_step_1_title"),
        content: t("onboarding_walkthrough_step_1_body"),
        disableBeacon: true,
      },
      {
        target: "[data-tour='sidebar-nav']",
        placement: rtl ? "left" : "right",
        title: t("onboarding_walkthrough_step_2_title"),
        content: t("onboarding_walkthrough_step_2_body"),
        disableBeacon: true,
      },
      {
        target: "[data-tour='run-button']",
        placement: "top",
        title: t("onboarding_walkthrough_step_3_title"),
        content: t("onboarding_walkthrough_step_3_body"),
        disableBeacon: true,
      },
    ],
    [t, rtl]
  );

  if (!walkthroughActive) return null;

  const handleCallback = ({ action, status, type }) => {
    if (
      status === STATUS.FINISHED ||
      status === STATUS.SKIPPED ||
      action === ACTIONS.CLOSE ||
      type === EVENTS.TARGET_NOT_FOUND
    ) {
      finishWalkthrough();
    }
  };

  return (
    <Joyride
      steps={steps}
      run
      continuous
      showSkipButton
      showProgress
      disableScrolling
      disableOverlayClose
      callback={handleCallback}
      locale={buildJoyrideLocale(t)}
      styles={buildJoyrideStyles(theme, rtl)}
    />
  );
};

export default Walkthrough;
