
﻿import { render, screen, waitFor, within } from "@testing-library/react";

﻿import { render, screen, within } from "@testing-library/react";

import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";

vi.mock("@xyflow/react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@xyflow/react")>()),
  Background: () => null,
  Controls: () => null,
  ReactFlow: ({
    nodes,
  }: {
    nodes: {
      id: string;
      className?: string;
      position: { x: number; y: number };
      sourcePosition?: string;
      data: { label: ReactNode };
    }[];
  }) => (
    <div data-testid="analysis-graph">
      {nodes.map((node) => (
        <div
          key={node.id}
          className={node.className}
          data-x={node.position.x}
          data-source={node.sourcePosition}
          data-testid={`node-${node.id}`}
        >
          {node.data.label}
        </div>
      ))}
    </div>
  ),
}));

const api = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
  workspaceDashboard: vi.fn(),
  saveWorkspace: vi.fn(),
  listEntities: vi.fn(),
  listDependencies: vi.fn(),
  listEvents: vi.fn(),
  listRuns: vi.fn(),

  listResults: vi.fn(),
  listPaths: vi.fn(),
  getSavedExplanation: vi.fn(),
  explainAnalysis: vi.fn(),

  listScenarios: vi.fn(),

}));

vi.mock("./api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./api")>()),
  ApiClient: class {
    constructor() {
      return api;
    }
  },
}));

afterEach(() => {
  vi.resetAllMocks();
  sessionStorage.clear();
});

function mockOverview() {
  api.workspaceDashboard.mockResolvedValue({
    workspace_count: 0,
    entity_count: 0,
    approved_dependency_count: 0,
    run_count: 0,
    recent_workspaces: [],
    recent_runs: [],
  });
}

test("opens the dashboard with the five product sections and an empty workspace list", async () => {
  api.listWorkspaces.mockResolvedValue([]);
  mockOverview();
  render(<App />);
  expect(
    await screen.findByText(
      "Create a system to start mapping your dependencies.",
    ),
  ).toBeVisible();
  expect(screen.getByRole("navigation")).toHaveTextContent(
    "DashboardSystem BuilderImpact AnalysisScenariosHistory",
  );
  expect(screen.getByRole("button", { name: "System Builder" })).toBeDisabled();
  expect(
    screen.queryByLabelText(/API URL|organization ID|user ID/i),
  ).not.toBeInTheDocument();
});

test("creates a workspace and opens an empty System Builder", async () => {
  const user = userEvent.setup();
  api.listWorkspaces.mockResolvedValue([]);
  mockOverview();
  api.saveWorkspace.mockResolvedValue({
    id: "one",
    name: "Example",
    description: "Notes",
  });
  for (const method of [
    api.listEntities,
    api.listDependencies,
    api.listEvents,
    api.listRuns,
  ]) {
    method.mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });
  }
  render(<App />);
  await screen.findByText(
    "Create a system to start mapping your dependencies.",
  );
  await user.click(screen.getByRole("button", { name: "Create Workspace" }));
  await user.type(screen.getByLabelText("Name"), "Example");
  await user.type(screen.getByLabelText("Description"), "Notes");
  await user.click(screen.getByRole("button", { name: "Save workspace" }));
  expect(api.saveWorkspace).toHaveBeenCalledWith(
    { name: "Example", description: "Notes" },
    false,
  );
  await user.click(
    await screen.findByRole("button", { name: "Open System Builder" }),
  );
  expect(
    screen.getByText("Add your first entity to start building."),
  ).toBeVisible();
});

test("shows request errors and retries the workspace list", async () => {
  const user = userEvent.setup();
  mockOverview();
  api.listWorkspaces
    .mockRejectedValueOnce(new Error("Could not reach the service"))
    .mockResolvedValue([]);
  render(<App />);
  expect(screen.getByRole("status")).toHaveTextContent("Working");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Could not reach the service",
  );
  await user.click(screen.getByRole("button", { name: "Retry" }));
  expect(
    await screen.findByText(
      "Create a system to start mapping your dependencies.",
    ),
  ).toBeVisible();
});


test("arranges unsaved builder components left to right along dependencies", async () => {
  const user = userEvent.setup();
  sessionStorage.setItem("ripple.workspace", "one");
  api.listWorkspaces.mockResolvedValue([
    { id: "one", name: "User system", description: "" },
  ]);
  mockOverview();
  const entity = (id: string, name: string, attributes = {}) => ({
    id,
    name,
    status: "active",
    entity_type: "system",
    attributes,
  });
  api.listEntities.mockResolvedValue({
    items: [
      entity("api", "Backend API"),
      entity("db", "Database"),
      entity("ui", "Frontend"),
      entity("saved", "Saved position", { position_x: -40, position_y: 12 }),
      entity("loop-a", "Loop A"),
      entity("loop-b", "Loop B"),
    ],
    total: 6,
    limit: 100,
    offset: 0,
  });
  const edge = (id: string, source: string, target: string) => ({
    id,
    source_entity_id: source,
    target_entity_id: target,
    is_active: true,
    review_status: "validated",
    weight: 1,
  });
  api.listDependencies.mockResolvedValue({
    items: [
      edge("one", "db", "api"),
      edge("two", "api", "ui"),
      edge("three", "loop-a", "loop-b"),
      edge("four", "loop-b", "loop-a"),
    ],
    total: 4,
    limit: 100,
    offset: 0,
  });
  for (const method of [api.listEvents, api.listRuns]) {
    method.mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });
  }
  render(<App />);
  await waitFor(() =>
    expect(screen.getByLabelText("Workspace")).toHaveValue("one"),
  );
  await user.click(
    await screen.findByRole("button", { name: "System Builder" }),
  );
  const x = (id: string) => Number(screen.getByTestId(`node-${id}`).dataset.x);
  await screen.findByTestId("node-db");
  expect(x("db")).toBeLessThan(x("api"));
  expect(x("api")).toBeLessThan(x("ui"));
  expect(x("saved")).toBe(-40);
  expect(x("loop-a")).toBe(0);
  expect(x("loop-b")).toBe(0);
  expect(screen.getByTestId("node-db").dataset.source).toBe("right");
});

function prepareHistory() {
  sessionStorage.setItem("ripple.workspace", "one");
  api.listWorkspaces.mockResolvedValue([
    { id: "one", name: "User system", description: "" },
  ]);
  mockOverview();

test("opens the scenario workspace from the primary navigation", async () => {
  const user = userEvent.setup();
  api.listWorkspaces.mockResolvedValue([]);
  mockOverview();
  api.saveWorkspace.mockResolvedValue({
    id: "one",
    name: "Example",
    description: "",
  });

  for (const method of [
    api.listEntities,
    api.listDependencies,
    api.listEvents,

  ]) {
    method.mockResolvedValue({ items: [], total: 0, limit: 100, offset: 0 });
  }
  const run = {
    id: "run",
    event_id: "event",
    scenario_id: null,
    status: "completed",
    created_at: "2026-11-19T10:00:00Z",
    input_snapshot: { event: { title: "Saved disruption" } },
  };
  api.listRuns.mockResolvedValue({
    items: [run],
    total: 1,
    limit: 100,
    offset: 0,
  });
  const item = {
    id: "result",
    entity_id: "target",
    entity_name: "Saved target",
    entity_type: "system",
    score: 72,
    depth: 1,
    impact_level: "high",
    confidence_label: "high",
    confidence_reason: "Reviewed dependency data.",
    explanation: "A stored deterministic explanation.",
  };
  api.listResults.mockResolvedValue({
    items: [item],
    total: 1,
    limit: 50,
    offset: 0,
  });
  api.listPaths.mockImplementation(async (_run, _entity, offset = 0) => ({
    items: [
      {
        id: `path-${offset}`,
        entity_id: "target",
        provenance: {
          entity_names: [
            offset === 0 ? "First route" : "Last route",
            "Saved target",
          ],
          weights: [1],
          steps: [],
        },
      },
    ],
    total: 2,
    limit: 1,
    offset,
  }));
  api.getSavedExplanation.mockResolvedValue(null);
  return { run, item };
}

test("loads later workspace pages and every historical path page", async () => {
  const user = userEvent.setup();
  prepareHistory();
  const historyPage = await api.listRuns();
  api.listRuns.mockImplementation(async (_event, offset = 0) =>
    offset === 0
      ? {
          items: [
            {
              ...historyPage.items[0],
              id: "older",
              input_snapshot: { event: { title: "First run" } },
            },
          ],
          total: 2,
          limit: 1,
          offset,
        }
      : { ...historyPage, total: 2, limit: 1, offset },
  );
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "History" }));
  await user.click(
    await screen.findByRole("button", { name: "Saved disruption" }),
  );
  await user.click(
    await screen.findByText(/Saved target · 72.0 · high · Direct impact/),
  );
  expect(await screen.findByText(/Last route → Saved target/)).toBeVisible();
  expect(api.listRuns).toHaveBeenCalledWith(undefined, 1);
  expect(api.listPaths).toHaveBeenCalledWith("run", "target", 1);
});

test("reopens saved commentary without inference and keeps it if regeneration fails", async () => {
  const user = userEvent.setup();
  prepareHistory();
  api.getSavedExplanation.mockResolvedValue({
    model: "saved-model",
    explanation: "Previously generated commentary.",
  });
  api.explainAnalysis.mockRejectedValue(new Error("Ollama is offline"));
  const { unmount } = render(<App />);
  await user.click(await screen.findByRole("button", { name: "History" }));
  await user.click(
    await screen.findByRole("button", { name: "Saved disruption" }),
  );
  const summary = await screen.findByText(
    /Saved target · 72.0 · high · Direct impact/,
  );
  await user.click(summary);
  expect(
    await screen.findByText("Previously generated commentary."),
  ).toBeVisible();
  expect(api.explainAnalysis).not.toHaveBeenCalled();
  expect(api.getSavedExplanation).toHaveBeenCalledWith("run", "target");
  await user.click(
    screen.getByRole("button", { name: "Regenerate commentary" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Ollama is offline",
  );
  expect(screen.getByText("Previously generated commentary.")).toBeVisible();
  expect(
    within(summary.parentElement!).getByText("Human review required"),
  ).toBeVisible();
  await waitFor(() => expect(api.explainAnalysis).toHaveBeenCalledTimes(1));
  unmount();
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "History" }));
  await user.click(
    await screen.findByRole("button", { name: "Saved disruption" }),
  );
  await user.click(
    await screen.findByText(/Saved target · 72.0 · high · Direct impact/),
  );
  expect(
    await screen.findByText("Previously generated commentary."),
  ).toBeVisible();
  expect(api.explainAnalysis).toHaveBeenCalledTimes(1);
});

test("shows a saved-commentary error and retries retrieval without generating", async () => {
  const user = userEvent.setup();
  prepareHistory();
  api.getSavedExplanation
    .mockRejectedValueOnce(new Error("History service unavailable"))
    .mockResolvedValueOnce({
      model: "saved-model",
      explanation: "Recovered saved commentary.",
    });
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "History" }));
  await user.click(
    await screen.findByRole("button", { name: "Saved disruption" }),
  );
  await user.click(
    await screen.findByText(/Saved target · 72.0 · high · Direct impact/),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "History service unavailable",
  );
  await user.click(
    screen.getByRole("button", { name: "Retry saved commentary" }),
  );
  expect(await screen.findByText("Recovered saved commentary.")).toBeVisible();
  expect(api.explainAnalysis).not.toHaveBeenCalled();
});

test("distinguishes saved trigger, direct and indirect nodes in depth columns", async () => {
  const user = userEvent.setup();
  const { item } = prepareHistory();
  api.listResults.mockResolvedValue({
    items: [
      {
        ...item,
        id: "source-result",
        entity_id: "source",
        entity_name: "Original source",
        depth: 0,
        score: 90,
      },
      item,
      {
        ...item,
        id: "indirect-result",
        entity_id: "indirect",
        entity_name: "Original indirect",
        depth: 2,
        score: 57.6,
      },
    ],
    limit: 50,
    offset: 0,
    total: 3,
  });
  api.listPaths.mockResolvedValue({
    items: [],
    limit: 100,
    offset: 0,
    total: 0,
  });
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "History" }));
  await user.click(
    await screen.findByRole("button", { name: "Saved disruption" }),
  );
  const source = await screen.findByTestId("node-source");
  const direct = screen.getByTestId("node-target");
  const indirect = screen.getByTestId("node-indirect");
  expect(source).toHaveTextContent("Starting entity");
  expect(direct).toHaveTextContent("Direct impact");
  expect(indirect).toHaveTextContent("Indirect impact");
  expect(indirect).toHaveTextContent("57.6");
  expect(Number(source.dataset.x)).toBeLessThan(Number(direct.dataset.x));
  expect(Number(direct.dataset.x)).toBeLessThan(Number(indirect.dataset.x));

    api.listRuns,
    api.listScenarios,
  ]) {
    method.mockResolvedValue({ items: [], total: 0 });
  }
  render(<App />);
  await screen.findByText(
    "Create a system to start mapping your dependencies.",
  );
  await user.click(screen.getByRole("button", { name: "Create Workspace" }));
  await user.type(screen.getByLabelText("Name"), "Example");
  await user.click(screen.getByRole("button", { name: "Save workspace" }));
  await screen.findByRole("button", { name: "Open System Builder" });

  await user.click(
    within(screen.getByRole("navigation")).getByRole("button", {
      name: "Scenarios",
    }),
  );

  expect(
    await screen.findByRole("heading", { name: "Create a scenario" }),
  ).toBeVisible();
  expect(
    screen.getByText(
      "Scenario estimates are not predictions or recommendations.",
    ),
  ).toBeVisible();
  expect(api.listScenarios).toHaveBeenCalledTimes(1);

});
