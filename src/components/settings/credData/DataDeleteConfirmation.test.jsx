import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import DataDeleteConfirmation from "./DataDeleteConfirmation";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      if (opts && typeof opts === "object" && "name" in opts) {
        return `${key}:${opts.name}`;
      }
      return key;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

const dataset = { id: "ds-1", name: "My dataset" };

afterEach(() => {
  cleanup();
});

describe("DataDeleteConfirmation", () => {
  it("does not render the dialog when no dataset is selected", () => {
    render(
      <DataDeleteConfirmation dataset={null} onCancel={() => {}} onConfirm={() => {}} busy={null} />
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the dialog with the dataset name and wires the action buttons", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <DataDeleteConfirmation
        dataset={dataset}
        onCancel={onCancel}
        onConfirm={onConfirm}
        busy={null}
      />
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("settings_cred_data_delete_body:My dataset")).toBeInTheDocument();

    fireEvent.click(screen.getByText("cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText("settings_cred_data_delete_action"));
    expect(onConfirm).toHaveBeenCalledWith(dataset);
  });

  it("disables the confirm button while a delete is in progress", () => {
    render(
      <DataDeleteConfirmation
        dataset={dataset}
        onCancel={() => {}}
        onConfirm={() => {}}
        busy="deleting"
      />
    );
    const confirmBtn = screen.getByText("settings_cred_data_delete_action").closest("button");
    expect(confirmBtn).toBeDisabled();
  });
});
