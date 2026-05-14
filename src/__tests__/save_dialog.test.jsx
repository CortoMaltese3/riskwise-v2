import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const saveScenarioMock = vi.fn();
const enqueueToastMock = vi.fn();

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    saveScenario: (...args) => saveScenarioMock(...args),
  },
}));

vi.mock("../hooks/useToast", () => ({
  enqueueToast: (...args) => enqueueToastMock(...args),
}));

let SaveScenarioDialog;

beforeAll(async () => {
  ({ default: SaveScenarioDialog } = await import("../components/workspace/SaveScenarioDialog"));
});

beforeEach(() => {
  saveScenarioMock.mockReset();
  enqueueToastMock.mockReset();
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

  it("enqueues a success toast carrying the scenario name on save success", async () => {
    saveScenarioMock.mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: { id: "s-1" } },
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

    await waitFor(() => expect(enqueueToastMock).toHaveBeenCalledTimes(1));
    const call = enqueueToastMock.mock.calls[0][0];
    expect(call.severity).toBe("success");
    expect(call.message).toBe("save_scenario_success_toast");
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
    expect(enqueueToastMock).not.toHaveBeenCalled();
  });

  it("enqueues an error toast with the backend message when save fails", async () => {
    saveScenarioMock.mockResolvedValue({
      success: false,
      error: { message: "boom" },
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

    fireEvent.click(screen.getByRole("button", { name: /save/i }));

    await waitFor(() => expect(enqueueToastMock).toHaveBeenCalledTimes(1));
    const call = enqueueToastMock.mock.calls[0][0];
    expect(call.severity).toBe("error");
    expect(call.message).toBe("boom");
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("enqueues an error toast when the client throws", async () => {
    saveScenarioMock.mockRejectedValue(new Error("network down"));

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

    await waitFor(() => expect(enqueueToastMock).toHaveBeenCalledTimes(1));
    const call = enqueueToastMock.mock.calls[0][0];
    expect(call.severity).toBe("error");
    expect(call.message).toBe("network down");
  });
});
