import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import DataDeleteConfirmation from "./DataDeleteConfirmation";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      if (opts && typeof opts === "object" && "iso3" in opts) {
        return `${key}:${opts.iso3}`;
      }
      return key;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

const entry = { iso3: "GRC", country_name: "Greece" };

afterEach(() => {
  cleanup();
});

describe("customData DataDeleteConfirmation", () => {
  it("does not render the dialog when no entry is selected", () => {
    render(
      <DataDeleteConfirmation entry={null} onCancel={() => {}} onConfirm={() => {}} busy={null} />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the dialog and wires the action buttons", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <DataDeleteConfirmation entry={entry} onCancel={onCancel} onConfirm={onConfirm} busy={null} />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("settings_custom_data_delete_body:GRC")).toBeInTheDocument();

    fireEvent.click(screen.getByText("cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("settings_custom_data_delete_action"));
    expect(onConfirm).toHaveBeenCalledWith(entry);
  });

  it("disables the confirm button while a delete is in progress", () => {
    render(
      <DataDeleteConfirmation
        entry={entry}
        onCancel={() => {}}
        onConfirm={() => {}}
        busy="deleting"
      />
    );
    const confirmBtn = screen.getByText("settings_custom_data_delete_action").closest("button");
    expect(confirmBtn).toBeDisabled();
  });
});
