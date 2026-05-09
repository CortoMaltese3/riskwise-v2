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

describe("DataUploadForm", () => {
  it("renders the drop zone with a Browse button by default", () => {
    render(<DataUploadForm {...baseProps} />);
    expect(screen.getByText("settings_cred_data_dropzone_headline")).toBeInTheDocument();
    expect(screen.getByText("settings_cred_data_browse")).toBeInTheDocument();
  });

  it("renders the upload dialog and surfaces validation errors when present", () => {
    render(
      <DataUploadForm
        {...baseProps}
        pendingPath="C:/tmp/sample.xlsx"
        pendingName="sample"
        errors={["Missing column foo", "Invalid currency"]}
      />
    );

    // Dialog title is rendered inside the upload dialog.
    expect(screen.getByRole("dialog", { name: "settings_cred_data_title" })).toBeInTheDocument();
    expect(screen.getByText("settings_cred_data_invalid_title")).toBeInTheDocument();
    expect(screen.getByText("Missing column foo")).toBeInTheDocument();
    expect(screen.getByText("Invalid currency")).toBeInTheDocument();
  });

  it("invokes onBrowse when the Browse button is clicked", () => {
    const onBrowse = vi.fn();
    render(<DataUploadForm {...baseProps} onBrowse={onBrowse} />);
    fireEvent.click(screen.getByText("settings_cred_data_browse"));
    expect(onBrowse).toHaveBeenCalledTimes(1);
  });
});
