import React from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { act, render, screen, fireEvent, within } from "@testing-library/react";

import "../i18nConfig";
import GlossaryDrawer from "../components/help/GlossaryDrawer";
import useUIStore from "../store/useUIStore";

const renderOpen = () => {
  act(() => {
    useUIStore.getState().setGlossaryOpen(true);
  });
  return render(<GlossaryDrawer />);
};

describe("GlossaryDrawer", () => {
  beforeEach(() => {
    act(() => {
      useUIStore.getState().setGlossaryOpen(false);
    });
  });

  it("renders terms from the English glossary when opened", () => {
    renderOpen();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^glossary$/i })).toBeInTheDocument();
    expect(screen.getByText(/AAL \(Average Annual Loss\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Return Period/)).toBeInTheDocument();
  });

  it("filters the term list as the user types", () => {
    renderOpen();
    const search = screen.getByPlaceholderText(/search terms/i);
    fireEvent.change(search, { target: { value: "return period" } });
    expect(screen.getByText(/Return Period/)).toBeInTheDocument();
    expect(screen.queryByText(/AAL \(Average Annual Loss\)/)).not.toBeInTheDocument();
  });

  it("expands a term when Enter is pressed on a focused item", () => {
    renderOpen();
    const listbox = screen.getByRole("listbox");
    const first = within(listbox).getAllByRole("option")[0];
    first.focus();
    fireEvent.keyDown(listbox, { key: "Enter" });
    expect(first).toHaveAttribute("aria-expanded", "true");
  });

  it("moves focus with arrow keys", () => {
    renderOpen();
    const listbox = screen.getByRole("listbox");
    const options = within(listbox).getAllByRole("option");
    options[0].focus();
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(document.activeElement).toBe(options[1]);
    fireEvent.keyDown(listbox, { key: "ArrowUp" });
    expect(document.activeElement).toBe(options[0]);
  });

  it("shows a no-results message when the query matches nothing", () => {
    renderOpen();
    const search = screen.getByPlaceholderText(/search terms/i);
    fireEvent.change(search, { target: { value: "zzznomatchxyz" } });
    expect(screen.getByText(/no terms match your search/i)).toBeInTheDocument();
  });
});
