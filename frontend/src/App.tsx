import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MarkerType,
  Position,
  applyNodeChanges,
  useNodesInitialized,
  useReactFlow,
  type Node,
  type NodeChange,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import RippleBackground from "./RippleBackground";
import {
  ApiClient,
  collectPages,
  type AIExplanation,
  type AnalysisRun,
  type Dependency,
  type Entity,
  type EventRecord,
  type EventTrigger,
  type ImpactPath,
  type ImpactResult,
  type Workspace,
  type WorkspaceDashboard,
} from "./api";

const sections = [
  "Dashboard",
  "System Builder",
  "Impact Analysis",
  "History",
] as const;
type Section = (typeof sections)[number];
const clientFor = (id = "") =>
  new ApiClient({
    baseUrl: import.meta.env.VITE_API_BASE_URL || "",
    userId: "",
    organizationId: id,
  });
const client = clientFor();
const text = (form: FormData, field: string) =>
  String(form.get(field) ?? "").trim();
const message = (error: unknown) =>
  error instanceof Error ? error.message : "The request failed.";
const statusLabel = (status: string) => status.replaceAll("_", " ");

function dependencyLevels(entities: Entity[], dependencies: Dependency[]) {
  const ids = new Set(entities.map(({ id }) => id));
  const edges = dependencies.filter(
    (edge) =>
      edge.is_active &&
      ids.has(edge.source_entity_id) &&
      ids.has(edge.target_entity_id),
  );
  const pending = new Map([...ids].map((id) => [id, 0]));
  for (const edge of edges) {
    pending.set(edge.target_entity_id, pending.get(edge.target_entity_id)! + 1);
  }
  const levels = new Map<string, number>();
  const queue = [...ids].filter((id) => pending.get(id) === 0);
  queue.forEach((id) => levels.set(id, 0));
  for (let index = 0; index < queue.length; index += 1) {
    const source = queue[index];
    for (const edge of edges) {
      if (edge.source_entity_id !== source) continue;
      const target = edge.target_entity_id;
      levels.set(
        target,
        Math.max(levels.get(target) ?? 0, levels.get(source)! + 1),
      );
      pending.set(target, pending.get(target)! - 1);
      if (pending.get(target) === 0) queue.push(target);
    }
  }
  // Cycle members keep any level reached from acyclic predecessors, otherwise 0.
  return levels;
}

function builderNodes(entities: Entity[], dependencies: Dependency[]) {
  const levels = dependencyLevels(entities, dependencies);
  const rows = new Map<number, number>();
  return entities.map((entity) => {
    const level = levels.get(entity.id) ?? 0;
    const row = rows.get(level) ?? 0;
    const { position_x: x, position_y: y } = entity.attributes;
    if (typeof x === "number" && typeof y === "number") {
      return entityNode(entity, { x, y });
    }
    rows.set(level, row + 1);
    return entityNode(entity, { x: level * 300, y: row * 150 });
  });
}

function entityNode(entity: Entity, position: { x: number; y: number }): Node {
  return {
    id: entity.id,
    position,
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    data: {
      label: (
        <>
          <strong>{entity.name}</strong>
          <small>
            {String(entity.attributes.category || entity.entity_type)} ·{" "}
            {entity.status}
          </small>
          <small>
            Criticality {String(entity.attributes.criticality ?? "—")}
          </small>
        </>
      ),
    },
    className: "system-node",
  };
}

function App() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState(
    () => sessionStorage.getItem("ripple.workspace") ?? "",
  );
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    setError("");
    void client
      .listWorkspaces()
      .then(setWorkspaces)
      .catch((error) => setError(message(error)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;
    void client
      .listWorkspaces()
      .then((items) => {
        if (active) setWorkspaces(items);
      })
      .catch((error) => {
        if (active) setError(message(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const current = workspaces.find((item) => item.id === workspace);
  function selectWorkspace(id: string) {
    sessionStorage.setItem("ripple.workspace", id);
    setWorkspace(id);
  }
  return (
    <div className="app-shell ripple-app">
      <RippleBackground />
      <header className="topbar">
        <a className="brand" href="/" aria-label="Ripple Effect home">
          <span className="brand-mark" aria-hidden="true">
            R
          </span>
          <span>Ripple Effect</span>
        </a>
        <div className="topbar-controls">
          <label className="workspace-picker">
            Workspace
            <select
              aria-label="Workspace"
              value={current?.id ?? ""}
              onChange={(event) => selectWorkspace(event.target.value)}
            >
              <option value="">Choose a workspace</option>
              {workspaces.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      {error && (
        <div className="error-banner" role="alert">
          {error}{" "}
          <button className="secondary-button" onClick={load}>
            Retry
          </button>
        </div>
      )}
      <div className="workspace-content">
        <WorkspaceView
          key={current?.id ?? ""}
          current={current}
          workspaces={workspaces}
          loading={loading}
          open={selectWorkspace}
          onSave={(item) => {
            setWorkspaces((previous) =>
              [...previous.filter(({ id }) => id !== item.id), item].sort(
                (a, b) => a.name.localeCompare(b.name),
              ),
            );
            selectWorkspace(item.id);
          }}
        />
      </div>
    </div>
  );
}

function WorkspaceView({
  current,
  workspaces,
  loading,
  open,
  onSave,
}: {
  current?: Workspace;
  workspaces: Workspace[];
  loading: boolean;
  open: (id: string) => void;
  onSave: (workspace: Workspace) => void;
}) {
  const [api] = useState(() => clientFor(current?.id));
  const [section, setSection] = useState<Section>("Dashboard");
  const [entities, setEntities] = useState<Entity[]>([]);
  const [dependencies, setDependencies] = useState<Dependency[]>([]);
  const [events, setEvents] = useState<EventRecord[]>([]);
  const [runs, setRuns] = useState<AnalysisRun[]>([]);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<Entity>();
  const [selectedEdge, setSelectedEdge] = useState<Dependency>();
  const [connection, setConnection] = useState<Connection>();
  const [addEntity, setAddEntity] = useState(false);
  const [workspaceForm, setWorkspaceForm] = useState<"create" | "edit">();
  const [selectedEvent, setSelectedEvent] = useState<EventRecord>();
  const [trigger, setTrigger] = useState<EventTrigger>();
  const [eventForm, setEventForm] = useState(false);
  const [result, setResult] = useState<{
    run: AnalysisRun;
    items: ImpactResult[];
    paths: ImpactPath[];
  }>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  function applyData(
    data: [Entity[], Dependency[], EventRecord[], AnalysisRun[]],
  ) {
    const [allEntities, allDependencies, allEvents, allRuns] = data;
    const active = allEntities.filter((item) => item.status !== "archived");
    const activeDependencies = allDependencies.filter(
      (edge) =>
        active.some((item) => item.id === edge.source_entity_id) &&
        active.some((item) => item.id === edge.target_entity_id),
    );
    setEntities(active);
    setDependencies(activeDependencies);
    setEvents(allEvents.filter((item) => item.status !== "archived"));
    setRuns(allRuns.filter((item) => !item.scenario_id));
    setNodes(builderNodes(active, activeDependencies));
  }

  useEffect(() => {
    if (!current?.id) return;
    let active = true;
    void loadData(api)
      .then((data) => {
        if (active) applyData(data);
      })
      .catch((error) => {
        if (active) setError(message(error));
      });
    return () => {
      active = false;
    };
  }, [api, current?.id]);

  async function act(action: () => Promise<void>, success = "") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    applyData(await loadData(api));
  }

  async function openRun(run: AnalysisRun) {
    setResult(undefined);
    const items = await collectPages((offset) =>
      api.listResults(run.id, offset),
    );
    const paths: ImpactPath[] = [];
    for (let start = 0; start < items.length; start += 8) {
      const batch = await Promise.all(
        items
          .slice(start, start + 8)
          .map((item) =>
            collectPages((offset) =>
              api.listPaths(run.id, item.entity_id, offset),
            ),
          ),
      );
      paths.push(...batch.flat());
    }
    setResult({ run, items, paths });
  }

  function submit(
    event: FormEvent<HTMLFormElement>,
    action: (data: FormData) => Promise<void>,
    success: string,
  ) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void act(() => action(data), success);
  }

  function saveEntity(data: FormData) {
    const fields = {
      name: text(data, "name"),
      entity_type: selectedEntity?.entity_type ?? ("system" as const),
      status:
        text(data, "status") === "inactive"
          ? ("inactive" as const)
          : ("active" as const),
      description: text(data, "description"),
      mitigation: Number(text(data, "mitigation")),
      attributes: {
        ...selectedEntity?.attributes,
        category: text(data, "category"),
        criticality: text(data, "criticality"),
        context: text(data, "context"),
      },
    };
    return (async () => {
      if (selectedEntity) {
        await api.updateEntity(selectedEntity.id, {
          ...fields,
          exposure: selectedEntity.exposure,
          expected_updated_at: selectedEntity.updated_at,
        });
      } else {
        await api.createEntity(fields);
      }
      setSelectedEntity(undefined);
      setAddEntity(false);
      await refresh();
    })();
  }

  function persistPosition(node: Node) {
    const entity = entities.find(({ id }) => id === node.id);
    if (!entity) return;
    void act(async () => {
      const updated = await api.updateEntity(entity.id, {
        name: entity.name,
        entity_type: entity.entity_type,
        description: entity.description ?? "",
        exposure: entity.exposure,
        mitigation: entity.mitigation,
        expected_updated_at: entity.updated_at,
        attributes: {
          ...entity.attributes,
          position_x: node.position.x,
          position_y: node.position.y,
        },
      });
      setEntities((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      setSelectedEntity((item) => (item?.id === updated.id ? updated : item));
    }, "Position saved.");
  }

  const nameOf = (id: string) =>
    entities.find((item) => item.id === id)?.name ?? id;
  const runTitle = (run: AnalysisRun) =>
    String(
      (run.input_snapshot?.event as { title?: string } | undefined)?.title ||
        events.find(({ id }) => id === run.event_id)?.title ||
        "Analysis run",
    );
  const activeEdges = dependencies.filter((edge) => edge.is_active);

  return (
    <>
      <nav className="expo-workflow-nav" aria-label="Primary navigation">
        {sections.map((item) => (
          <button
            key={item}
            className={
              item === section
                ? "expo-workflow-step active"
                : "expo-workflow-step"
            }
            aria-current={item === section ? "page" : undefined}
            disabled={!current && item !== "Dashboard"}
            onClick={() => {
              setSection(item);
              setResult(undefined);
              setError("");
            }}
          >
            {item}
          </button>
        ))}
      </nav>
      <main>
        <section className="intro workspace-title">
          <h1>{section}</h1>
        </section>
        {(busy || loading) && <p role="status">Working…</p>}
        {notice && (
          <p className="success-banner" role="status">
            {notice}
          </p>
        )}
        {error && (
          <p className="error-banner" role="alert">
            {error}{" "}
            {current && (
              <button
                className="secondary-button"
                onClick={() => void act(refresh)}
              >
                Refresh workspace
              </button>
            )}
          </p>
        )}

        {section === "Dashboard" && (
          <>
            <div className="toolbar">
              <button
                className="primary-button"
                onClick={() => setWorkspaceForm("create")}
              >
                Create Workspace
              </button>
              {current && (
                <>
                  <button
                    className="secondary-button"
                    onClick={() => setSection("System Builder")}
                  >
                    Open System Builder
                  </button>
                  <button
                    className="secondary-button"
                    onClick={() => setWorkspaceForm("edit")}
                  >
                    Edit workspace
                  </button>
                </>
              )}
            </div>
            {workspaceForm && (
              <form
                className="content-card panel form"
                onSubmit={(event) =>
                  submit(
                    event,
                    async (data) => {
                      const item = await api.saveWorkspace(
                        {
                          name: text(data, "name"),
                          description: text(data, "description"),
                        },
                        workspaceForm === "edit",
                      );
                      setWorkspaceForm(undefined);
                      onSave(item);
                    },
                    "Workspace saved.",
                  )
                }
              >
                <label>
                  Name
                  <input
                    name="name"
                    required
                    maxLength={160}
                    defaultValue={workspaceForm === "edit" ? current?.name : ""}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    name="description"
                    defaultValue={
                      workspaceForm === "edit"
                        ? (current?.description ?? "")
                        : ""
                    }
                  />
                </label>
                <div className="toolbar">
                  <button className="primary-button" disabled={busy}>
                    Save workspace
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => setWorkspaceForm(undefined)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            <DashboardOverview
              key={workspaces.map(({ id, name }) => id + name).join("|")}
              open={open}
            />
            {current ? (
              <section className="content-card panel">
                <h2>{current.name}</h2>
                {current.description && <p>{current.description}</p>}
                <div className="metrics">
                  <span>
                    <strong>{entities.length}</strong> Entities
                  </span>
                  <span>
                    <strong>
                      {
                        activeEdges.filter(
                          (edge) => edge.review_status !== "draft",
                        ).length
                      }
                    </strong>{" "}
                    Approved dependencies
                  </span>
                  <span>
                    <strong>{runs.length}</strong> Analyses
                  </span>
                </div>
                <h3>Recent analyses</h3>
                {runs.length ? (
                  <ul>
                    {runs.slice(0, 5).map((run) => (
                      <li key={run.id}>
                        <button
                          className="secondary-button"
                          onClick={() => {
                            setSection("History");
                            void act(() => openRun(run));
                          }}
                        >
                          {runTitle(run)}
                        </button>{" "}
                        · {statusLabel(run.status)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>No analyses yet.</p>
                )}
              </section>
            ) : (
              <section className="content-card panel">
                <h2>Your workspaces</h2>
                {workspaces.length ? (
                  <ul>
                    {workspaces.map((item) => (
                      <li key={item.id}>
                        <button
                          className="secondary-button"
                          onClick={() => open(item.id)}
                        >
                          {item.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  !loading && (
                    <p>Create a system to start mapping your dependencies.</p>
                  )
                )}
              </section>
            )}
          </>
        )}

        {section === "System Builder" && (
          <>
            <div className="toolbar">
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => {
                  setAddEntity(true);
                  setSelectedEntity(undefined);
                  setSelectedEdge(undefined);
                  setConnection(undefined);
                }}
              >
                Add Component
              </button>
              <button
                className="secondary-button"
                disabled={busy || entities.length < 2}
                onClick={() => {
                  setConnection({
                    source: "",
                    target: "",
                    sourceHandle: null,
                    targetHandle: null,
                  });
                  setSelectedEntity(undefined);
                  setAddEntity(false);
                  setSelectedEdge(undefined);
                }}
              >
                Connect Components
              </button>
              <span>
                Connect from the upstream entity to the entity that depends on
                it.
              </span>
            </div>
            <div className="builder">
              <section className="canvas" aria-label="System dependency graph">
                {nodes.length === 0 ? (
                  <p className="empty">
                    Add your first entity to start building.
                  </p>
                ) : (
                  <ReactFlow
                    key={`${nodes.length}:${activeEdges.length}`}
                    nodes={nodes}
                    edges={activeEdges.map((edge) => ({
                      id: edge.id,
                      source: edge.source_entity_id,
                      target: edge.target_entity_id,
                      markerEnd: { type: MarkerType.ArrowClosed },
                      label:
                        edge.review_status === "draft"
                          ? "Needs review"
                          : edge.weight.toFixed(2),
                      style:
                        edge.review_status === "draft"
                          ? { strokeDasharray: "5 4" }
                          : undefined,
                    }))}
                    onNodesChange={(changes: NodeChange[]) =>
                      setNodes((previous) =>
                        applyNodeChanges(changes, previous),
                      )
                    }
                    onNodeDragStop={(_, node) => persistPosition(node)}
                    onNodeClick={(_, node) => {
                      setSelectedEntity(
                        entities.find((item) => item.id === node.id),
                      );
                      setAddEntity(false);
                      setSelectedEdge(undefined);
                      setConnection(undefined);
                    }}
                    onEdgeClick={(_, edge) => {
                      setSelectedEdge(
                        dependencies.find((item) => item.id === edge.id),
                      );
                      setSelectedEntity(undefined);
                      setAddEntity(false);
                      setConnection(undefined);
                    }}
                    onConnect={(connection) => {
                      setConnection(connection);
                      setSelectedEntity(undefined);
                      setAddEntity(false);
                      setSelectedEdge(undefined);
                    }}
                    connectOnClick
                    edgesReconnectable={false}
                    deleteKeyCode={null}
                    fitView
                  >
                    <Background />
                    <Controls />
                  </ReactFlow>
                )}
              </section>
              {(addEntity || selectedEntity) && (
                <form
                  className="content-card panel form"
                  key={selectedEntity?.id ?? "new"}
                  onSubmit={(event) =>
                    submit(event, saveEntity, "Entity saved.")
                  }
                >
                  <h2>{selectedEntity ? "Edit Component" : "New component"}</h2>
                  <label>
                    Name
                    <input
                      name="name"
                      required
                      defaultValue={selectedEntity?.name}
                    />
                  </label>
                  <label>
                    Category
                    <input
                      name="category"
                      defaultValue={String(
                        selectedEntity?.attributes.category ?? "",
                      )}
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      name="description"
                      defaultValue={selectedEntity?.description ?? ""}
                    />
                  </label>
                  <label>
                    Criticality
                    <select
                      name="criticality"
                      defaultValue={String(
                        selectedEntity?.attributes.criticality ?? "Medium",
                      )}
                    >
                      <option>Low</option>
                      <option>Medium</option>
                      <option>High</option>
                      <option>Critical</option>
                    </select>
                  </label>
                  <label>
                    Status
                    <select
                      name="status"
                      defaultValue={selectedEntity?.status ?? "active"}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </label>
                  <label>
                    Context and mitigation notes
                    <textarea
                      name="context"
                      defaultValue={String(
                        selectedEntity?.attributes.context ?? "",
                      )}
                    />
                  </label>
                  <label>
                    Mitigation (0–1)
                    <input
                      type="number"
                      name="mitigation"
                      min="0"
                      max="1"
                      step="any"
                      required
                      defaultValue={selectedEntity?.mitigation ?? 0}
                    />
                  </label>
                  <button className="primary-button" disabled={busy}>
                    Save component
                  </button>
                  {selectedEntity && (
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (!window.confirm(`Archive ${selectedEntity.name}?`))
                          return;
                        void act(async () => {
                          await api.archiveEntity(
                            selectedEntity.id,
                            selectedEntity.updated_at,
                          );
                          setSelectedEntity(undefined);
                          await refresh();
                        }, "Entity archived.");
                      }}
                    >
                      Delete component
                    </button>
                  )}
                </form>
              )}
              {(selectedEdge || connection) && (
                <section
                  className="content-card panel form"
                  key={selectedEdge?.id ?? "new-connection"}
                >
                  <h2>Dependency</h2>
                  {(selectedEdge ||
                    (connection?.source && connection.target)) && (
                    <p>
                      {nameOf(
                        selectedEdge?.source_entity_id ?? connection!.source,
                      )}{" "}
                      →{" "}
                      {nameOf(
                        selectedEdge?.target_entity_id ?? connection!.target,
                      )}
                    </p>
                  )}
                  <form
                    className="form"
                    onSubmit={(event) =>
                      submit(
                        event,
                        async (data) => {
                          const fields = {
                            relationship_type: text(data, "relationship"),
                            rationale: text(data, "context"),
                          };
                          if (selectedEdge) {
                            setSelectedEdge(
                              await api.updateDependency(selectedEdge.id, {
                                ...fields,
                                expected_updated_at: selectedEdge.updated_at,
                              }),
                            );
                          } else {
                            const existing = dependencies.find(
                              (edge) =>
                                edge.source_entity_id === connection!.source &&
                                edge.target_entity_id === connection!.target,
                            );
                            if (existing) {
                              const updated = await api.updateDependency(
                                existing.id,
                                {
                                  ...fields,
                                  expected_updated_at: existing.updated_at,
                                },
                              );
                              setSelectedEdge(
                                await api.setDependencyActive(updated.id, {
                                  expected_updated_at: updated.updated_at,
                                  is_active: true,
                                }),
                              );
                            } else {
                              setSelectedEdge(
                                await api.createDependency({
                                  ...fields,
                                  source_entity_id: connection!.source,
                                  target_entity_id: connection!.target,
                                  weight: 0,
                                  review_status: "draft",
                                }),
                              );
                            }
                          }
                          setConnection(undefined);
                          await refresh();
                        },
                        "Dependency saved.",
                      )
                    }
                  >
                    {connection && !selectedEdge && (
                      <>
                        <label>
                          Source
                          <select
                            value={connection.source}
                            onChange={(event) =>
                              setConnection({
                                ...connection,
                                source: event.target.value,
                              })
                            }
                            required
                          >
                            <option value="">
                              Choose the upstream component
                            </option>
                            {entities.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Dependent
                          <select
                            value={connection.target}
                            onChange={(event) =>
                              setConnection({
                                ...connection,
                                target: event.target.value,
                              })
                            }
                            required
                          >
                            <option value="">
                              Choose the dependent component
                            </option>
                            {entities
                              .filter((item) => item.id !== connection.source)
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.name}
                                </option>
                              ))}
                          </select>
                        </label>
                      </>
                    )}
                    <label>
                      Relationship type
                      <input
                        name="relationship"
                        maxLength={60}
                        required
                        defaultValue={selectedEdge?.relationship_type}
                      />
                    </label>
                    <label>
                      Context
                      <textarea
                        name="context"
                        defaultValue={selectedEdge?.rationale ?? ""}
                      />
                    </label>
                    <button
                      className="primary-button"
                      disabled={
                        busy ||
                        (!!connection &&
                          connection.source === connection.target)
                      }
                    >
                      Save dependency
                    </button>
                  </form>
                  {selectedEdge && (
                    <DependencyAssessment
                      edge={selectedEdge}
                      busy={busy}
                      assess={() =>
                        void act(async () => {
                          setSelectedEdge(
                            await api.requestAssessment(selectedEdge.id),
                          );
                          await refresh();
                        }, "Assessment ready for review.")
                      }
                      decide={(decision, weight) =>
                        void act(async () => {
                          setSelectedEdge(
                            await api.decideAssessment(
                              selectedEdge,
                              decision,
                              weight,
                            ),
                          );
                          await refresh();
                        }, "Weight decision saved.")
                      }
                      remove={() => {
                        if (
                          !window.confirm(
                            "Remove this connection from the graph?",
                          )
                        )
                          return;
                        void act(async () => {
                          await api.setDependencyActive(selectedEdge.id, {
                            expected_updated_at: selectedEdge.updated_at,
                            is_active: false,
                          });
                          setSelectedEdge(undefined);
                          await refresh();
                        }, "Dependency removed.");
                      }}
                    />
                  )}
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      setSelectedEdge(undefined);
                      setConnection(undefined);
                    }}
                  >
                    Close dependency editor
                  </button>
                </section>
              )}
            </div>
            {entities.length > 0 && (
              <section className="content-card panel">
                <h2>Entities and connections</h2>
                <div className="toolbar">
                  {entities.map((entity) => (
                    <button
                      className="secondary-button"
                      key={entity.id}
                      onClick={() => {
                        setSelectedEntity(entity);
                        setSelectedEdge(undefined);
                        setConnection(undefined);
                        setAddEntity(false);
                      }}
                    >
                      {entity.name}
                    </button>
                  ))}
                </div>
                <ul>
                  {activeEdges.map((edge) => (
                    <li key={edge.id}>
                      <button
                        className="secondary-button"
                        onClick={() => {
                          setSelectedEdge(edge);
                          setSelectedEntity(undefined);
                          setConnection(undefined);
                          setAddEntity(false);
                        }}
                      >
                        {nameOf(edge.source_entity_id)} →{" "}
                        {nameOf(edge.target_entity_id)}
                      </button>{" "}
                      ·{" "}
                      {edge.review_status === "draft"
                        ? "Needs review"
                        : edge.weight.toFixed(2)}
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        )}

        {section === "Impact Analysis" && (
          <>
            <div className="toolbar">
              <button
                className="primary-button"
                disabled={busy || !entities.length}
                onClick={() => {
                  setSelectedEvent(undefined);
                  setTrigger(undefined);
                  setEventForm(true);
                  setResult(undefined);
                }}
              >
                Create trigger
              </button>
              <label>
                Trigger{" "}
                <select
                  value={selectedEvent?.id ?? ""}
                  disabled={busy}
                  onChange={(event) => {
                    const chosen = events.find(
                      (item) => item.id === event.target.value,
                    );
                    setSelectedEvent(chosen);
                    setTrigger(undefined);
                    setEventForm(false);
                    setResult(undefined);
                    if (chosen)
                      void act(async () =>
                        setTrigger(
                          (await api.listTriggers(chosen.id)).items[0],
                        ),
                      );
                  }}
                >
                  <option value="">Choose a trigger</option>
                  {events.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!entities.length && (
              <p>Add a starting entity in System Builder.</p>
            )}
            {eventForm && (
              <form
                className="content-card panel form"
                key={selectedEvent?.id ?? "new"}
                onSubmit={(event) =>
                  submit(
                    event,
                    async (data) => {
                      const fields = {
                        title: text(data, "title"),
                        description: text(data, "description"),
                        severity: Number(text(data, "severity")),
                        start_at:
                          selectedEvent?.start_at ?? new Date().toISOString(),
                      };
                      const saved = await api.saveTriggerEvent(
                        {
                          ...fields,
                          entity_id: text(data, "entity"),
                          context: text(data, "event_context"),
                          expected_updated_at: selectedEvent?.updated_at,
                        },
                        selectedEvent?.id,
                      );
                      setSelectedEvent(saved.event);
                      setTrigger(saved.trigger);
                      setEventForm(false);
                      await refresh();
                    },
                    "Trigger saved.",
                  )
                }
              >
                <label>
                  Name
                  <input
                    name="title"
                    required
                    defaultValue={selectedEvent?.title}
                  />
                </label>
                <label>
                  Description
                  <textarea
                    name="description"
                    defaultValue={selectedEvent?.description ?? ""}
                  />
                </label>
                <label>
                  Additional context
                  <textarea
                    name="event_context"
                    maxLength={2000}
                    defaultValue={trigger?.rationale ?? ""}
                  />
                </label>
                <label>
                  Starting entity
                  <select
                    name="entity"
                    required
                    defaultValue={trigger?.entity_id ?? ""}
                  >
                    <option value="">Choose an entity</option>
                    {entities.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Severity (0–100)
                  <input
                    type="number"
                    name="severity"
                    min="0"
                    max="100"
                    required
                    defaultValue={selectedEvent?.severity ?? 50}
                  />
                </label>
                <button className="primary-button" disabled={busy}>
                  Save trigger
                </button>
              </form>
            )}
            {selectedEvent && !eventForm && (
              <section className="content-card panel">
                <h2>{selectedEvent.title}</h2>
                <p>
                  {trigger ? nameOf(trigger.entity_id) : "No starting entity"} ·
                  Severity {selectedEvent.severity}/100
                </p>
                <div className="toolbar">
                  <button
                    className="primary-button"
                    disabled={
                      busy || !trigger || selectedEvent.status !== "open"
                    }
                    onClick={() =>
                      void act(async () => {
                        const run = await api.createAnalysisRun(
                          selectedEvent.id,
                        );
                        await openRun(run);
                        await refresh();
                      }, "Analysis recorded in History.")
                    }
                  >
                    Run analysis
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => setEventForm(true)}
                  >
                    Edit trigger
                  </button>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        !window.confirm(
                          "Archive this trigger? Its historical analyses will remain available.",
                        )
                      )
                        return;
                      void act(async () => {
                        await api.updateEventStatus(selectedEvent.id, {
                          expected_updated_at: selectedEvent.updated_at,
                          status: "archived",
                        });
                        setSelectedEvent(undefined);
                        setTrigger(undefined);
                        setResult(undefined);
                        await refresh();
                      }, "Trigger archived.");
                    }}
                  >
                    Archive trigger
                  </button>
                </div>
              </section>
            )}
          </>
        )}
        {section === "History" && (
          <section className="content-card panel">
            <h2>Previous runs</h2>
            {runs.length ? (
              <ul className="run-list">
                {runs.map((run) => (
                  <li key={run.id}>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void act(() => openRun(run))}
                    >
                      {runTitle(run)}
                    </button>
                    <span>
                      {new Date(run.created_at).toLocaleString()} ·{" "}
                      {statusLabel(run.status)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>No analyses have been run in this workspace.</p>
            )}
          </section>
        )}
        {result && (
          <AnalysisResults
            key={result.run.id}
            result={result}
            title={runTitle(result.run)}
            workspaceName={current?.name}
            api={api}
          />
        )}
      </main>
    </>
  );
}

function DashboardOverview({ open }: { open: (id: string) => void }) {
  const [summary, setSummary] = useState<WorkspaceDashboard>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void client
      .workspaceDashboard()
      .then((summary) => {
        if (active) setSummary(summary);
      })
      .catch((error) => {
        if (active) setError(message(error));
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  return (
    <section className="content-card panel" aria-label="Workspace overview">
      <h2>Workspace overview</h2>
      {error ? (
        <p className="error-banner" role="alert">
          {error}{" "}
          <button
            className="secondary-button"
            onClick={() => {
              setError("");
              setAttempt((previous) => previous + 1);
            }}
          >
            Retry overview
          </button>
        </p>
      ) : !summary ? (
        <p className="muted-copy">Loading overview…</p>
      ) : (
        <>
          <div className="metrics overview-metrics">
            <span>
              <strong>{summary.workspace_count}</strong> Workspaces
            </span>
            <span>
              <strong>{summary.entity_count}</strong> Entities
            </span>
            <span>
              <strong>{summary.approved_dependency_count}</strong> Approved
              dependencies
            </span>
            <span>
              <strong>{summary.run_count}</strong> Saved runs
            </span>
          </div>
          {summary.recent_workspaces.length > 0 && (
            <div className="workspace-grid overview-activity">
              <div>
                <h3>Recently modified workspaces</h3>
                <ul className="run-list">
                  {summary.recent_workspaces.map((item) => (
                    <li key={item.id}>
                      <button
                        className="secondary-button"
                        onClick={() => open(item.id)}
                      >
                        {item.name}
                      </button>
                      <span>
                        {new Date(item.last_modified_at).toLocaleString()}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Recent analysis activity</h3>
                {summary.recent_runs.length ? (
                  <ul className="run-list">
                    {summary.recent_runs.map((run) => (
                      <li key={run.id}>
                        <strong>{run.event_title}</strong>
                        <span>
                          {run.workspace_name} · {statusLabel(run.status)} ·{" "}
                          {new Date(run.created_at).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted-copy">Saved runs will appear here.</p>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

async function loadData(
  api: ApiClient,
): Promise<[Entity[], Dependency[], EventRecord[], AnalysisRun[]]> {
  const [entities, dependencies, events, runs] = await Promise.all([
    collectPages((offset) => api.listEntities(offset)),
    collectPages((offset) => api.listDependencies(offset)),
    collectPages((offset) => api.listEvents(offset)),
    collectPages((offset) => api.listRuns(undefined, offset)),
  ]);
  return [entities, dependencies, events, runs];
}

function DependencyAssessment({
  edge,
  busy,
  assess,
  decide,
  remove,
}: {
  edge: Dependency;
  busy: boolean;
  assess: () => void;
  decide: (
    decision: "approve" | "reject" | "override",
    weight?: number,
  ) => void;
  remove: () => void;
}) {
  const assessment = edge.assessment;
  return (
    <>
      <h3>Weight assessment</h3>
      <p>
        {edge.review_status === "draft"
          ? "No approved weight"
          : `Effective weight ${edge.weight.toFixed(2)}`}
      </p>
      <button className="secondary-button" disabled={busy} onClick={assess}>
        {assessment?.model ? "Reassess with AI" : "Request AI assessment"}
      </button>
      {assessment?.model && (
        <div className="assessment">
          <p>
            <strong>{assessment.recommended_weight?.toFixed(2)}</strong>{" "}
            recommended · {assessment.confidence} confidence ·{" "}
            {assessment.decision}
          </p>
          <p>{assessment.reasoning}</p>
          <p>Uncertainty · {assessment.uncertainty}</p>
          {!!assessment.assumptions?.length && (
            <p>Assumptions · {assessment.assumptions.join("; ")}</p>
          )}
          {!!assessment.missing_information?.length && (
            <p>
              Missing information · {assessment.missing_information.join("; ")}
            </p>
          )}
          <small>
            {assessment.model} ·{" "}
            {assessment.assessed_at &&
              new Date(assessment.assessed_at).toLocaleString()}
          </small>
          {assessment.decision === "pending" && (
            <div className="toolbar">
              <button
                className="primary-button"
                disabled={busy}
                onClick={() => decide("approve")}
              >
                Approve weight
              </button>
              <button
                className="secondary-button"
                disabled={busy}
                onClick={() => decide("reject")}
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}
      <form
        className="form"
        onSubmit={(event) => {
          event.preventDefault();
          decide(
            "override",
            Number(text(new FormData(event.currentTarget), "weight")),
          );
        }}
      >
        <label>
          Manual weight (0–1)
          <input
            name="weight"
            type="number"
            min="0"
            max="1"
            step="any"
            required
          />
        </label>
        <button className="secondary-button" disabled={busy}>
          Apply manual weight
        </button>
      </form>
      <button className="secondary-button" disabled={busy} onClick={remove}>
        Remove connection
      </button>
    </>
  );
}

function AnalysisResults({
  result,
  title,
  workspaceName,
  api,
}: {
  result: { run: AnalysisRun; items: ImpactResult[]; paths: ImpactPath[] };
  title: string;
  workspaceName?: string;
  api: ApiClient;
}) {
  const { run, items, paths } = result;
  const [selectedEntity, setSelectedEntity] = useState<string>();
  const [expandedEntities, setExpandedEntities] = useState<string[]>([]);
  const event = run.input_snapshot?.event as { severity?: number } | undefined;
  const triggers = run.input_snapshot?.triggers as
    { entity_id: string; rationale?: string }[] | undefined;
  const affected = items.filter((item) => item.depth > 0 && item.score > 0);
  const startingEntities = items.filter((item) => item.depth === 0);
  const edges = new Map<string, Edge>();
  const rows = new Map<number, number>();
  const analysisNodes: Node[] = [...items]
    .sort(
      (left, right) =>
        left.depth - right.depth ||
        left.entity_id.localeCompare(right.entity_id),
    )
    .map((item) => {
      const row = rows.get(item.depth) ?? 0;
      rows.set(item.depth, row + 1);
      const role =
        item.depth === 0
          ? "Starting entity"
          : item.score === 0
            ? "No propagated impact"
            : item.depth === 1
              ? "Direct impact"
              : "Indirect impact";
      const roleClass =
        item.depth === 0 ? "trigger" : item.depth === 1 ? "direct" : "indirect";
      return {
        id: item.entity_id,
        position: { x: item.depth * 360, y: row * 150 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        ariaLabel: `${item.entity_name}, ${role}, estimated impact ${item.score.toFixed(1)} out of 100`,
        data: {
          label: (
            <>
              <strong title={item.entity_name}>{item.entity_name}</strong>
              <small>{role}</small>
              <small>
                {item.score.toFixed(1)} / 100 · {item.impact_level}
              </small>
            </>
          ),
        },
        className: `analysis-node impact-${item.impact_level} propagation-${roleClass}${selectedEntity === item.entity_id ? " analysis-node-selected" : ""}`,
      };
    });
  for (const path of paths) {
    const steps = path.provenance.steps;
    steps.slice(1).forEach((step, index) => {
      const source = steps[index].entity_id;
      const id = step.dependency_id ?? `${source}:${step.entity_id}`;
      const relationship =
        step.relationship_label ?? step.relationship_type ?? "Dependency";
      const shortLabel =
        relationship.length > 18
          ? `${relationship.slice(0, 17)}...`
          : relationship;
      edges.set(id, {
        id,
        source,
        target: step.entity_id,
        label: `${shortLabel} · ${step.weight?.toFixed(2) ?? "-"}`,
        ariaLabel: `${steps[index].entity_name} to ${step.entity_name}, ${relationship}, weight ${step.weight ?? "unknown"}, ${step.review_status ?? "unknown review"}`,
        labelStyle: { fontSize: 11 },
        markerEnd: { type: MarkerType.ArrowClosed },
      });
    });
  }
  return (
    <section className="content-card panel">
      <h2>{title}</h2>
      <p>
        {statusLabel(run.status)} · {new Date(run.created_at).toLocaleString()}{" "}
        {workspaceName && ` · ${workspaceName}`}
      </p>
      {event?.severity !== undefined && (
        <p>
          Trigger severity {event.severity}/100
          {startingEntities.length > 0 &&
            ` · Starting entity: ${startingEntities.map((item) => item.entity_name).join(", ")}`}
        </p>
      )}
      {triggers?.map(
        (trigger) =>
          trigger.rationale && (
            <p key={trigger.entity_id}>{trigger.rationale}</p>
          ),
      )}
      <div className="metrics overview-metrics">
        <span>
          <strong>{affected.filter((item) => item.depth === 1).length}</strong>{" "}
          Directly affected
        </span>
        <span>
          <strong>{affected.filter((item) => item.depth > 1).length}</strong>{" "}
          Indirectly affected
        </span>
        <span>
          <strong>
            {Math.max(0, ...affected.map((item) => item.score)).toFixed(1)}
          </strong>{" "}
          Peak downstream impact
        </span>
      </div>
      <p>
        Scores are heuristic estimates. Dependency review confidence is
        qualitative.
      </p>
      {run.status === "completed_with_limits" && (
        <p role="status">
          The traversal reached a configured limit. Some paths may be omitted.
        </p>
      )}
      {run.status === "failed" && (
        <p className="error-banner" role="alert">
          This run failed before producing results. Its status is recorded in
          History.
        </p>
      )}
      {items.length > 0 && (
        <>
          <ul className="analysis-role-legend" aria-label="Propagation roles">
            <li className="role-legend-trigger">Starting entity</li>
            <li className="role-legend-direct">Direct impact</li>
            <li className="role-legend-indirect">Indirect impact</li>
          </ul>
          <AnalysisGraph
            nodes={analysisNodes}
            edges={[...edges.values()]}
            select={(entityId) => {
              setSelectedEntity(entityId);
              setExpandedEntities((previous) =>
                previous.includes(entityId)
                  ? previous
                  : [...previous, entityId],
              );
            }}
          />
        </>
      )}
      {items.map((item) => (
        <ResultDetails
          key={item.id}
          item={item}
          paths={paths}
          api={api}
          runId={run.id}
          expanded={expandedEntities.includes(item.entity_id)}
          selected={selectedEntity === item.entity_id}
          toggle={(open) =>
            setExpandedEntities((previous) =>
              open === previous.includes(item.entity_id)
                ? previous
                : open
                  ? [...previous, item.entity_id]
                  : previous.filter((id) => id !== item.entity_id),
            )
          }
        />
      ))}
      {run.input_snapshot && (
        <details>
          <summary>Original analysis inputs</summary>
          <pre>{JSON.stringify(run.input_snapshot, null, 2)}</pre>
        </details>
      )}
    </section>
  );
}

function AnalysisGraph({
  nodes,
  edges,
  select,
}: {
  nodes: Node[];
  edges: Edge[];
  select: (entityId: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const compact = width > 0 && width < 600;
  useEffect(() => {
    if (!container.current) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="result-canvas" ref={container}>
      <ReactFlow
        fitView
        minZoom={0.1}
        fitViewOptions={ANALYSIS_FIT}
        nodes={
          compact
            ? nodes.map((node) => ({
                ...node,
                position: {
                  x: (node.position.y / 150) * 250,
                  y: (node.position.x / 360) * 160,
                },
                sourcePosition: Position.Bottom,
                targetPosition: Position.Top,
              }))
            : nodes
        }
        edges={edges}
        onNodeClick={(_, node) => select(node.id)}
        nodesDraggable={false}
        nodesConnectable={false}
        edgesReconnectable={false}
        deleteKeyCode={null}
      >
        <FitWhenMeasured layout={`${compact}:${width}`} />
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}

const ANALYSIS_FIT = { padding: 0.15, minZoom: 0.1, maxZoom: 1.3 };

function FitWhenMeasured({ layout }: { layout: string }) {
  const measured = useNodesInitialized();
  const { fitView } = useReactFlow();
  useEffect(() => {
    if (!measured) return;
    const frame = requestAnimationFrame(() => void fitView(ANALYSIS_FIT));
    return () => cancelAnimationFrame(frame);
  }, [measured, layout, fitView]);
  return null;
}

function ResultDetails({
  item,
  paths,
  api,
  runId,
  expanded,
  selected,
  toggle,
}: {
  item: ImpactResult;
  paths: ImpactPath[];
  api: ApiClient;
  runId: string;
  expanded: boolean;
  selected: boolean;
  toggle: (open: boolean) => void;
}) {
  return (
    <details
      open={expanded}
      data-selected={selected}
      onToggle={(event) => toggle(event.currentTarget.open)}
    >
      <summary>
        {item.entity_name} · {item.score.toFixed(1)} · {item.impact_level} ·{" "}
        {item.depth === 0
          ? "Starting entity"
          : item.depth === 1
            ? "Direct impact"
            : "Indirect impact"}
      </summary>
      <p>{item.explanation}</p>
      <p>
        Review confidence: {item.confidence_label}. {item.confidence_reason}
      </p>
      <ul>
        {paths
          .filter((path) => path.entity_id === item.entity_id)
          .map((path) => (
            <li key={path.id}>
              {path.provenance.entity_names.join(" → ")}{" "}
              {path.provenance.weights.length > 0 && (
                <span>· Weights {path.provenance.weights.join(", ")}</span>
              )}
            </li>
          ))}
      </ul>
      {expanded && (
        <ResultCommentary api={api} runId={runId} entityId={item.entity_id} />
      )}
    </details>
  );
}

function ResultCommentary({
  api,
  runId,
  entityId,
}: {
  api: ApiClient;
  runId: string;
  entityId: string;
}) {
  const [answer, setAnswer] = useState<AIExplanation | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    void api
      .getSavedExplanation(runId, entityId)
      .then((saved) => {
        if (active) setAnswer(saved);
      })
      .catch((error) => {
        if (active) setError(message(error));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api, runId, entityId, attempt]);

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      setAnswer(await api.explainAnalysis(runId, entityId));
    } catch (error) {
      setError(message(error));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="result-commentary">
      <h3>AI commentary</h3>
      <p className="muted-copy">Human review required</p>
      {loading && <p role="status">Loading saved commentary...</p>}
      {generating && <p role="status">Generating commentary...</p>}
      {!loading && !answer && !error && <p>No saved AI commentary.</p>}
      {answer && (
        <div className="explanation">
          <small>{answer.model}</small>
          <p>{answer.explanation}</p>
        </div>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
      <div className="toolbar">
        <button
          className="secondary-button"
          disabled={loading || generating}
          onClick={() => void generate()}
        >
          {answer ? "Regenerate commentary" : "Explain with AI"}
        </button>
        {error && (
          <button
            className="secondary-button"
            disabled={loading || generating}
            onClick={() => {
              setLoading(true);
              setError("");
              setAttempt((previous) => previous + 1);
            }}
          >
            Retry saved commentary
          </button>
        )}
      </div>
    </div>
  );
}

export default App;
