import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const saveScenarioMock = vi.fn();

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    saveScenario: (...args) => saveScenarioMock(...args),
  },
}));

let SaveScenarioDialog;

beforeAll(async () => {
  ({ default: SaveScenarioDialog } = await import("../components/workspace/SaveScenarioDialog"));
});

beforeEach(() => {
  saveScenarioMock.mockReset();
});

describe("SaveScenarioDialog", () => {
  it("submits trimmed name/tags/notes and fires onSaved", async () => {
    saveScenarioMock.mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: { id: "s-1" } },
    });
    const onSaved = vi.fn();
    const onClose = vi.fn();

    render(
      <SaveScenarioDialog
        open
        scenarioId="s-1"
        defaultName="Egypt flood"
        onClose={onClose}
        onSaved={onSaved}
      />
    );

    fireEvent.change(screen.getByLabelText(/tags/i), {
      target: { value: "  flood, egypt  " },
    });
    fireEvent.change(screen.getByLabelText(/notes/i), {
      target: { value: "  first save  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(saveScenarioMock).toHaveBeenCalledTimes(1));
    expect(saveScenarioMock).toHaveBeenCalledWith("s-1", {
      name: "Egypt flood",
      tags: "flood, egypt",
      notes: "first save",
    });
    expect(onSaved).toHaveBeenCalledWith({ id: "s-1" });
    expect(onClose).toHaveBeenCalled();
  });

  it("surfaces a validation error when the name is blank", async () => {
    const onSaved = vi.fn();
    render(
      <SaveScenarioDialog
        open
        scenarioId="s-1"
        defaultName=""
        onClose={vi.fn()}
        onSaved={onSaved}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Name is required");
    expect(saveScenarioMock).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("surfaces the backend error message when save fails", async () => {
    saveScenarioMock.mockResolvedValue({
      success: false,
      error: { message: "boom" },
    });
    render(
      <SaveScenarioDialog
        open
        scenarioId="s-1"
        defaultName="Egypt flood"
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });
});
