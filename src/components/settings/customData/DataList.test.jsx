import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";

import DataList from "./DataList";

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

const entry = {
  iso3: "GRC",
  country_name: "Greece",
  installed_at: "2026-05-01T10:00:00Z",
};

afterEach(() => {
  cleanup();
});

describe("customData DataList", () => {
  it("renders empty state when no entries are installed", () => {
    render(<DataList installed={[]} onRequestDelete={() => {}} />);
    expect(screen.getByText("settings_custom_data_installed_empty")).toBeInTheDocument();
  });

  it("renders a row per installed pack with a delete button", () => {
    render(<DataList installed={[entry]} onRequestDelete={() => {}} />);
    expect(screen.getByText("Greece")).toBeInTheDocument();
    expect(screen.getByText("GRC")).toBeInTheDocument();
    expect(screen.getByLabelText("settings_custom_data_delete_aria:GRC")).toBeInTheDocument();
  });

  it("invokes onRequestDelete with the entry when delete is clicked", () => {
    const onRequestDelete = vi.fn();
    render(<DataList installed={[entry]} onRequestDelete={onRequestDelete} />);
    fireEvent.click(screen.getByLabelText("settings_custom_data_delete_aria:GRC"));
    expect(onRequestDelete).toHaveBeenCalledWith(entry);
  });
});
