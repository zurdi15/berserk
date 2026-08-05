from datetime import date, timedelta

from sqlalchemy import func, select

from app import models
from app.dev_seed import run
from app.services.workout_sets import validate_set_fields


def _all_sets(db_session, owner_id):
    workouts = db_session.scalars(
        select(models.Workout).where(models.Workout.owner_id == owner_id)
    ).all()
    for w in workouts:
        for wex in w.exercises:
            for wset in wex.sets:
                yield w, wex, wset


def test_dev_seed_generates_coherent_history(db_session):
    result = run(db_session)  # weeks=12 por defecto: cubre el requisito literal
    assert result["created"] is True

    target = db_session.scalar(select(models.User).where(models.User.is_admin.is_(True)))
    assert target is not None and target.username == "admin"

    workouts = db_session.scalars(
        select(models.Workout).where(models.Workout.owner_id == target.id)
    ).all()
    assert len(workouts) >= 30

    span = (max(w.date for w in workouts) - min(w.date for w in workouts)).days
    assert 70 <= span <= 84  # ~12 semanas, terminando ayer

    yesterday = date.today() - timedelta(days=1)
    assert max(w.date for w in workouts) <= yesterday

    # freyja (demo) tiene una versión más ligera del historial
    freyja = db_session.scalar(select(models.User).where(models.User.username == "freyja"))
    assert freyja is not None
    freyja_workouts = db_session.scalar(
        select(func.count(models.Workout.id)).where(models.Workout.owner_id == freyja.id)
    )
    assert 0 < freyja_workouts < len(workouts)

    # sharing en ambos sentidos para el selector de atleta
    grants = db_session.scalars(select(models.ShareGrant)).all()
    pairs = {(g.owner_id, g.viewer_id) for g in grants}
    assert (freyja.id, target.id) in pairs
    assert (target.id, freyja.id) in pairs

    # loki existe como usuario demo adicional
    assert db_session.scalar(select(models.User).where(models.User.username == "loki")) is not None

    exercises_by_id = {e.id: e for e in db_session.scalars(select(models.Exercise)).all()}
    checked = 0
    for _w, _wex, wset in _all_sets(db_session, target.id):
        exercise = exercises_by_id[_wex.exercise_id]
        data = {
            "reps": wset.reps,
            "weight_kg": wset.weight_kg,
            "duration_seconds": wset.duration_seconds,
            "distance_m": wset.distance_m,
        }
        validate_set_fields(exercise.measurement, data)  # no debe lanzar
        checked += 1
    assert checked > 100

    # PRs no vacíos, y max_weight monótonamente creciente por ejercicio
    prs = db_session.scalars(
        select(models.PersonalRecord)
        .where(
            models.PersonalRecord.owner_id == target.id,
            models.PersonalRecord.kind == "max_weight",
        )
        .order_by(models.PersonalRecord.exercise_id, models.PersonalRecord.id)
    ).all()
    assert prs
    by_exercise: dict[int, list[float]] = {}
    for pr in prs:
        by_exercise.setdefault(pr.exercise_id, []).append(pr.value)
    for exercise_id, values in by_exercise.items():
        assert all(b > a for a, b in zip(values, values[1:])), (exercise_id, values)

    # 3 sesiones planificadas en el futuro
    today = date.today()
    future = db_session.scalars(
        select(models.ScheduledSession).where(
            models.ScheduledSession.owner_id == target.id,
            models.ScheduledSession.status == "planned",
            models.ScheduledSession.date >= today,
        )
    ).all()
    assert len(future) == 3
    assert all(f.date <= today + timedelta(days=7) for f in future)

    # body entries del objetivo: drift de peso semanal
    body_entries = db_session.scalars(
        select(models.BodyEntry).where(models.BodyEntry.owner_id == target.id).order_by(models.BodyEntry.date)
    ).all()
    assert len(body_entries) >= 10
    assert body_entries[0].weight_kg > body_entries[-1].weight_kg  # 84.0 -> 81.5

    # rutinas del objetivo: 3, en español, con rune/color
    routines = db_session.scalars(
        select(models.Routine).where(models.Routine.owner_id == target.id)
    ).all()
    assert {r.name for r in routines} == {"Push día", "Pull día", "Pierna A"}
    assert all(r.rune and r.color for r in routines)
    for r in routines:
        assert 4 <= len(r.exercises) <= 6

    # segunda pasada: no-op, ni una fila más
    workouts_before = len(workouts)
    prs_before = len(prs)
    result2 = run(db_session)
    assert result2["created"] is False
    workouts_after = db_session.scalar(
        select(func.count(models.Workout.id)).where(models.Workout.owner_id == target.id)
    )
    prs_after = db_session.scalar(
        select(func.count(models.PersonalRecord.id)).where(models.PersonalRecord.owner_id == target.id)
    )
    assert workouts_after == workouts_before
    assert prs_after >= prs_before  # sin nueva escritura, no puede haber cambiado


def test_dev_seed_bootstraps_admin_when_no_users(db_session):
    assert db_session.scalar(select(func.count(models.User.id))) == 0
    result = run(db_session, weeks=3)
    assert result["created"] is True
    admin = db_session.scalar(select(models.User).where(models.User.username == "admin"))
    assert admin is not None
    assert admin.is_admin is True


def test_dev_seed_noop_when_target_already_has_workouts(db_session):
    """No-op estricto: un usuario preexistente con entrenos no debe recibir
    ni rutinas, ni usuarios demo, ni ningún otro efecto secundario."""
    admin = models.User(username="root", password_hash="x", is_admin=True)
    db_session.add(admin)
    db_session.flush()
    workout = models.Workout(owner_id=admin.id, date=date.today())
    db_session.add(workout)
    db_session.commit()

    result = run(db_session, weeks=3)
    assert result == {"created": False, "target_username": "root"}
    assert db_session.scalar(select(func.count(models.User.id))) == 1
    assert db_session.scalar(select(func.count(models.Routine.id))) == 0
