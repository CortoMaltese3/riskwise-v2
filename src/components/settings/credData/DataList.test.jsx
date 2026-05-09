import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import DataList from "./DataList";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      if (opts && typeof opts === "object" && opts.name) {
        return `${key}:${opts.name}`;
      }
      return key;
    },
    i18n: { language: "en", changeLanguage: vi.fn() },
  }),
}));

const builtin = {
  id: "builtin-1",
  name: "Built-in CRED",
  is_builtin: true,
  uploaded_at: null,
};

const custom = {
  id: "custom-1",
  name: "My dataset",
  is_builtin: false,
  uploaded_at: "2026-05-01T10:00:00Z",
};

afterEach(() => {
  cleanup();
});

describe("DataList", () => {
  it("renders empty state when no datasets are provided", () => {
    render(
      <DataList datasets={[]} selectedId={null} onSelect={() => {}} onRequestDelete={() => {}} />
    );
    expect(screen.getByText("settings_cred_data_list_empty")).toBeInTheDocument();
  });

  it("renders rows for each dataset and shows a delete button only for custom datasets", () => {
    render(
      <DataList
        datasets={[builtin, custom]}
        selectedId={custom.id}
        onSelect={() => {}}
        onRequestDelete={() => {}}
      />
    );

    expect(screen.getByText("Built-in CRED")).toBeInTheDocument();
    expect(screen.getByText("My dataset")).toBeInTheDocument();
    // Delete IconButton has aria-label `settings_cred_data_delete_aria:<name>`.
    expect(screen.getByLabelText("settings_cred_data_delete_aria:My dataset")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("settings_cred_data_delete_aria:Built-in CRED")
    ).not.toBeInTheDocument();
  });

  it("invokes onRequestDelete when the delete button is clicked", () => {
    const onRequestDelete = vi.fn();
    render(
      <DataList
        datasets={[custom]}
        selectedId={custom.id}
        onSelect={() => {}}
        onRequestDelete={onRequestDelete}
      />
    );
    fireEvent.click(screen.getByLabelText("settings_cred_data_delete_aria:My dataset"));
    expect(onRequestDelete).toHaveBeenCalledWith(custom);
  });
});
