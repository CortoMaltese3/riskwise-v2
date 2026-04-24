import React, { useMemo } from "react";
import { Joyride, ACTIONS, EVENTS, STATUS } from "react-joyride";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";

import useStore from "../../store";
import { isRtl } from "../../i18nConfig";
import { TOURS } from "./tours";
import { buildJoyrideLocale, buildJoyrideStyles } from "./joyrideTheme";

// Runner for the four guided tours (issue #88). Which tour is active and the
// current step both come from the Zustand store, which persists them to
// localStorage so a tour survives accidental reloads (resumable).
const GuidedTour = () => {
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const activeTour = useStore((s) => s.activeTour);
  const tourStep = useStore((s) => s.tourStep);
  const setTourStep = useStore((s) => s.setTourStep);
  const endTour = useStore((s) => s.endTour);

  const tour = useMemo(() => TOURS.find((x) => x.id === activeTour), [activeTour]);

  const rtl = isRtl(i18n.language);

  const steps = useMemo(
    () =>
      (tour?.steps ?? []).map((s) => ({
        target: s.target,
        content: t(s.contentKey),
        disableBeacon: true,
        placement: s.placement ?? (rtl ? "left" : "right"),
      })),
    [tour, t, rtl]
  );

  if (!tour || steps.length === 0) return null;

  const handleCallback = (data) => {
    const { action, index, status, type } = data;
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      endTour();
      return;
    }
    if (type === EVENTS.STEP_AFTER || type === EVENTS.TARGET_NOT_FOUND) {
      const next = index + (action === ACTIONS.PREV ? -1 : 1);
      if (next < 0 || next >= steps.length) {
        endTour();
      } else {
        setTourStep(next);
      }
    }
  };

  return (
    <Joyride
      key={tour.id}
      steps={steps}
      run
      continuous
      showProgress
      showSkipButton
      disableScrolling
      stepIndex={Math.min(tourStep, steps.length - 1)}
      callback={handleCallback}
      locale={buildJoyrideLocale(t)}
      styles={buildJoyrideStyles(theme, rtl)}
    />
  );
};

export default GuidedTour;
