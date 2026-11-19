from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ai_service import (
    OllamaResponseError,
    OllamaUnavailableError,
    ai_http_error,
    assess_with_ollama,
    explain_with_ollama,
)
from app.analysis_service import (
    create_analysis_run_for_member,
    get_analysis_explanation_for_member,
    get_analysis_run_for_member,
    get_impact_result_for_member,
    page_analysis_runs_for_member,
    page_impact_paths_for_member,
    page_impact_results_for_member,
    save_analysis_explanation_for_member,
)
from app.auth import Permission, authorize, get_active_membership, parse_local_user_id
from app.database import get_session
from app.models import (
    AuditLog,
    Dependency,
    Entity,
    EventTrigger,
    ImpactResult,
    ImpactRun,
    OperationalEvent,
    Organization,
    OrganizationMember,
    User,
)
from app.scenario_service import (
    archive_scenario_for_member,
    compare_scenario_runs_for_member,
    create_intervention_for_member,
    create_scenario_analysis_run_for_member,
    create_scenario_for_member,
    get_scenario_detail_for_member,
    page_scenarios_for_member,
    update_scenario_event_for_member,
    update_scenario_for_member,
)
from app.schemas import (
    AIExplanationRequest,
    AIExplanationResponse,
    AnalysisRunCreate,
    AnalysisRunResponse,
    AssessmentDecision,
    DependencyActivation,
    DependencyCreate,
    DependencyResponse,
    DependencyUpdate,
    EntityCreate,
    EntityResponse,
    EntityStatus,
    EntityType,
    EntityUpdate,
    ErrorEnvelope,
    EventCreate,
    EventResponse,
    EventStatus,
    EventStatusUpdate,
    EventTriggerCreate,
    EventTriggerResponse,
    EventUpdate,
    ImpactPathResponse,
    ImpactResultResponse,
    PageResponse,
    ReviewStatus,
    ScenarioAnalysisRunCreate,
    ScenarioComparisonResponse,
    ScenarioCreate,
    ScenarioDetailResponse,
    ScenarioEventUpdate,
    ScenarioInterventionCreate,
    ScenarioInterventionResponse,
    ScenarioResponse,
    ScenarioUpdate,
    TriggerEventInput,
    TriggerEventResponse,
    UTCDateTime,
    WorkspaceDashboard,
    WorkspaceInput,
    WorkspaceResponse,
)
from app.services import (
    _check_updated_at,
    _record_change,
    archive_entity,
    build_dependency_assessment_context,
    create_dependency,
    create_entity,
    create_event,
    create_event_trigger,
    delete_event_trigger,
    get_dependency_for_member,
    get_entity_for_member,
    get_event_for_member,
    page_dependencies_for_member,
    page_entities_for_member,
    page_event_triggers_for_member,
    page_events_for_member,
    set_dependency_active,
    transition_event_status,
    update_dependency,
    update_entity,
    update_event,
)

API_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    code: {"model": ErrorEnvelope, "description": description}
    for code, description in (
        (400, "Invalid request"),
        (401, "Authentication required"),
        (403, "Permission denied"),
        (404, "Resource not found"),
        (409, "State conflict"),
        (422, "Request validation failed"),
        (500, "Internal server error"),
    )
}
router = APIRouter(prefix="/api/v1", responses=API_ERROR_RESPONSES)
SessionDependency = Annotated[Session, Depends(get_session)]
MembershipDependency = Annotated[OrganizationMember, Depends(get_active_membership)]
PageLimit = Annotated[int, Query(ge=1, le=100)]
PageOffset = Annotated[int, Query(ge=0)]


def _request_id(request: Request) -> str:
    return request.state.request_id


def _commit(session: Session) -> None:
    try:
        session.commit()
    except IntegrityError as error:
        session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The requested change conflicts with existing data.",
        ) from error


def _page(items: Sequence[object], total: int, limit: int, offset: int) -> dict[str, object]:
    return {"items": items, "limit": limit, "offset": offset, "total": total}


@router.get(
    "/entities",
    response_model=PageResponse[EntityResponse],
    tags=["entities"],
    summary="List organization entities",
    description="Requires entity:read permission. Results use stable name/UUID ordering.",
)
def list_entities_endpoint(
    membership: MembershipDependency,
    session: SessionDependency,
    limit: PageLimit = 50,
    offset: PageOffset = 0,
    entity_type: EntityType | None = None,
    status_filter: Annotated[EntityStatus | None, Query(alias="status")] = None,
    name: Annotated[str | None, Query(min_length=1, max_length=160)] = None,
) -> dict[str, object]:
    items, total = page_entities_for_member(
        session,
        membership,
        limit=limit,
        offset=offset,
        entity_type=entity_type,
        entity_status=status_filter,
        name=name,
    )
    return _page(items, total, limit, offset)


@router.post(
    "/entities",
    response_model=EntityResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["entities"],
    summary="Create an entity",
    description="Requires entity:write permission. The operation and audit record commit together.",
)
def create_entity_endpoint(
    payload: EntityCreate,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> EntityResponse:
    entity = create_entity(
        session,
        membership,
        name=payload.name,
        entity_type=payload.entity_type,
        description=payload.description,
        exposure=payload.exposure,
        mitigation=payload.mitigation,
        attributes=payload.attributes,
        entity_status=payload.status,
        request_id=_request_id(request),
    )
    _commit(session)
    return EntityResponse.model_validate(entity)


@router.get(
    "/entities/{entity_id}",
    response_model=EntityResponse,
    tags=["entities"],
    summary="Retrieve an entity",
    description="Requires entity:read permission. Cross-organization resources return 404.",
)
def get_entity_endpoint(
    entity_id: UUID,
    membership: MembershipDependency,
    session: SessionDependency,
) -> EntityResponse:
    return EntityResponse.model_validate(get_entity_for_member(session, membership, entity_id))


@router.patch(
    "/entities/{entity_id}",
    response_model=EntityResponse,
    tags=["entities"],
    summary="Update an entity",
    description="Requires entity:write permission. Omitted fields remain unchanged.",
)
def update_entity_endpoint(
    entity_id: UUID,
    payload: EntityUpdate,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> EntityResponse:
    changes = payload.model_dump(exclude_unset=True)
    expected_updated_at = changes.pop("expected_updated_at")
    entity = update_entity(
        session,
        membership,
        entity_id,
        expected_updated_at=expected_updated_at,
        entity_status=changes.pop("status", None),
        **changes,
        request_id=_request_id(request),
    )
    _commit(session)
    return EntityResponse.model_validate(entity)


@router.delete(
    "/entities/{entity_id}",
    response_model=EntityResponse,
    tags=["entities"],
    summary="Archive an entity",
    description="Requires entity:write permission. This is a soft archive, not a physical delete.",
)
def archive_entity_endpoint(
    entity_id: UUID,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
    expected_updated_at: UTCDateTime,
) -> EntityResponse:
    entity = archive_entity(
        session,
        membership,
        entity_id,
        expected_updated_at=expected_updated_at,
        request_id=_request_id(request),
    )
    _commit(session)
    return EntityResponse.model_validate(entity)


@router.get(
    "/dependencies",
    response_model=PageResponse[DependencyResponse],
    tags=["dependencies"],
    summary="List organization dependencies",
    description=(
        "Requires dependency:read permission. Results use stable source/target/UUID ordering."
    ),
)
def list_dependencies_endpoint(
    membership: MembershipDependency,
    session: SessionDependency,
    limit: PageLimit = 50,
    offset: PageOffset = 0,
    source_entity_id: UUID | None = None,
    target_entity_id: UUID | None = None,
    is_active: bool | None = None,
    review_status: ReviewStatus | None = None,
) -> dict[str, object]:
    items, total = page_dependencies_for_member(
        session,
        membership,
        limit=limit,
        offset=offset,
        source_entity_id=source_entity_id,
        target_entity_id=target_entity_id,
        is_active=is_active,
        review_status=review_status,
    )
    return _page(items, total, limit, offset)


@router.post(
    "/dependencies",
    response_model=DependencyResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["dependencies"],
    summary="Create a dependency",
    description=(
        "Requires dependency:write permission. Source and target must be "
        "distinct same-organization entities."
    ),
)
def create_dependency_endpoint(
    payload: DependencyCreate,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> DependencyResponse:
    dependency = create_dependency(
        session,
        membership,
        **payload.model_dump(),
        request_id=_request_id(request),
    )
    _commit(session)
    return DependencyResponse.model_validate(dependency)


@router.get(
    "/dependencies/{dependency_id}",
    response_model=DependencyResponse,
    tags=["dependencies"],
    summary="Retrieve a dependency",
    description="Requires dependency:read permission. Cross-organization resources return 404.",
)
def get_dependency_endpoint(
    dependency_id: UUID,
    membership: MembershipDependency,
    session: SessionDependency,
) -> DependencyResponse:
    return DependencyResponse.model_validate(
        get_dependency_for_member(session, membership, dependency_id)
    )


@router.patch(
    "/dependencies/{dependency_id}",
    response_model=DependencyResponse,
    tags=["dependencies"],
    summary="Update a dependency",
    description="Requires dependency:write permission. Updates retain source-to-target direction.",
)
def update_dependency_endpoint(
    dependency_id: UUID,
    payload: DependencyUpdate,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> DependencyResponse:
    changes = payload.model_dump(exclude_unset=True)
    expected_updated_at = changes.pop("expected_updated_at")
    dependency = update_dependency(
        session,
        membership,
        dependency_id,
        expected_updated_at=expected_updated_at,
        **changes,
        request_id=_request_id(request),
    )
    _commit(session)
    return DependencyResponse.model_validate(dependency)


@router.patch(
    "/dependencies/{dependency_id}/activation",
    response_model=DependencyResponse,
    tags=["dependencies"],
    summary="Activate or deactivate a dependency",
    description="Requires dependency:write permission. Repeated activation changes are idempotent.",
)
def set_dependency_active_endpoint(
    dependency_id: UUID,
    payload: DependencyActivation,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> DependencyResponse:
    dependency = set_dependency_active(
        session,
        membership,
        dependency_id,
        payload.is_active,
        expected_updated_at=payload.expected_updated_at,
        request_id=_request_id(request),
    )
    _commit(session)
    return DependencyResponse.model_validate(dependency)


@router.get(
    "/events",
    response_model=PageResponse[EventResponse],
    tags=["events"],
    summary="List organization events",
    description="Requires event:read permission. Results use stable start-time/UUID ordering.",
)
def list_events_endpoint(
    membership: MembershipDependency,
    session: SessionDependency,
    limit: PageLimit = 50,
    offset: PageOffset = 0,
    status_filter: Annotated[EventStatus | None, Query(alias="status")] = None,
    title: Annotated[str | None, Query(min_length=1, max_length=200)] = None,
    start_from: datetime | None = None,
    start_to: datetime | None = None,
) -> dict[str, object]:
    if start_from is not None and (start_from.tzinfo is None or start_from.utcoffset() is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_from must include a timezone.",
        )
    if start_to is not None and (start_to.tzinfo is None or start_to.utcoffset() is None):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_to must include a timezone.",
        )
    if start_from is not None and start_to is not None and start_to < start_from:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="start_to must not be earlier than start_from.",
        )
    items, total = page_events_for_member(
        session,
        membership,
        limit=limit,
        offset=offset,
        event_status=status_filter,
        title=title,
        start_from=start_from,
        start_to=start_to,
    )
    return _page(items, total, limit, offset)


@router.post(
    "/events",
    response_model=EventResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["events"],
    summary="Create an event",
    description="Requires event:write permission. New events may be draft or open.",
)
def create_event_endpoint(
    payload: EventCreate,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> EventResponse:
    event = create_event(
        session,
        membership,
        title=payload.title,
        description=payload.description,
        severity=payload.severity,
        start_at=payload.start_at,
        duration_minutes=payload.duration_minutes,
        initial_status=payload.status,
        request_id=_request_id(request),
    )
    _commit(session)
    return EventResponse.model_validate(event)


@router.get(
    "/events/{event_id}",
    response_model=EventResponse,
    tags=["events"],
    summary="Retrieve an event",
    description="Requires event:read permission. Cross-organization resources return 404.",
)
def get_event_endpoint(
    event_id: UUID,
    membership: MembershipDependency,
    session: SessionDependency,
) -> EventResponse:
    return EventResponse.model_validate(get_event_for_member(session, membership, event_id))


@router.patch(
    "/events/{event_id}",
    response_model=EventResponse,
    tags=["events"],
    summary="Update an event",
    description=(
        "Requires event:write permission. Change lifecycle state through the status operation."
    ),
)
def update_event_endpoint(
    event_id: UUID,
    payload: EventUpdate,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> EventResponse:
    changes = payload.model_dump(exclude_unset=True)
    expected_updated_at = changes.pop("expected_updated_at")
    event = update_event(
        session,
        membership,
        event_id,
        expected_updated_at=expected_updated_at,
        **changes,
        request_id=_request_id(request),
    )
    _commit(session)
    return EventResponse.model_validate(event)


@router.patch(
    "/events/{event_id}/status",
    response_model=EventResponse,
    tags=["events"],
    summary="Resolve, reopen or archive an event",
    description=(
        "Requires event:write permission. Only administrators may reopen "
        "resolved or archived events."
    ),
)
def update_event_status_endpoint(
    event_id: UUID,
    payload: EventStatusUpdate,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> EventResponse:
    event = transition_event_status(
        session,
        membership,
        event_id,
        payload.status,
        expected_updated_at=payload.expected_updated_at,
        request_id=_request_id(request),
    )
    _commit(session)
    return EventResponse.model_validate(event)


@router.get(
    "/events/{event_id}/triggers",
    response_model=PageResponse[EventTriggerResponse],
    tags=["event triggers"],
    summary="List an event's trigger associations",
    description="Requires event:read permission. Results use stable entity/UUID ordering.",
)
def list_event_triggers_endpoint(
    event_id: UUID,
    membership: MembershipDependency,
    session: SessionDependency,
    limit: PageLimit = 50,
    offset: PageOffset = 0,
) -> dict[str, object]:
    items, total = page_event_triggers_for_member(
        session,
        membership,
        event_id,
        limit=limit,
        offset=offset,
    )
    return _page(items, total, limit, offset)


@router.post(
    "/events/{event_id}/triggers",
    response_model=EventTriggerResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["event triggers"],
    summary="Add an event trigger",
    description=(
        "Requires event:write permission. Event and entity must belong to the active organization."
    ),
)
def create_event_trigger_endpoint(
    event_id: UUID,
    payload: EventTriggerCreate,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> EventTriggerResponse:
    trigger = create_event_trigger(
        session,
        membership,
        event_id,
        entity_id=payload.entity_id,
        exposure=payload.exposure,
        rationale=payload.rationale,
        request_id=_request_id(request),
    )
    _commit(session)
    return EventTriggerResponse.model_validate(trigger)


@router.delete(
    "/events/{event_id}/triggers/{trigger_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    tags=["event triggers"],
    summary="Remove an event trigger",
    description="Requires event:write permission. The removal is audit logged.",
)
def delete_event_trigger_endpoint(
    event_id: UUID,
    trigger_id: UUID,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> Response:
    delete_event_trigger(
        session,
        membership,
        event_id,
        trigger_id,
        request_id=_request_id(request),
    )
    _commit(session)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _impact_result_response(result: ImpactResult) -> ImpactResultResponse:
    flags = result.result_flags
    trigger_ids = flags.get("trigger_entity_ids")
    if not isinstance(trigger_ids, list) or not all(isinstance(item, str) for item in trigger_ids):
        raise RuntimeError("Persisted impact result has invalid trigger provenance.")
    return ImpactResultResponse.model_validate(
        {
            "id": result.id,
            "run_id": result.run_id,
            "entity_id": result.entity_id,
            "entity_name": flags.get("entity_name"),
            "entity_type": flags.get("entity_type"),
            "depth": result.depth,
            "score": result.score,
            "impact_level": flags.get("impact_level"),
            "confidence_value": result.confidence_value,
            "confidence_label": result.confidence_label,
            "confidence_reason": flags.get("confidence_reason"),
            "primary_path_id": result.primary_path_id,
            "trigger_entity_ids": trigger_ids,
            "explanation": result.explanation,
            "result_flags": flags,
        }
    )


@router.post(
    "/events/{event_id}/analysis-runs",
    response_model=AnalysisRunResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["analysis"],
    summary="Run an analysis for an open event",
    description=(
        "Requires analysis:run permission. Creates an immutable input snapshot, "
        "persists deterministic results and audit data, and reports safety limits."
    ),
)
def create_analysis_run_endpoint(
    event_id: UUID,
    payload: AnalysisRunCreate,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> AnalysisRunResponse:
    run = create_analysis_run_for_member(
        session,
        membership,
        event_id,
        payload,
        request_id=_request_id(request),
    )
    _commit(session)
    if run.status == "failed":
        diagnostic_id = run.summary.get("diagnostic_id", "unavailable")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis failed. Diagnostic ID: {diagnostic_id}",
        )
    return AnalysisRunResponse.model_validate(run)


@router.get(
    "/analysis-runs",
    response_model=PageResponse[AnalysisRunResponse],
    tags=["analysis"],
    summary="List analysis runs",
    description="Requires event:read permission. Results use stable creation-time/UUID ordering.",
)
def list_analysis_runs_endpoint(
    membership: MembershipDependency,
    session: SessionDependency,
    limit: PageLimit = 50,
    offset: PageOffset = 0,
    event_id: UUID | None = None,
    scenario_id: UUID | None = None,
) -> dict[str, object]:
    items, total = page_analysis_runs_for_member(
        session,
        membership,
        limit=limit,
        offset=offset,
        event_id=event_id,
        scenario_id=scenario_id,
    )
    return _page(items, total, limit, offset)


@router.get(
    "/analysis-runs/{run_id}",
    response_model=AnalysisRunResponse,
    tags=["analysis"],
    summary="Retrieve an analysis run",
    description="Requires event:read permission; cross-organization runs return 404.",
)
def get_analysis_run_endpoint(
    run_id: UUID,
    membership: MembershipDependency,
    session: SessionDependency,
) -> AnalysisRunResponse:
    return AnalysisRunResponse.model_validate(
        get_analysis_run_for_member(session, membership, run_id)
    )


@router.post(
    "/analysis-runs/{run_id}/ai-explanation",
    response_model=AIExplanationResponse,
    tags=["analysis"],
    summary="Explain a persisted analysis using local Ollama",
    description=(
        "Requires event:read permission. Sends bounded persisted result and path "
        "context to local Ollama and saves the commentary with an audit record. "
        "It does not change calculation inputs or scores."
    ),
)
async def explain_analysis_endpoint(
    run_id: UUID,
    payload: AIExplanationRequest,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> AIExplanationResponse:
    run = get_analysis_run_for_member(session, membership, run_id)
    event = get_event_for_member(session, membership, run.event_id)
    result = get_impact_result_for_member(
        session,
        membership,
        run_id,
        payload.entity_id,
    )
    paths, _ = page_impact_paths_for_member(
        session,
        membership,
        run_id,
        payload.entity_id,
        limit=10,
        offset=0,
    )
    selected_response = _impact_result_response(result)
    snapshot = run.input_snapshot or {}
    entity_names = {item["id"]: item["name"] for item in snapshot.get("entities", [])}
    context: dict[str, object] = {
        "event": snapshot.get("event")
        or {
            "title": event.title,
            "severity": event.severity,
            "status": event.status,
        },
        "triggers": snapshot.get("triggers", []),
        "trigger_entities": [
            {
                "id": item["entity_id"],
                "name": entity_names.get(item["entity_id"], "Unknown saved name"),
            }
            for item in snapshot.get("triggers", [])
        ],
        "selected_entity": {
            "name": selected_response.entity_name,
            "type": selected_response.entity_type,
            "depth": selected_response.depth,
            "score": selected_response.score,
            "impact_band": selected_response.impact_level,
            "confidence": selected_response.confidence_label,
            "confidence_reason": selected_response.confidence_reason,
        },
        "retained_paths": [
            {
                "score": path.score,
                "edge_count": path.edge_count,
                "is_primary": path.is_primary,
                "entities": path.provenance.get("entity_names", []),
                "relationships": path.provenance.get("dependency_labels", []),
                "weights": path.provenance.get("weights", []),
                "review_statuses": path.provenance.get("review_statuses", []),
            }
            for path in paths
        ],
    }
    session.rollback()
    try:
        explanation, model = await explain_with_ollama(context)
    except (OllamaResponseError, OllamaUnavailableError) as error:
        raise ai_http_error(error) from error
    save_analysis_explanation_for_member(
        session,
        membership,
        run_id,
        payload.entity_id,
        model=model,
        explanation=explanation,
        context=context,
        request_id=_request_id(request),
    )
    _commit(session)
    return AIExplanationResponse(model=model, explanation=explanation)


@router.get(
    "/analysis-runs/{run_id}/ai-explanation",
    response_model=AIExplanationResponse,
    tags=["analysis"],
    summary="Retrieve the latest saved AI commentary without calling Ollama",
)
def get_analysis_explanation_endpoint(
    run_id: UUID,
    entity_id: UUID,
    membership: MembershipDependency,
    session: SessionDependency,
) -> AIExplanationResponse:
    record = get_analysis_explanation_for_member(session, membership, run_id, entity_id)
    return AIExplanationResponse(model=record.model, explanation=record.explanation)


@router.get(
    "/analysis-runs/{run_id}/results",
    response_model=PageResponse[ImpactResultResponse],
    tags=["analysis"],
    summary="List impact results",
    description="Requires event:read permission. Results are ordered by score, depth and UUID.",
)
def list_impact_results_endpoint(
    run_id: UUID,
    membership: MembershipDependency,
    session: SessionDependency,
    limit: PageLimit = 50,
    offset: PageOffset = 0,
) -> dict[str, object]:
    items, total = page_impact_results_for_member(
        session,
        membership,
        run_id,
        limit=limit,
        offset=offset,
    )
    return _page([_impact_result_response(item) for item in items], total, limit, offset)


@router.get(
    "/analysis-runs/{run_id}/results/{entity_id}",
    response_model=ImpactResultResponse,
    tags=["analysis"],
    summary="Retrieve an impact result",
    description="Returns the immutable entity snapshot and the primary-path explanation.",
)
def get_impact_result_endpoint(
    run_id: UUID,
    entity_id: UUID,
    membership: MembershipDependency,
    session: SessionDependency,
) -> ImpactResultResponse:
    return _impact_result_response(
        get_impact_result_for_member(session, membership, run_id, entity_id)
    )


@router.get(
    "/analysis-runs/{run_id}/results/{entity_id}/paths",
    response_model=PageResponse[ImpactPathResponse],
    tags=["analysis"],
    summary="List retained paths for an impact result",
    description=(
        "Returns primary and retained contributing/alternative paths with immutable "
        "entity and dependency provenance."
    ),
)
def list_impact_paths_endpoint(
    run_id: UUID,
    entity_id: UUID,
    membership: MembershipDependency,
    session: SessionDependency,
    limit: PageLimit = 50,
    offset: PageOffset = 0,
) -> dict[str, object]:
    items, total = page_impact_paths_for_member(
        session,
        membership,
        run_id,
        entity_id,
        limit=limit,
        offset=offset,
    )
    return _page([ImpactPathResponse.model_validate(item) for item in items], total, limit, offset)


@router.post(
    "/scenarios",
    response_model=ScenarioResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["scenarios"],
    summary="Create a scenario from a live baseline run",
    description=(
        "Requires analysis:run permission. The baseline must be a completed live run "
        "in the active organization."
    ),
)
def create_scenario_endpoint(
    payload: ScenarioCreate,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> ScenarioResponse:
    scenario = create_scenario_for_member(
        session,
        membership,
        payload,
        request_id=_request_id(request),
    )
    _commit(session)
    return ScenarioResponse.model_validate(scenario)


@router.get(
    "/scenarios",
    response_model=PageResponse[ScenarioResponse],
    tags=["scenarios"],
    summary="List scenarios",
    description="Requires event:read permission. Results use stable creation-time/UUID ordering.",
)
def list_scenarios_endpoint(
    membership: MembershipDependency,
    session: SessionDependency,
    limit: PageLimit = 50,
    offset: PageOffset = 0,
) -> dict[str, object]:
    items, total = page_scenarios_for_member(
        session,
        membership,
        limit=limit,
        offset=offset,
    )
    return _page(items, total, limit, offset)


@router.get(
    "/scenarios/{scenario_id}",
    response_model=ScenarioDetailResponse,
    tags=["scenarios"],
    summary="Retrieve a scenario and its overlays",
    description="Requires event:read permission; cross-organization scenarios return 404.",
)
def get_scenario_endpoint(
    scenario_id: UUID,
    membership: MembershipDependency,
    session: SessionDependency,
) -> ScenarioDetailResponse:
    detail = get_scenario_detail_for_member(session, membership, scenario_id)
    scenario = ScenarioResponse.model_validate(detail["scenario"]).model_dump()
    return ScenarioDetailResponse.model_validate(
        {
            **scenario,
            "event_overlay": detail["event_overlay"],
            "entity_overrides": detail["entity_overrides"],
            "dependency_overrides": detail["dependency_overrides"],
            "interventions": detail["interventions"],
        }
    )


@router.patch(
    "/scenarios/{scenario_id}",
    response_model=ScenarioResponse,
    tags=["scenarios"],
    summary="Update scenario metadata",
    description="Requires analysis:run permission and a matching expected version.",
)
def update_scenario_endpoint(
    scenario_id: UUID,
    payload: ScenarioUpdate,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> ScenarioResponse:
    scenario = update_scenario_for_member(
        session,
        membership,
        scenario_id,
        payload,
        request_id=_request_id(request),
    )
    _commit(session)
    return ScenarioResponse.model_validate(scenario)


@router.patch(
    "/scenarios/{scenario_id}/event",
    response_model=ScenarioResponse,
    tags=["scenarios"],
    summary="Update the scenario event overlay",
    description=(
        "Requires analysis:run permission. Changes only the scenario snapshot, "
        "never the live event."
    ),
)
def update_scenario_event_endpoint(
    scenario_id: UUID,
    payload: ScenarioEventUpdate,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> ScenarioResponse:
    scenario = update_scenario_event_for_member(
        session,
        membership,
        scenario_id,
        payload,
        request_id=_request_id(request),
    )
    _commit(session)
    return ScenarioResponse.model_validate(scenario)


@router.post(
    "/scenarios/{scenario_id}/interventions",
    response_model=ScenarioInterventionResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["scenarios"],
    summary="Add a versioned scenario intervention",
    description=(
        "Supports mitigation, dependency weight override, dependency deactivation, "
        "and hypothetical draft dependency actions. Effectiveness is derived by comparison."
    ),
)
def create_scenario_intervention_endpoint(
    scenario_id: UUID,
    payload: ScenarioInterventionCreate,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> ScenarioInterventionResponse:
    intervention = create_intervention_for_member(
        session,
        membership,
        scenario_id,
        payload,
        request_id=_request_id(request),
    )
    _commit(session)
    return ScenarioInterventionResponse.model_validate(intervention)


@router.post(
    "/scenarios/{scenario_id}/analysis-runs",
    response_model=AnalysisRunResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["scenarios"],
    summary="Run scenario analysis",
    description=(
        "Requires analysis:run permission and a matching scenario version. Runs use "
        "the immutable baseline snapshot plus overlays and never update live records."
    ),
)
def create_scenario_analysis_run_endpoint(
    scenario_id: UUID,
    payload: ScenarioAnalysisRunCreate,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
) -> AnalysisRunResponse:
    run = create_scenario_analysis_run_for_member(
        session,
        membership,
        scenario_id,
        payload,
        request_id=_request_id(request),
    )
    _commit(session)
    if run.status == "failed":
        diagnostic_id = run.summary.get("diagnostic_id", "unavailable")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Scenario analysis failed. Diagnostic ID: {diagnostic_id}",
        )
    return AnalysisRunResponse.model_validate(run)


@router.get(
    "/scenarios/{scenario_id}/comparison",
    response_model=ScenarioComparisonResponse,
    tags=["scenarios"],
    summary="Compare baseline and scenario results",
    description=(
        "Requires event:read permission. Returns entity-level score changes and "
        "the scenario assumptions; score deltas are estimates, not guaranteed effects."
    ),
)
def compare_scenario_endpoint(
    scenario_id: UUID,
    scenario_run_id: UUID,
    membership: MembershipDependency,
    session: SessionDependency,
) -> ScenarioComparisonResponse:
    return ScenarioComparisonResponse.model_validate(
        compare_scenario_runs_for_member(
            session,
            membership,
            scenario_id,
            scenario_run_id,
        )
    )


@router.delete(
    "/scenarios/{scenario_id}",
    response_model=ScenarioResponse,
    tags=["scenarios"],
    summary="Archive a scenario",
    description=(
        "Requires analysis:run permission and a matching expected version. "
        "Archival retains scenario-owned history and does not change live records."
    ),
)
def archive_scenario_endpoint(
    scenario_id: UUID,
    request: Request,
    membership: MembershipDependency,
    session: SessionDependency,
    expected_version: Annotated[int, Query(ge=1)],
) -> ScenarioResponse:
    scenario = archive_scenario_for_member(
        session,
        membership,
        scenario_id,
        expected_version,
        request_id=_request_id(request),
    )
    _commit(session)
    return ScenarioResponse.model_validate(scenario)


@router.post("/dependencies/{dependency_id}/assessment", response_model=DependencyResponse)
async def assess_dependency_endpoint(
    dependency_id: UUID,
    request: Request,
    session: SessionDependency,
    membership: MembershipDependency,
) -> object:
    authorize(membership, Permission.DEPENDENCY_WRITE)
    dependency = get_dependency_for_member(session, membership, dependency_id)
    expected_updated_at = dependency.updated_at
    context = build_dependency_assessment_context(session, membership, dependency)
    session.rollback()
    try:
        assessment = await assess_with_ollama(context)
    except (OllamaResponseError, OllamaUnavailableError) as error:
        raise ai_http_error(error) from error
    dependency = get_dependency_for_member(session, membership, dependency_id, for_update=True)
    _check_updated_at(dependency.updated_at, expected_updated_at)
    if build_dependency_assessment_context(session, membership, dependency) != context:
        raise HTTPException(409, "The context changed during assessment. Request a new assessment.")
    dependency.assessment = {**assessment, "input_context": context}
    dependency.updated_at = datetime.now(UTC)
    _record_change(
        session,
        membership,
        "dependency.assessed",
        "dependency",
        dependency.id,
        {"decision": "pending", "model": assessment["model"]},
        _request_id(request),
    )
    _commit(session)
    return dependency


@router.post("/dependencies/{dependency_id}/assessment/decision", response_model=DependencyResponse)
def decide_dependency_assessment_endpoint(
    dependency_id: UUID,
    payload: AssessmentDecision,
    request: Request,
    session: SessionDependency,
    membership: MembershipDependency,
) -> object:
    authorize(membership, Permission.DEPENDENCY_WRITE)
    dependency = get_dependency_for_member(session, membership, dependency_id, for_update=True)
    _check_updated_at(dependency.updated_at, payload.expected_updated_at)
    assessment = dict(dependency.assessment or {})
    if payload.decision != "override" and assessment.get("decision") != "pending":
        raise HTTPException(409, "Request a new assessment before approving or rejecting it.")
    if payload.decision == "approve":
        if assessment.get("input_context") != build_dependency_assessment_context(
            session, membership, dependency
        ):
            raise HTTPException(409, "The assessment context changed. Request a new assessment.")
        dependency.weight = assessment["recommended_weight"]
    elif payload.weight is not None:
        dependency.weight = payload.weight
    if payload.decision != "reject":
        dependency.review_status = "validated"
    dependency.updated_at = datetime.now(UTC)
    assessment.update(
        decision=payload.decision,
        decided_at=dependency.updated_at.isoformat(),
        effective_weight=dependency.weight if dependency.review_status == "validated" else None,
    )
    dependency.assessment = assessment
    _record_change(
        session,
        membership,
        "dependency.assessment_decided",
        "dependency",
        dependency.id,
        {"decision": payload.decision, "effective_weight": assessment["effective_weight"]},
        _request_id(request),
    )
    _commit(session)
    return dependency


def workspace_user(
    session: SessionDependency,
    x_local_user_id: Annotated[str | None, Header()] = None,
) -> User:
    user = session.get(User, parse_local_user_id(x_local_user_id))
    if user is None:
        raise HTTPException(401, "The development account is not registered.")
    return user


WorkspaceUser = Annotated[User, Depends(workspace_user)]


@router.get("/workspace-dashboard", response_model=WorkspaceDashboard)
def workspace_dashboard(session: SessionDependency, user: WorkspaceUser) -> object:
    workspace_ids = select(OrganizationMember.organization_id).where(
        OrganizationMember.user_id == user.id,
        OrganizationMember.status == "active",
    )
    current_entities = select(Entity.id).where(
        Entity.organization_id.in_(workspace_ids), Entity.status != "archived"
    )
    approved_dependencies = select(Dependency.id).where(
        Dependency.organization_id.in_(workspace_ids),
        Dependency.is_active.is_(True),
        Dependency.review_status.in_(("reviewed", "validated")),
        Dependency.source_entity_id.in_(current_entities),
        Dependency.target_entity_id.in_(current_entities),
    )
    runs = select(ImpactRun).where(
        ImpactRun.organization_id.in_(workspace_ids), ImpactRun.scenario_id.is_(None)
    )
    activity = (
        select(AuditLog.organization_id, func.max(AuditLog.created_at).label("last_change"))
        .where(AuditLog.organization_id.in_(workspace_ids))
        .group_by(AuditLog.organization_id)
        .subquery()
    )
    modified_at = func.coalesce(activity.c.last_change, Organization.updated_at)
    recent_workspaces = session.execute(
        select(
            Organization.id,
            Organization.name,
            Organization.description,
            modified_at.label("last_modified_at"),
        )
        .outerjoin(activity, activity.c.organization_id == Organization.id)
        .where(Organization.id.in_(workspace_ids))
        .order_by(modified_at.desc(), Organization.id)
        .limit(5)
    )
    recent_runs = session.execute(
        runs.add_columns(Organization.name, OperationalEvent.title)
        .join(Organization, ImpactRun.organization_id == Organization.id)
        .join(OperationalEvent, ImpactRun.event_id == OperationalEvent.id)
        .order_by(ImpactRun.created_at.desc(), ImpactRun.id)
        .limit(5)
    )

    def count(query: Any) -> int:
        return session.scalar(select(func.count()).select_from(query.subquery())) or 0

    return {
        "workspace_count": count(workspace_ids),
        "entity_count": count(current_entities),
        "approved_dependency_count": count(approved_dependencies),
        "run_count": count(runs.with_only_columns(ImpactRun.id)),
        "recent_workspaces": recent_workspaces.mappings().all(),
        "recent_runs": [
            {
                "id": run.id,
                "workspace_id": run.organization_id,
                "workspace_name": workspace_name,
                "event_title": (run.input_snapshot or {}).get("event", {}).get("title", title),
                "status": run.status,
                "created_at": run.created_at,
            }
            for run, workspace_name, title in recent_runs
        ],
    }


@router.get("/workspaces", response_model=list[WorkspaceResponse])
def list_workspaces(session: SessionDependency, user: WorkspaceUser) -> object:
    return list(
        session.scalars(
            select(Organization)
            .join(OrganizationMember, Organization.id == OrganizationMember.organization_id)
            .where(OrganizationMember.user_id == user.id, OrganizationMember.status == "active")
            .order_by(Organization.name, Organization.id)
        )
    )


@router.post("/workspaces", response_model=WorkspaceResponse, status_code=201)
def create_workspace(
    payload: WorkspaceInput,
    request: Request,
    session: SessionDependency,
    user: WorkspaceUser,
) -> object:
    workspace = Organization(name=payload.name, description=payload.description)
    session.add(workspace)
    session.flush()
    membership = OrganizationMember(
        organization_id=workspace.id,
        user_id=user.id,
        role="administrator",
        status="active",
    )
    session.add(membership)
    session.flush()
    _record_change(
        session,
        membership,
        "workspace.created",
        "organization",
        workspace.id,
        {"name": workspace.name},
        _request_id(request),
    )
    _commit(session)
    return workspace


@router.patch("/workspaces/current", response_model=WorkspaceResponse)
def update_workspace(
    payload: WorkspaceInput,
    request: Request,
    session: SessionDependency,
    membership: MembershipDependency,
) -> object:
    authorize(membership, Permission.MEMBER_MANAGE)
    workspace = session.get(Organization, membership.organization_id, with_for_update=True)
    if workspace is None:
        raise HTTPException(404, "Workspace was not found.")
    workspace.name = payload.name
    workspace.description = payload.description
    _record_change(
        session,
        membership,
        "workspace.updated",
        "organization",
        workspace.id,
        {"name": workspace.name},
        _request_id(request),
    )
    _commit(session)
    return workspace


@router.post("/trigger-events", response_model=TriggerEventResponse, status_code=201)
@router.patch("/trigger-events/{event_id}", response_model=TriggerEventResponse)
def save_trigger_event(
    payload: TriggerEventInput,
    request: Request,
    session: SessionDependency,
    membership: MembershipDependency,
    event_id: UUID | None = None,
) -> object:
    request_id = _request_id(request)
    fields = {
        "title": payload.title,
        "description": payload.description,
        "severity": payload.severity,
        "start_at": payload.start_at,
        "request_id": request_id,
    }
    if event_id is None:
        event = create_event(session, membership, initial_status="open", **fields)
        trigger = create_event_trigger(
            session,
            membership,
            event.id,
            entity_id=payload.entity_id,
            rationale=payload.context,
            request_id=request_id,
        )
    else:
        if payload.expected_updated_at is None:
            raise HTTPException(422, "The last saved event timestamp is required for updates.")
        event = update_event(
            session,
            membership,
            event_id,
            expected_updated_at=payload.expected_updated_at,
            **fields,
        )
        trigger = session.scalar(
            select(EventTrigger)
            .where(
                EventTrigger.organization_id == membership.organization_id,
                EventTrigger.event_id == event.id,
            )
            .order_by(EventTrigger.created_at, EventTrigger.id)
            .limit(1)
        )
        if trigger is None or trigger.entity_id != payload.entity_id:
            if trigger is not None:
                delete_event_trigger(
                    session, membership, event.id, trigger.id, request_id=request_id
                )
            trigger = create_event_trigger(
                session,
                membership,
                event.id,
                entity_id=payload.entity_id,
                rationale=payload.context,
                request_id=request_id,
            )
        elif "context" in payload.model_fields_set and trigger.rationale != payload.context:
            trigger.rationale = payload.context
            _record_change(
                session,
                membership,
                "event_trigger.updated",
                "event_trigger",
                trigger.id,
                {"event_id": str(event.id), "fields": ["rationale"]},
                request_id,
            )
        if event.status == "draft":
            event = transition_event_status(
                session,
                membership,
                event.id,
                target_status="open",
                expected_updated_at=event.updated_at,
                request_id=request_id,
            )
    _commit(session)
    return {"event": event, "trigger": trigger}
