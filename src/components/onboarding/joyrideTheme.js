// Shared react-joyride config used by both the first-run Walkthrough and the
// guided tours (issue #88). Centralizing locale/styles keeps the two tours
// visually consistent and prevents drift — especially the RTL direction toggle,
// which both components otherwise have to apply by hand.
export const buildJoyrideLocale = (t) => ({
  back: t("onboarding_back"),
  close: t("onboarding_close"),
  last: t("onboarding_done"),
  next: t("onboarding_next"),
  skip: t("onboarding_skip"),
});

export const buildJoyrideStyles = (theme, rtl) => ({
  options: {
    primaryColor: theme.palette.primary.main,
    zIndex: theme.zIndex.modal + 10,
    textAlign: rtl ? "right" : "left",
  },
  tooltip: {
    direction: rtl ? "rtl" : "ltr",
    maxWidth: 360,
    boxSizing: "border-box",
  },
  tooltipContent: { direction: rtl ? "rtl" : "ltr" },
});
