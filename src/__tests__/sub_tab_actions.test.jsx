// Coverage for #249: Save Scenario / Save Map | Save Chart actions live in
// a `<SubTabActions>` toolbar that is a sibling of `<Tabs>`, not a child.
// The previous code rendered them as `<Button>`s inside `<Tabs>`, which
// caused MUI to announce them as tabs to assistive tech and required the
// `right: 100|0|8` absolute-positioning hack. These tests pin the new
// shape so a regression that re-nests the buttons fails loudly.

import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const handleSaveImageMock = vi.fn();
const handleSaveMapMock = vi.fn();
const handleAddToOutputMock = vi.fn();

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

vi.mock("../utils/mapTools", () => ({
  useMapTools: () => ({
    handleSaveImage: handleSaveImageMock,
    handleSaveMap: handleSaveMapMock,
    handleAddToOutput: handleAddToOutputMock,
  }),
}));

const stateRef = {
  current: {
    activeViewControl: "display_map",
    selectedTab: "risk",
    setActiveViewControl: vi.fn(),
  },
};

vi.mock("../store/useUIStore", () => {
  const fn = (selector) => selector(stateRef.current);
  fn.getState = () => stateRef.current;
  fn.setState = (patch) => {
    stateRef.current = { ...stateRef.current, ...patch };
  };
  return { default: fn };
});

const setState = (patch) => {
  stateRef.current = { ...stateRef.current, ...patch };
};

beforeEach(() => {
  handleSaveImageMock.mockReset();
  handleSaveMapMock.mockReset();
  handleAddToOutputMock.mockReset();
  setState({
    activeViewControl: "display_map",
    selectedTab: "risk",
    setActiveViewControl: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
});

describe("SubTabActions toolbar (Risk tab)", () => {
  it("renders nothing when not on the Risk tab", async () => {
    setState({ selectedTab: "parameters" });
    const { default: SubTabActions } = await import("../components/main/SubTabActions");
    const { container } = render(<SubTabActions />);
    expect(container).toBeEmptyDOMElement();
  });

  it("exposes a toolbar role with both Save buttons announced as buttons", async () => {
    const { default: SubTabActions } = await import("../components/main/SubTabActions");
    render(<SubTabActions />);
    const toolbar = screen.getByRole("toolbar", { name: "main_subsection_actions_aria" });
    expect(toolbar).toBeInTheDocument();
    // Both action elements must be `button`s — not `tab`s — for screen readers.
    expect(
      screen.getByRole("button", { name: "main_subsection_title_save_scenario" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "main_subsection_title_save_map" })
    ).toBeInTheDocument();
    // No tab role should leak from the toolbar.
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
  });

  it("shows 'Save Chart' label when the active view is the chart frame", async () => {
    setState({ activeViewControl: "display_chart" });
    const { default: SubTabActions } = await import("../components/main/SubTabActions");
    render(<SubTabActions />);
    expect(
      screen.getByRole("button", { name: "main_subsection_title_save_chart" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "main_subsection_title_save_map" })
    ).not.toBeInTheDocument();
  });

  it("dispatches handleAddToOutput from the Save Scenario button", async () => {
    const { default: SubTabActions } = await import("../components/main/SubTabActions");
    render(<SubTabActions />);
    fireEvent.click(screen.getByRole("button", { name: "main_subsection_title_save_scenario" }));
    expect(handleAddToOutputMock).toHaveBeenCalledTimes(1);
    expect(handleSaveMapMock).not.toHaveBeenCalled();
    expect(handleSaveImageMock).not.toHaveBeenCalled();
  });

  it("dispatches handleSaveMap from Save Map when the map view is active", async () => {
    const { default: SubTabActions } = await import("../components/main/SubTabActions");
    render(<SubTabActions />);
    fireEvent.click(screen.getByRole("button", { name: "main_subsection_title_save_map" }));
    expect(handleSaveMapMock).toHaveBeenCalledTimes(1);
    expect(handleSaveImageMock).not.toHaveBeenCalled();
  });

  it("dispatches handleSaveImage from Save Chart when the chart view is active", async () => {
    setState({ activeViewControl: "display_chart" });
    const { default: SubTabActions } = await import("../components/main/SubTabActions");
    render(<SubTabActions />);
    fireEvent.click(screen.getByRole("button", { name: "main_subsection_title_save_chart" }));
    expect(handleSaveImageMock).toHaveBeenCalledTimes(1);
    expect(handleSaveMapMock).not.toHaveBeenCalled();
  });
});
