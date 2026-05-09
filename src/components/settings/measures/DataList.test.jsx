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
  name: "Built-in measures",
  is_builtin: true,
  uploaded_at: null,
  measure_count: 5,
};

const custom = {
  id: "custom-1",
  name: "My measures",
  is_builtin: false,
  uploaded_at: "2026-05-01T10:00:00Z",
  measure_count: 3,
  countries: "Greece",
  hazards: "Flood",
};

afterEach(() => {
  cleanup();
});

describe("measures DataList", () => {
  it("renders empty state when no datasets are provided", () => {
    render(<DataList datasets={[]} onRequestDelete={() => {}} />);
    expect(screen.getByText("settings_measures_list_empty")).toBeInTheDocument();
  });

  it("renders rows for each dataset and shows a delete button only for custom datasets", () => {
    render(<DataList datasets={[builtin, custom]} onRequestDelete={() => {}} />);

    expect(screen.getByText("Built-in measures")).toBeInTheDocument();
    expect(screen.getByText("My measures")).toBeInTheDocument();
    expect(screen.getByLabelText("settings_measures_delete_aria:My measures")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("settings_measures_delete_aria:Built-in measures")
    ).not.toBeInTheDocument();
  });

  it("invokes onRequestDelete when the delete button is clicked", () => {
    const onRequestDelete = vi.fn();
    render(<DataList datasets={[custom]} onRequestDelete={onRequestDelete} />);
    fireEvent.click(screen.getByLabelText("settings_measures_delete_aria:My measures"));
    expect(onRequestDelete).toHaveBeenCalledWith(custom);
  });
});
