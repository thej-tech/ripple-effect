import { expect, test } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { env } from "node:process";
import type {
  AIExplanation,
  AnalysisRun,
  ImpactPath,
  ImpactResult,
  Page,
  Workspace,
} from "../src/api";

test.describe.configure({ mode: "serial" });

test("accepts the three-component expo workflow and reopens its saved result", async ({
  page,
}, testInfo) => {
  test.skip(
    env.RIPPLE_RUN_LIVE_E2E !== "1",
    "Requires a freshly migrated, isolated SQLite database.",
  );
  test.setTimeout(360_000);
  page.setDefaultTimeout(12_000);
  const browserErrors: string[] = [];
  let inferenceRequests = 0;
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/ai-explanation")
    ) {
      inferenceRequests += 1;
    }
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.goto("/");
  const workspace = "Demo Infrastructure";
  const eventName = "Database Outage";
  const database = "Database";
  const backend = "Backend API";
  const frontend = "Frontend Application";
  const button = (name: string) =>
    page.getByRole("button", { name, exact: true });
  const section = (name: string) =>
    page.getByRole("navigation").getByRole("button", { name, exact: true });
  const field = (label: string) => page.getByLabel(label, { exact: true });
  const select = (name: string) =>
    page.getByRole("combobox", { name, exact: true });
  const node = (name: string) =>
    page
      .locator(".react-flow__node")
      .filter({ has: page.getByText(name, { exact: true }) });

  const workspacesResponse = await page.request.get("/api/v1/workspaces");
  expect(workspacesResponse.ok()).toBeTruthy();
  expect((await workspacesResponse.json()) as Workspace[]).toEqual([]);
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("button")).toHaveCount(4);
  await button("Create Workspace").click();
  await field("Name").fill(workspace);
  await button("Save workspace").click();
  await button("Open System Builder").click();

  for (const [name, description] of [
    [database, "Single primary data store. No replica or fallback."],
    [backend, "The API cannot serve requests if its only database is offline."],
    [
      frontend,
      "The interface requires the Backend API to perform every operation.",
    ],
  ]) {
    await button("Add Component").click();
    await field("Name").fill(name);
    await field("Category").fill("Infrastructure");
    await field("Description").fill(description);
    await select("Criticality").selectOption("High");
    await button("Save component").click();
    await expect(node(name)).toBeVisible();
  }

  await node(backend).click();
  await select("Status").selectOption("inactive");
  await button("Save component").click();
  await expect(node(backend)).toContainText("inactive");
  await node(backend).click();
  await select("Status").selectOption("active");
  await button("Save component").click();
  await expect(
    node(backend).getByText("Infrastructure · active", { exact: true }),
  ).toBeVisible();

  const models: string[] = [];
  for (const [source, target, relationship, context, manualWeight] of [
    [
      database,
      backend,
      "Read and write storage",
      "Every API request needs the only database. There is no cache or fallback.",
      "0.8",
    ],
    [
      backend,
      frontend,
      "Request processing",
      "Every user action requires a response from this only API. There is no offline mode.",
      "0.75",
    ],
  ]) {
    await page.evaluate(() => scrollTo(0, 0));
    if (source === database) {
      const from = node(source).locator(".react-flow__handle.source");
      const to = node(target).locator(".react-flow__handle.target");
      await from.click({ trial: true, timeout: 10_000 });
      await to.click({ trial: true, timeout: 10_000 });
      const fromBox = await from.boundingBox();
      const toBox = await to.boundingBox();
      if (!fromBox || !toBox)
        throw new Error("A connection handle is not visible.");
      await page.mouse.move(
        fromBox.x + fromBox.width / 2,
        fromBox.y + fromBox.height / 2,
      );
      await page.mouse.down();
      await page.mouse.move(
        toBox.x + toBox.width / 2,
        toBox.y + toBox.height / 2,
        { steps: 15 },
      );
      await page.mouse.up();
    } else {
      await button("Connect Components").click();
      await select("Source").selectOption({ label: source });
      await select("Dependent").selectOption({ label: target });
    }
    await expect(select("Source")).toBeVisible({ timeout: 10_000 });
    await expect(select("Source")).toHaveValue(
      (await node(source).getAttribute("data-id")) ?? "",
    );
    await expect(select("Dependent")).toHaveValue(
      (await node(target).getAttribute("data-id")) ?? "",
    );
    await field("Relationship type").fill(relationship);
    await field("Context").fill(context);
    await button("Save dependency").click();

    if (env.RIPPLE_E2E_MANUAL !== "1") {
      await button("Request AI assessment").click();
      await expect(button("Approve weight")).toBeVisible({ timeout: 100_000 });
      const model = await page.locator(".assessment small").innerText();
      expect(model.trim()).not.toEqual("");
      models.push(model.split(" · ")[0]);
      await expect(page.locator(".assessment")).toContainText("confidence");
      const recommended = Number(
        await page.locator(".assessment strong").innerText(),
      );
      expect(recommended).toBeGreaterThanOrEqual(0);
      expect(recommended).toBeLessThanOrEqual(1);
      await button("Approve weight").click();
    } else {
      await field("Manual weight (0–1)").fill(manualWeight);
      await button("Apply manual weight").click();
    }
    await expect(
      page.getByRole("status").filter({ hasText: "Weight decision saved." }),
    ).toBeVisible();
    await button("Close dependency editor").click();
  }
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("builder.png"),
    fullPage: true,
  });

  // Component edits, positions and reviewed weights persist before an analysis is created.
  await page.reload();
  const picker = field("Workspace");
  await expect(picker.locator("option:checked")).toHaveText(workspace);
  const headers = { "X-Active-Organization-ID": await picker.inputValue() };
  await section("System Builder").click();
  await expect(page.locator(".react-flow__node")).toHaveCount(3);
  await expect(page.locator(".react-flow__edge")).toHaveCount(2);

  await section("Impact Analysis").click();
  await button("Create trigger").click();
  await field("Name").fill(eventName);
  await field("Description").fill("The primary store is offline.");
  await field("Additional context").fill("No failover exists in this system.");
  await select("Starting entity").selectOption({ label: database });
  await field("Severity (0–100)").fill("90");
  await button("Save trigger").click();
  await button("Run analysis").click();

  const direct = page
    .locator("summary")
    .filter({ hasText: /Backend API .* Direct impact/ });
  const indirect = page
    .locator("summary")
    .filter({ hasText: /Frontend Application .* Indirect impact/ });
  await expect(direct).toBeVisible();
  await expect(indirect).toBeVisible();
  await direct.click();
  await indirect.click();
  await expect(
    page.getByText("Database → Backend API → Frontend Application", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByText(/Trigger severity 90\/100/)).toContainText(
    "Database",
  );
  await expect(
    page.getByText("No failover exists in this system.", { exact: true }),
  ).toBeVisible();

  const runResponse = await page.request.get("/api/v1/analysis-runs", {
    headers,
  });
  expect(runResponse.ok()).toBeTruthy();
  const {
    items: [run],
    total,
  } = (await runResponse.json()) as Page<AnalysisRun>;
  expect(total).toBe(1);
  expect(run.status).toBe("completed");
  const scoresResponse = await page.request.get(
    `/api/v1/analysis-runs/${run.id}/results`,
    { headers },
  );
  expect(scoresResponse.ok()).toBeTruthy();
  const scores = (await scoresResponse.json()) as Page<ImpactResult>;
  expect(scores.total).toBe(3);
  const directScore = scores.items.find(
    (item) => item.entity_name === backend,
  )!;
  const indirectScore = scores.items.find(
    (item) => item.entity_name === frontend,
  )!;
  const pathsResponse = await page.request.get(
    `/api/v1/analysis-runs/${run.id}/results/${indirectScore.entity_id}/paths`,
    { headers },
  );
  expect(pathsResponse.ok()).toBeTruthy();
  const paths = (await pathsResponse.json()) as Page<ImpactPath>;
  const path = paths.items.find((item) => item.is_primary)!;
  expect(path.provenance.entity_names).toEqual([database, backend, frontend]);
  const [firstWeight, secondWeight] = path.provenance.weights;
  expect(directScore.depth).toBe(1);
  expect(indirectScore.depth).toBe(2);
  expect(directScore.score).toBeCloseTo(90 * firstWeight * 0.8, 5);
  expect(indirectScore.score).toBeCloseTo(
    90 * firstWeight * secondWeight * 0.8 ** 2,
    5,
  );
  await expect(indirect).toContainText(indirectScore.score.toFixed(1));
  await expect(indirect.locator("..")).toContainText(indirectScore.explanation);
  await expect(page.locator(".result-canvas .propagation-trigger")).toHaveCount(
    1,
  );
  await expect(page.locator(".result-canvas .propagation-direct")).toHaveCount(
    1,
  );
  await expect(
    page.locator(".result-canvas .propagation-indirect"),
  ).toHaveCount(1);
  const directNode = page.locator(".result-canvas .propagation-direct");
  await expect(directNode).toContainText("Direct impact");
  await directNode.click();
  await expect(directNode).toHaveClass(/analysis-node-selected/);
  await expect(direct.locator("..")).toHaveAttribute("open", "");

  let savedCommentary: AIExplanation | null = null;
  if (models.length) {
    await indirect
      .locator("..")
      .getByRole("button", { name: "Explain with AI" })
      .click();
    await expect(page.locator(".explanation")).toContainText(models[0], {
      timeout: 100_000,
    });
    const savedResponse = await page.request.get(
      `/api/v1/analysis-runs/${run.id}/ai-explanation`,
      {
        headers,
        params: { entity_id: indirectScore.entity_id },
      },
    );
    expect(savedResponse.ok()).toBeTruthy();
    savedCommentary = (await savedResponse.json()) as AIExplanation;
    await expect(indirect.locator("..").locator(".explanation p")).toHaveText(
      savedCommentary.explanation,
    );
  } else {
    await direct
      .locator("..")
      .getByRole("button", { name: "Explain with AI" })
      .click();
    await expect(direct.locator("..").getByRole("alert")).toContainText(
      "unavailable",
      {
        timeout: 100_000,
      },
    );
    await expect(indirect).toBeVisible();
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({
    path: testInfo.outputPath("analysis.png"),
    fullPage: true,
  });

  await section("System Builder").click();
  await node(database).click();
  await field("Name").fill("Database renamed after analysis");
  await button("Save component").click();
  await expect(node("Database renamed after analysis")).toBeVisible();
  const immutable = await page.request.get(`/api/v1/analysis-runs/${run.id}`, {
    headers,
  });
  expect(immutable.ok()).toBeTruthy();
  expect(((await immutable.json()) as AnalysisRun).input_snapshot).toEqual(
    run.input_snapshot,
  );

  await section("History").click();
  await button(eventName).click();
  await expect(indirect).toBeVisible();
  await page.reload();
  await expect(picker.locator("option:checked")).toHaveText(workspace);
  await expect(
    page.getByRole("region", { name: "Workspace overview" }),
  ).toContainText("1 Saved runs");
  await section("History").click();
  await button(eventName).click();
  await expect(indirect).toBeVisible();
  const inferenceBeforeReopening = inferenceRequests;
  await indirect.click();
  if (savedCommentary) {
    await expect(indirect.locator("..").locator(".explanation p")).toHaveText(
      savedCommentary.explanation,
    );
    await expect(
      indirect
        .locator("..")
        .getByRole("button", { name: "Regenerate commentary" }),
    ).toBeVisible();
  } else {
    await expect(
      indirect.locator("..").getByText("No saved AI commentary."),
    ).toBeVisible();
  }
  expect(inferenceRequests).toBe(inferenceBeforeReopening);
  if (env.RIPPLE_PERSISTENCE_BASELINE) {
    const dependencies = await page.request.get(
      "/api/v1/dependencies?limit=100",
      { headers },
    );
    expect(dependencies.ok()).toBeTruthy();
    await writeFile(
      env.RIPPLE_PERSISTENCE_BASELINE,
      JSON.stringify(
        {
          workspaceId: await picker.inputValue(),
          run,
          results: scores.items,
          dependencies: (await dependencies.json()).items,
          selectedEntityId: indirectScore.entity_id,
          savedCommentary,
        },
        null,
        2,
      ),
    );
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.screenshot({
    path: testInfo.outputPath("history-mobile.png"),
    fullPage: true,
  });
  expect(browserErrors).toEqual([]);

  console.log(
    JSON.stringify({
      workspaceId: await picker.inputValue(),
      runId: run.id,
      models,
      firstWeight,
      secondWeight,
      direct: directScore.score,
      indirect: indirectScore.score,
    }),
  );
});

test("frames a saved analysis across mobile and desktop resizing", async ({
  page,
}, testInfo) => {
  test.skip(
    env.RIPPLE_RUN_LIVE_E2E !== "1",
    "Requires the isolated live workspace from the acceptance test.",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const nodes = page.locator(".result-canvas .react-flow__node");

  async function openSavedRun(width: number, height: number) {
    await page.setViewportSize({ width, height });
    await page.goto("/");
    await page
      .getByLabel("Workspace", { exact: true })
      .selectOption({ label: "Demo Infrastructure" });
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "History", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Database Outage", exact: true })
      .click();
    await expect(nodes).toHaveCount(3);
  }

  async function allNodesAreFramed() {
    const canvas = await page.locator(".result-canvas").boundingBox();
    if (!canvas) return false;
    const bounds = await nodes.evaluateAll((elements) =>
      elements.map((element) => {
        const rect = element.getBoundingClientRect();
        return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom };
      }),
    );
    return bounds.every(
      (rect) =>
        rect.x >= canvas.x &&
        rect.right <= canvas.x + canvas.width &&
        rect.y >= canvas.y &&
        rect.bottom <= canvas.y + canvas.height,
    );
  }

  await openSavedRun(1400, 900);
  await expect.poll(allNodesAreFramed).toBe(true);
  await openSavedRun(390, 844);
  await expect.poll(allNodesAreFramed).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("responsive-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1400, height: 900 });
  await expect.poll(allNodesAreFramed).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("responsive-desktop.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("keeps approved weights and manual entry available when assessment is offline", async ({
  page,
}) => {
  test.skip(
    env.RIPPLE_RUN_LIVE_E2E !== "1" || env.RIPPLE_E2E_MANUAL !== "1",
    "Requires the isolated manual-mode workspace and an unavailable model.",
  );
  await page.goto("/");
  const picker = page.getByLabel("Workspace", { exact: true });
  await picker.selectOption({ label: "Demo Infrastructure" });
  const headers = { "X-Active-Organization-ID": await picker.inputValue() };
  const before = await page.request.get("/api/v1/dependencies?limit=100", {
    headers,
  });
  expect(before.ok()).toBeTruthy();
  const beforeData = await before.json();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "System Builder", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Database renamed after analysis → Backend API",
      exact: true,
    })
    .click();
  await page
    .getByRole("button", { name: "Request AI assessment", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("unavailable", {
    timeout: 100_000,
  });
  await expect(
    page.getByRole("button", { name: "Approve weight", exact: true }),
  ).toHaveCount(0);
  const manual = page.getByLabel("Manual weight (0–1)", { exact: true });
  await expect(manual).toBeEnabled();
  await manual.fill("0.4");
  await expect(
    page.getByRole("button", { name: "Apply manual weight", exact: true }),
  ).toBeEnabled();
  const after = await page.request.get("/api/v1/dependencies?limit=100", {
    headers,
  });
  expect(after.ok()).toBeTruthy();
  expect(await after.json()).toEqual(beforeData);
});

test("reopens the exact persisted run after an externally performed API restart", async ({
  page,
}) => {
  test.skip(
    env.RIPPLE_VERIFY_RESTART !== "1",
    "Run explicitly after restarting the isolated API against the baseline database.",
  );
  const baselinePath = env.RIPPLE_PERSISTENCE_BASELINE;
  if (!baselinePath)
    throw new Error(
      "RIPPLE_PERSISTENCE_BASELINE must point to the recorded isolated-run evidence.",
    );
  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as {
    workspaceId: string;
    run: AnalysisRun;
    results: ImpactResult[];
    dependencies: { id: string; weight: number; review_status: string }[];
    selectedEntityId: string;
    savedCommentary: AIExplanation | null;
  };
  let inferenceRequests = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname.endsWith("/ai-explanation")
    )
      inferenceRequests += 1;
  });
  await page.goto("/");
  await page
    .getByLabel("Workspace", { exact: true })
    .selectOption(baseline.workspaceId);
  const headers = { "X-Active-Organization-ID": baseline.workspaceId };
  const runResponse = await page.request.get(
    `/api/v1/analysis-runs/${baseline.run.id}`,
    { headers },
  );
  expect(runResponse.ok()).toBeTruthy();
  const restored = (await runResponse.json()) as AnalysisRun;
  expect(restored.input_hash).toBe(baseline.run.input_hash);
  expect(restored.input_snapshot).toEqual(baseline.run.input_snapshot);
  const results = await page.request.get(
    `/api/v1/analysis-runs/${baseline.run.id}/results?limit=100`,
    { headers },
  );
  expect(results.ok()).toBeTruthy();
  expect((await results.json()).items).toEqual(baseline.results);
  const dependencies = await page.request.get(
    "/api/v1/dependencies?limit=100",
    { headers },
  );
  expect(dependencies.ok()).toBeTruthy();
  expect((await dependencies.json()).items).toEqual(baseline.dependencies);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "History", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Database Outage", exact: true })
    .click();
  const selected = baseline.results.find(
    (item) => item.entity_id === baseline.selectedEntityId,
  );
  if (!selected)
    throw new Error("The baseline is missing its selected historical result.");
  const summary = page
    .locator("summary")
    .filter({ hasText: selected.entity_name });
  await summary.click();
  if (baseline.savedCommentary) {
    await expect(summary.locator("..").locator(".explanation p")).toHaveText(
      baseline.savedCommentary.explanation,
    );
  } else {
    await expect(
      summary.locator("..").getByText("No saved AI commentary."),
    ).toBeVisible();
  }
  expect(inferenceRequests).toBe(0);
});
