from datetime import UTC, datetime
from io import StringIO
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import func, inspect, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import make_engine
from app.models import (
    Dependency,
    Entity,
    EventTrigger,
    ImpactRun,
    OperationalEvent,
    Organization,
    Scenario,
    User,
)
from app.seed import seed_demo_data


def test_fresh_migration_and_synthetic_seed_are_tenant_scoped(tmp_path, monkeypatch) -> None:
    database_path = tmp_path / "fresh.sqlite"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{database_path}")
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))

    command.upgrade(config, "head")

    engine = make_engine(f"sqlite:///{database_path}")
    table_names = set(inspect(engine).get_table_names())
    assert {
        "organizations",
        "users",
        "organization_members",
        "entities",
        "dependencies",
        "events",
        "event_triggers",
        "scenarios",
        "scenario_events",
        "scenario_entity_overrides",
        "scenario_dependency_overrides",
        "interventions",
        "impact_runs",
        "impact_results",
        "impact_paths",
        "impact_path_steps",
        "analysis_explanations",
        "audit_logs",
        "alembic_version",
    } <= table_names
    impact_run_columns = {column["name"] for column in inspect(engine).get_columns("impact_runs")}
    assert "input_snapshot" in impact_run_columns

    with Session(engine) as session:
        seed_demo_data(session)
        session.commit()
        seed_demo_data(session)
        session.commit()

        assert session.scalar(select(func.count()).select_from(Organization)) == 2
        assert session.scalar(select(func.count()).select_from(Entity)) == 20
        assert session.scalar(select(func.count()).select_from(Dependency)) == 19
        assert session.scalar(select(func.count()).select_from(EventTrigger)) == 2
        assert (
            session.scalar(
                select(func.count()).select_from(Entity).where(Entity.status == "archived")
            )
            == 2
        )
        assert (
            session.scalar(
                select(func.count()).select_from(Dependency).where(Dependency.is_active.is_(False))
            )
            == 2
        )

        campus_entity = session.scalar(
            select(Entity).where(Entity.name == "Advanced Computing Laboratory")
        )
        transport_entity = session.scalar(select(Entity).where(Entity.name == "Road Segment X"))
        transport = session.scalar(
            select(Organization).where(Organization.name == "City Transport Demo")
        )
        assert campus_entity is not None
        assert transport_entity is not None
        assert transport is not None
        with pytest.raises(IntegrityError):
            with session.begin_nested():
                session.add(
                    Dependency(
                        organization_id=transport.id,
                        source_entity_id=campus_entity.id,
                        target_entity_id=transport_entity.id,
                        relationship_type="affects",
                        relationship_label="Affects",
                        weight=0.5,
                    )
                )
                session.flush()

        campus = session.scalar(
            select(Organization).where(Organization.name == "North Campus Demo")
        )
        campus_user = session.scalar(select(User).where(User.subject == "synthetic:campus-admin"))
        assert campus is not None
        assert campus_user is not None
        event = OperationalEvent(
            organization_id=campus.id,
            title="Migration FK test",
            severity=10,
            start_at=datetime(2026, 11, 7, 9, 0, tzinfo=UTC),
            status="resolved",
        )
        session.add(event)
        session.flush()
        with pytest.raises(IntegrityError):
            with session.begin_nested():
                session.add(
                    OperationalEvent(
                        organization_id=campus.id,
                        title="Invalid migration status",
                        severity=10,
                        start_at=event.start_at,
                        status="cancelled",
                    )
                )
                session.flush()
        run = ImpactRun(
            organization_id=campus.id,
            event_id=event.id,
            algorithm_version="test",
            input_hash="test",
            as_of=event.start_at,
            created_by_user_id=campus_user.id,
        )
        session.add(run)
        session.flush()
        run.input_snapshot = {"algorithm_version": "test", "event": {"id": str(event.id)}}
        run.status = "completed_with_limits"
        session.flush()
        assert run.input_snapshot["algorithm_version"] == "test"
        with pytest.raises(IntegrityError):
            with session.begin_nested():
                session.add(
                    Scenario(
                        organization_id=transport.id,
                        name="Cross-tenant baseline",
                        baseline_run_id=run.id,
                        created_by_user_id=campus_user.id,
                    )
                )
                session.flush()
    engine.dispose()
    command.check(config)
    command.downgrade(config, "e52c93d6b018")
    engine = make_engine(f"sqlite:///{database_path}")
    assert "analysis_explanations" not in inspect(engine).get_table_names()
    with Session(engine) as session:
        assert session.scalar(select(func.count()).select_from(Entity)) == 20
    engine.dispose()
    command.upgrade(config, "head")
    command.check(config)


def test_commentary_migration_generates_postgresql_ddl(monkeypatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://localhost/ripple_offline")
    output = StringIO()
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"), output_buffer=output)
    command.upgrade(config, "head", sql=True)
    ddl = output.getvalue()
    assert "CREATE TABLE analysis_explanations" in ddl
    assert "fk_analysis_explanations_result_tenant" in ddl
    assert "FOREIGN KEY(organization_id, run_id, entity_id)" in ddl
