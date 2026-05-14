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
  isDragging: false,
  validation: null,
  pendingPath: null,
  onDragOver: () => {},
  onDragLeave: () => {},
  onDrop: () => {},
  onBrowse: () => {},
  onConfirmImport: () => {},
  onDismiss: () => {},
};

afterEach(() => {
  cleanup();
});

describe("customData DataUploadForm", () => {
  it("renders the drop zone with a Browse button by default", () => {
    render(<DataUploadForm {...baseProps} />);
    expect(screen.getByText("settings_custom_data_dropzone_headline")).toBeInTheDocument();
    expect(screen.getByText("settings_custom_data_browse")).toBeInTheDocument();
  });

  it("renders validation errors when validation is invalid", () => {
    render(
      <DataUploadForm
        {...baseProps}
        validation={{
          valid: false,
          errors: ["Missing manifest", "Bad ISO3"],
        }}
      />
    );
    expect(screen.getByText("settings_custom_data_invalid_title")).toBeInTheDocument();
    expect(screen.getByText("Missing manifest")).toBeInTheDocument();
    expect(screen.getByText("Bad ISO3")).toBeInTheDocument();
  });

  it("renders the import-confirm dialog when validation succeeds and a pending path is set", () => {
    render(
      <DataUploadForm
        {...baseProps}
        validation={{ valid: true, country_name: "Greece", iso3: "GRC" }}
        pendingPath="C:/tmp/grc.zip"
      />
    );
    expect(
      screen.getByRole("dialog", { name: "settings_custom_data_confirm_title" })
    ).toBeInTheDocument();
  });

  it("invokes onBrowse when the Browse button is clicked", () => {
    const onBrowse = vi.fn();
    render(<DataUploadForm {...baseProps} onBrowse={onBrowse} />);
    fireEvent.click(screen.getByText("settings_custom_data_browse"));
    expect(onBrowse).toHaveBeenCalledTimes(1);
  });
});
