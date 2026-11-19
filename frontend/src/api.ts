export type Page<T> = {
  items: T[];
  limit: number;
  offset: number;
  total: number;
};

export async function collectPages<T>(
  load: (offset: number) => Promise<Page<T>>,
): Promise<T[]> {
  const items: T[] = [];
  let offset = 0;
  while (true) {
    const page = await load(offset);
    if (
      page.offset !== offset ||
      !Number.isInteger(page.limit) ||
      page.limit <= 0 ||
      !Number.isInteger(page.total) ||
      page.total < offset ||
      !Array.isArray(page.items) ||
      page.items.length !== Math.min(page.limit, page.total - offset)
    ) {
      throw new Error(
        "Pagination returned an incomplete or non-advancing page. Retry loading the data.",
      );
    }
    items.push(...page.items);
    offset += page.limit;
    if (offset >= page.total) return items;
  }
}

export type EntityType =
  | "person"
  | "department"
  | "resource"
  | "activity"
  | "system"
  | "location"
  | "group";

export type Workspace = {
  id: string;
  name: string;
  description: string | null;
};

export type WorkspaceDashboard = {
  workspace_count: number;
  entity_count: number;
  approved_dependency_count: number;
  run_count: number;
  recent_workspaces: (Workspace & { last_modified_at: string })[];
  recent_runs: {
    id: string;
    workspace_id: string;
    workspace_name: string;
    event_title: string;
    status: AnalysisRun["status"];
    created_at: string;
  }[];
};

export type Assessment = {
  recommended_weight?: number;
  reasoning?: string;
  confidence?: string;
  uncertainty?: string;
  assumptions?: string[];
  missing_information?: string[];
  model?: string;
  assessed_at?: string;
  decision: string;
};

export type Entity = {
  id: string;
  name: string;
  description: string | null;
  entity_type: EntityType;
  status: "active" | "inactive" | "archived";
  exposure: number;
  mitigation: number;
  attributes: Record<string, unknown>;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Dependency = {
  assessment?: Assessment | null;
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  relationship_label: string;
  weight: number;
  rationale: string | null;
  review_status: "draft" | "reviewed" | "validated";
  is_active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
};

export type EventRecord = {
  id: string;
  title: string;
  description: string | null;
  severity: number;
  start_at: string;
  duration_minutes: number | null;
  status: "draft" | "open" | "resolved" | "archived";
  created_at: string;
  updated_at: string;
};

export type EventTrigger = {
  id: string;
  event_id: string;
  entity_id: string;
  exposure: number;
  rationale: string | null;
  created_at: string;
};

export type AnalysisRun = {
  id: string;
  organization_id: string;
  event_id: string;
  scenario_id: string | null;
  status:
    | "pending"
    | "running"
    | "completed"
    | "completed_with_limits"
    | "incomplete"
    | "failed";
  configuration: Record<string, unknown>;
  algorithm_version: string;
  input_hash: string;
  input_snapshot?: Record<string, unknown>;
  as_of: string;
  summary: Record<string, unknown>;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type Scenario = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  baseline_run_id: string | null;
  status: "draft" | "archived";
  version: number;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

export type ScenarioDetail = Scenario & {
  event_overlay: {
    event: {
      id: string;
      title: string;
      status: EventRecord["status"];
      severity: number;
      start_at: string;
    };
    triggers: Array<{
      entity_id: string;
      exposure: number;
      rationale: string | null;
    }>;
  };
  entity_overrides: Array<{
    id: string;
    entity_id: string;
    exposure: number | null;
    mitigation: number | null;
    status: Entity["status"] | null;
    rationale: string | null;
  }>;
  dependency_overrides: Array<{
    id: string;
    dependency_id: string | null;
    source_entity_id: string | null;
    target_entity_id: string | null;
    relationship_type: string | null;
    relationship_label: string | null;
    weight: number | null;
    is_active: boolean | null;
    review_status: Dependency["review_status"] | null;
    rationale: string | null;
  }>;
  interventions: ScenarioIntervention[];
};

export type ScenarioInterventionType =
  | "mitigation"
  | "weight_override"
  | "deactivate_dependency"
  | "hypothetical_dependency";

export type ScenarioIntervention = {
  id: string;
  scenario_id: string;
  title: string;
  action_type: ScenarioInterventionType;
  target_entity_id: string | null;
  target_dependency_id: string | null;
  rationale: string;
  assumptions: Record<string, unknown>;
  author_user_id: string;
  created_at: string;
};

export type ScenarioComparison = {
  scenario_id: string;
  baseline_run_id: string;
  scenario_run_id: string;
  scenario_version: number;
  baseline_status: AnalysisRun["status"];
  scenario_status: AnalysisRun["status"];
  potentially_incomplete: boolean;
  estimated_effect: {
    baseline_total_score: number;
    scenario_total_score: number;
    score_delta: number;
  };
  assumptions: ScenarioIntervention[];
  items: Array<{
    entity_id: string;
    entity_name: string;
    change_type: "added" | "removed" | "changed" | "unchanged";
    baseline_score: number;
    scenario_score: number;
    delta: number;
  }>;
};

export type ImpactResult = {
  id: string;
  run_id: string;
  entity_id: string;
  entity_name: string;
  entity_type: EntityType;
  depth: number;
  score: number;
  impact_level: "low" | "moderate" | "high" | "critical";
  confidence_value: number;
  confidence_label: "low" | "medium" | "high";
  confidence_reason: string;
  primary_path_id: string | null;
  trigger_entity_ids: string[];
  explanation: string;
  result_flags: Record<string, unknown>;
};

export type ImpactPathStep = {
  entity_id: string;
  entity_name: string;
  entity_type: EntityType;
  mitigation: number;
  dependency_id: string | null;
  relationship_type: string | null;
  relationship_label: string | null;
  weight: number | null;
  review_status: "draft" | "reviewed" | "validated" | null;
  rationale: string | null;
  is_hypothetical: boolean;
};

export type ImpactPath = {
  id: string;
  run_id: string;
  entity_id: string;
  trigger_entity_id: string;
  score: number;
  edge_count: number;
  is_primary: boolean;
  provenance: {
    entity_ids: string[];
    entity_names: string[];
    dependency_labels: string[];
    dependency_types: string[];
    weights: number[];
    review_statuses: string[];
    steps: ImpactPathStep[];
    [key: string]: unknown;
  };
};

export type AIExplanation = {
  model: string;
  explanation: string;
};

export type ApiConfig = {
  baseUrl: string;
  userId: string;
  organizationId: string;
};

export type ApiErrorDetail = {
  field: string;
  message: string;
  code: string;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    readonly requestId: string | null,
    readonly details: ApiErrorDetail[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function errorFromPayload(
  payload: unknown,
  status: number,
  requestId: string | null,
) {
  if (isRecord(payload) && isRecord(payload.error)) {
    const body = payload.error;
    const details = Array.isArray(body.details)
      ? body.details.filter(
          (detail): detail is ApiErrorDetail =>
            isRecord(detail) &&
            typeof detail.field === "string" &&
            typeof detail.message === "string" &&
            typeof detail.code === "string",
        )
      : [];
    const detailMessage = details
      .map((detail) => `${detail.field}: ${detail.message}`)
      .join("; ");
    const message =
      typeof body.message === "string"
        ? body.message
        : "The API request failed.";
    return new ApiError(
      detailMessage ? `${message} ${detailMessage}` : message,
      status,
      typeof body.code === "string" ? body.code : "request_error",
      typeof body.request_id === "string" ? body.request_id : requestId,
      details,
    );
  }

  return new ApiError(
    "The API returned an unsuccessful response without its documented error details.",
    status,
    "request_error",
    requestId,
    [],
  );
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(
    private readonly config: ApiConfig,
    fetcher?: typeof fetch,
  ) {
    this.baseUrl = config.baseUrl.trim().replace(/\/+$/, "");
    this.fetcher = fetcher ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = this.baseUrl ? `${this.baseUrl}${path}` : path;
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (this.config.userId) headers.set("X-Local-User-ID", this.config.userId);
    if (this.config.organizationId)
      headers.set("X-Active-Organization-ID", this.config.organizationId);
    if (init.body !== undefined) {
      headers.set("Content-Type", "application/json");
    }

    const response = await this.fetcher(url, { ...init, headers });
    if (response.status === 204) return undefined as T;
    const requestId = response.headers.get("X-Request-ID");
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      if (!response.ok) {
        throw new ApiError(
          `The API request failed with HTTP ${response.status} and an unreadable response.`,
          response.status,
          "invalid_error_response",
          requestId,
          [],
        );
      }
      throw new ApiError(
        "The API returned a response that could not be decoded as JSON.",
        response.status,
        "invalid_success_response",
        requestId,
        [],
      );
    }

    if (!response.ok) {
      throw errorFromPayload(payload, response.status, requestId);
    }
    return payload as T;
  }

  private page<T>(path: string, params = new URLSearchParams(), offset = 0) {
    params.set("limit", "100");
    if (offset > 0) params.set("offset", String(offset));
    return this.request<Page<T>>(`${path}?${params.toString()}`);
  }

  listWorkspaces() {
    return this.request<Workspace[]>("/api/v1/workspaces");
  }

  workspaceDashboard() {
    return this.request<WorkspaceDashboard>("/api/v1/workspace-dashboard");
  }

  saveWorkspace(payload: { name: string; description: string }, edit: boolean) {
    return this.request<Workspace>(
      edit ? "/api/v1/workspaces/current" : "/api/v1/workspaces",
      {
        method: edit ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      },
    );
  }

  requestAssessment(id: string) {
    return this.request<Dependency>(`/api/v1/dependencies/${id}/assessment`, {
      method: "POST",
    });
  }

  decideAssessment(
    dependency: Dependency,
    decision: "approve" | "reject" | "override",
    weight?: number,
  ) {
    return this.request<Dependency>(
      `/api/v1/dependencies/${dependency.id}/assessment/decision`,
      {
        method: "POST",
        body: JSON.stringify({
          expected_updated_at: dependency.updated_at,
          decision,
          weight,
        }),
      },
    );
  }

  deleteTrigger(eventId: string, triggerId: string) {
    return this.request<void>(
      `/api/v1/events/${eventId}/triggers/${triggerId}`,
      { method: "DELETE" },
    );
  }

  health() {
    return this.request<{ status: string }>("/api/v1/health/ready");
  }

  listEntities(offset = 0) {
    return this.page<Entity>("/api/v1/entities", undefined, offset);
  }

  listDependencies(offset = 0) {
    return this.page<Dependency>("/api/v1/dependencies", undefined, offset);
  }

  listEvents(offset = 0) {
    return this.page<EventRecord>("/api/v1/events", undefined, offset);
  }

  createEntity(payload: {
    name: string;
    entity_type: EntityType;
    status?: "active" | "inactive";
    description?: string;
    mitigation?: number;
    attributes?: Record<string, unknown>;
  }) {
    return this.request<Entity>("/api/v1/entities", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  updateEntity(
    entityId: string,
    payload: {
      expected_updated_at: string;
      name: string;
      entity_type: EntityType;
      status?: "active" | "inactive";
      description: string;
      exposure: number;
      mitigation: number;
      attributes?: Record<string, unknown>;
    },
  ) {
    return this.request<Entity>(`/api/v1/entities/${entityId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  archiveEntity(entityId: string, expectedUpdatedAt: string) {
    const params = new URLSearchParams({
      expected_updated_at: expectedUpdatedAt,
    });
    return this.request<Entity>(
      `/api/v1/entities/${entityId}?${params.toString()}`,
      { method: "DELETE" },
    );
  }

  createDependency(payload: {
    source_entity_id: string;
    target_entity_id: string;
    relationship_type: string;
    relationship_label?: string;
    weight: number;
    rationale?: string;
    review_status: "draft" | "reviewed" | "validated";
  }) {
    return this.request<Dependency>("/api/v1/dependencies", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  updateDependency(
    dependencyId: string,
    payload: {
      expected_updated_at: string;
      relationship_type: string;
      rationale: string;
    },
  ) {
    return this.request<Dependency>(`/api/v1/dependencies/${dependencyId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  setDependencyActive(
    dependencyId: string,
    payload: { expected_updated_at: string; is_active: boolean },
  ) {
    return this.request<Dependency>(
      `/api/v1/dependencies/${dependencyId}/activation`,
      { method: "PATCH", body: JSON.stringify(payload) },
    );
  }

  saveTriggerEvent(
    payload: {
      title: string;
      description: string;
      severity: number;
      start_at: string;
      entity_id: string;
      context?: string;
      expected_updated_at?: string;
    },
    id?: string,
  ) {
    return this.request<{ event: EventRecord; trigger: EventTrigger }>(
      id ? `/api/v1/trigger-events/${id}` : "/api/v1/trigger-events",
      { method: id ? "PATCH" : "POST", body: JSON.stringify(payload) },
    );
  }

  createEvent(payload: {
    title: string;
    description?: string;
    severity: number;
    start_at: string;
    status: "draft";
  }) {
    return this.request<EventRecord>("/api/v1/events", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  updateEvent(
    eventId: string,
    payload: {
      expected_updated_at: string;
      title: string;
      description: string;
      severity: number;
      start_at: string;
    },
  ) {
    return this.request<EventRecord>(`/api/v1/events/${eventId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  listTriggers(eventId: string) {
    return this.page<EventTrigger>(`/api/v1/events/${eventId}/triggers`);
  }

  addTrigger(
    eventId: string,
    payload: { entity_id: string; exposure: number },
  ) {
    return this.request<EventTrigger>(`/api/v1/events/${eventId}/triggers`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  updateEventStatus(
    eventId: string,
    payload: { expected_updated_at: string; status: "open" | "archived" },
  ) {
    return this.request<EventRecord>(`/api/v1/events/${eventId}/status`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  listRuns(eventId?: string, offset = 0) {
    const params = new URLSearchParams(eventId ? { event_id: eventId } : {});
    return this.page<AnalysisRun>("/api/v1/analysis-runs", params, offset);
  }

  listScenarioRuns(scenarioId: string) {
    const params = new URLSearchParams({
      scenario_id: scenarioId,
      limit: "100",
    });
    return this.page<AnalysisRun>("/api/v1/analysis-runs", params);
  }

  listScenarios() {
    return this.page<Scenario>("/api/v1/scenarios");
  }

  getScenario(scenarioId: string) {
    return this.request<ScenarioDetail>(`/api/v1/scenarios/${scenarioId}`);
  }

  createScenario(payload: {
    name: string;
    description?: string;
    baseline_run_id: string;
  }) {
    return this.request<Scenario>("/api/v1/scenarios", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  updateScenarioEvent(
    scenarioId: string,
    payload: {
      expected_version: number;
      title?: string;
      severity?: number;
      start_at?: string;
    },
  ) {
    return this.request<Scenario>(`/api/v1/scenarios/${scenarioId}/event`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  }

  createScenarioIntervention(
    scenarioId: string,
    payload: {
      expected_version: number;
      title: string;
      action_type: ScenarioInterventionType;
      target_entity_id?: string;
      target_dependency_id?: string;
      source_entity_id?: string;
      mitigation?: number;
      weight?: number;
      relationship_type?: string;
      relationship_label?: string;
      rationale: string;
      assumptions: Record<string, unknown>;
    },
  ) {
    return this.request<ScenarioIntervention>(
      `/api/v1/scenarios/${scenarioId}/interventions`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  }

  runScenario(
    scenarioId: string,
    payload: {
      expected_version: number;
    },
  ) {
    return this.request<AnalysisRun>(
      `/api/v1/scenarios/${scenarioId}/analysis-runs`,
      { method: "POST", body: JSON.stringify(payload) },
    );
  }

  compareScenario(scenarioId: string, scenarioRunId: string) {
    const params = new URLSearchParams({ scenario_run_id: scenarioRunId });
    return this.request<ScenarioComparison>(
      `/api/v1/scenarios/${scenarioId}/comparison?${params.toString()}`,
    );
  }

  archiveScenario(scenarioId: string, expectedVersion: number) {
    const params = new URLSearchParams({
      expected_version: String(expectedVersion),
    });
    return this.request<Scenario>(`/api/v1/scenarios/${scenarioId}?${params}`, {
      method: "DELETE",
    });
  }

  createAnalysisRun(eventId: string) {
    return this.request<AnalysisRun>(
      `/api/v1/events/${eventId}/analysis-runs`,
      {
        method: "POST",
        body: JSON.stringify({}),
      },
    );
  }

  listResults(runId: string, offset = 0) {
    const params = new URLSearchParams({ limit: "50", offset: String(offset) });
    return this.request<Page<ImpactResult>>(
      `/api/v1/analysis-runs/${runId}/results?${params.toString()}`,
    );
  }

  listPaths(runId: string, entityId: string, offset = 0) {
    return this.page<ImpactPath>(
      `/api/v1/analysis-runs/${runId}/results/${entityId}/paths`,
      undefined,
      offset,
    );
  }

  explainAnalysis(runId: string, entityId: string) {
    return this.request<AIExplanation>(
      `/api/v1/analysis-runs/${runId}/ai-explanation`,
      {
        method: "POST",
        body: JSON.stringify({ entity_id: entityId }),
      },
    );
  }

  async getSavedExplanation(
    runId: string,
    entityId: string,
  ): Promise<AIExplanation | null> {
    const params = new URLSearchParams({ entity_id: entityId });
    try {
      return await this.request<AIExplanation>(
        `/api/v1/analysis-runs/${runId}/ai-explanation?${params}`,
      );
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }
}
