import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

vi.mock("../../help/ContextualTooltip", () => ({
  default: () => null,
}));

import theme from "../../../theme/theme";
import useWorkspaceStore from "../../../store/useWorkspaceStore";
import Exposure from "../Exposure";

const initialStoreState = useWorkspaceStore.getState();

const resetStore = (overrides = {}) => {
  useWorkspaceStore.setState({
    ...initialStoreState,
    selectedExposure: "",
    selectedExposureCategory: null,
    isValidExposure: false,
    ...overrides,
  });
};

const renderExposure = () =>
  render(
    <ThemeProvider theme={theme}>
      <Exposure />
    </ThemeProvider>
  );

const expectStripeStyles = (container) => {
  const card = container.querySelector(".MuiCard-root");
  // MUI's `sx` compiles to an emotion class rather than inline style, and
  // jsdom resolves `getComputedStyle` against that class. Reading the
  // borderLeft long-hands gives back the resolved tokens we set.
  const computed = window.getComputedStyle(card);
  expect(computed.borderLeftStyle).toBe("solid");
};

describe("Exposure input card", () => {
  beforeEach(() => {
    resetStore();
  });

  it("renders the Custom chip and a stripe when no asset is selected", () => {
    const { container, getByText } = renderExposure();
    expect(getByText("chip_category_custom")).toBeInTheDocument();
    expectStripeStyles(container);
  });

  it("renders the Economic chip when a catalog economic asset is selected", () => {
    resetStore({ selectedExposure: "crops", selectedExposureCategory: "economic" });
    const { getByText } = renderExposure();
    expect(getByText("chip_category_economic")).toBeInTheDocument();
  });

  it("renders the Non-economic chip when a catalog non-economic asset is selected", () => {
    resetStore({
      selectedExposure: "buddhist_monks",
      selectedExposureCategory: "non_economic",
    });
    const { getByText } = renderExposure();
    expect(getByText("chip_category_non_economic")).toBeInTheDocument();
  });

  it("falls back to the stored category when the asset is a Custom upload", () => {
    resetStore({
      selectedExposure: "my_custom_asset.xlsx",
      selectedExposureCategory: "non_economic",
    });
    const { getByText } = renderExposure();
    expect(getByText("chip_category_non_economic")).toBeInTheDocument();
  });
});
