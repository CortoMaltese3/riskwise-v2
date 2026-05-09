import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import DataUploadForm from "./DataUploadForm";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key) => key,
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

const baseProps = {
  busy: null,
  errors: [],
  pendingPath: null,
  pendingName: "",
  isDragging: false,
  onDragOver: () => {},
  onDragLeave: () => {},
  onDrop: () => {},
  onBrowse: () => {},
  onNameChange: () => {},
  onConfirm: () => {},
  onDismiss: () => {},
};

afterEach(() => {
  cleanup();
});

describe("measures DataUploadForm", () => {
  it("renders the drop zone with a Browse button by default", () => {
    render(<DataUploadForm {...baseProps} />);
    expect(screen.getByText("settings_measures_dropzone_headline")).toBeInTheDocument();
    expect(screen.getByText("settings_measures_browse")).toBeInTheDocument();
  });

  it("renders the upload dialog and surfaces validation errors when present", () => {
    render(
      <DataUploadForm
        {...baseProps}
        pendingPath="C:/tmp/sample.xlsx"
        pendingName="sample"
        errors={["Missing column foo", "Invalid hazard"]}
      />
    );

    expect(screen.getByRole("dialog", { name: "settings_measures_title" })).toBeInTheDocument();
    expect(screen.getByText("settings_measures_invalid_title")).toBeInTheDocument();
    expect(screen.getByText("Missing column foo")).toBeInTheDocument();
    expect(screen.getByText("Invalid hazard")).toBeInTheDocument();
  });

  it("invokes onBrowse when the Browse button is clicked", () => {
    const onBrowse = vi.fn();
    render(<DataUploadForm {...baseProps} onBrowse={onBrowse} />);
    fireEvent.click(screen.getByText("settings_measures_browse"));
    expect(onBrowse).toHaveBeenCalledTimes(1);
  });
});
