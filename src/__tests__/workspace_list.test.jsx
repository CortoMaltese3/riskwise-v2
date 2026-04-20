import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const deleteScenarioMock = vi.fn();

vi.mock("../lib/RiskWiseClient", () => ({
  default: {
    deleteScenario: (...args) => deleteScenarioMock(...args),
    // WorkspaceList also calls listScenarios when `items` prop is omitted,
    // but the tests below always pass `items` so this is just a safety net.
    listScenarios: vi.fn().mockResolvedValue({
      success: true,
      result: { status: { code: 2000 }, data: [] },
    }),
  },
}));

let WorkspaceList;

beforeAll(async () => {
  ({ default: WorkspaceList } = await import("../components/workspace/WorkspaceList"));
});

beforeEach(() => {
  deleteScenarioMock.mockReset();
});

const FIXTURE = [
  {
    id: "s-1",
    name: "Egypt flood run",
    country: "Egypt",
    hazard_type: "flood",
    created_at: "2026-04-20T10:00:00Z",
  },
  {
    id: "s-2",
    name: "Thailand drought",
    country: "Thailand",
    hazard_type: "drought",
    created_at: "2026-04-19T10:00:00Z",
  },
];

describe("WorkspaceList", () => {
  it("renders one row per fixture scenario with country + hazard metadata", () => {
    render(<WorkspaceList items={FIXTURE} />);

    expect(screen.getByText("Egypt flood run")).toBeInTheDocument();
    expect(screen.getByText("Thailand drought")).toBeInTheDocument();
    // Secondary line joins country / hazard / created_at with bullet separators.
    expect(screen.getByText(/Egypt • flood •/)).toBeInTheDocument();
    expect(screen.getByText(/Thailand • drought •/)).toBeInTheDocument();
  });

  it("renders an empty-state message when there are no scenarios", () => {
    render(<WorkspaceList items={[]} />);
    expect(screen.getByText(/no saved scenarios/i)).toBeInTheDocument();
  });

  it("calls onOpen with the row when a scenario is clicked", () => {
    const onOpen = vi.fn();
    render(<WorkspaceList items={FIXTURE} onOpen={onOpen} />);

    fireEvent.click(screen.getByText("Egypt flood run"));
    expect(onOpen).toHaveBeenCalledWith(FIXTURE[0]);
  });

  it("removes the row after the backend confirms a delete", async () => {
    deleteScenarioMock.mockResolvedValue({
      success: true,
      result: { status: { code: 2000 } },
    });
    render(<WorkspaceList items={FIXTURE} />);

    fireEvent.click(screen.getByLabelText("delete-s-1"));

    await waitFor(() => expect(deleteScenarioMock).toHaveBeenCalledWith("s-1"));
    await waitFor(() => expect(screen.queryByText("Egypt flood run")).not.toBeInTheDocument());
    expect(screen.getByText("Thailand drought")).toBeInTheDocument();
  });
});
