import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import App from "./App";

const api = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
  workspaceDashboard: vi.fn(),
  saveWorkspace: vi.fn(),
  listEntities: vi.fn(),
  listDependencies: vi.fn(),
  listEvents: vi.fn(),
  listRuns: vi.fn(),
  listScenarios: vi.fn(),
}));

vi.mock("./api", () => ({
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
    method.mockResolvedValue({ items: [], total: 0 });
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
