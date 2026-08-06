"""Generador de datos sintéticos para desarrollo local.

Solo se ejecuta a mano (`uv run python -m app.dev_seed`) o desde
`dev.sh --seed`; el runtime de la app (main.py/asgi.py) nunca importa este
módulo. Es idempotente: si el usuario objetivo ya tiene entrenos, no toca
nada. Determinista via random.Random(SEED), aunque el calendario generado
dependa del día real de ejecución (el historial siempre "termina ayer").
"""

import random
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .auth import hash_password
from .config import get_settings
from .db import make_engine, make_sessionmaker
from .models import (
    BodyEntry,
    Exercise,
    PersonalRecord,
    Routine,
    RoutineExercise,
    ScheduledSession,
    ShareGrant,
    User,
    Workout,
    WorkoutExercise,
    WorkoutSet,
)
from .seed import ensure_catalog
from .services.workout_sets import detect_prs, session_volume

SEED = 42

# el timestamp del entreno se ancla a esta zona (misma que el timezone por
# defecto de User) y se convierte a naive UTC — la convención del resto del
# backend (ver models.utcnow) — para que un viewer en esa zona siga viendo
# "entreno de las 18:00" en vez de un desplazamiento arbitrario
SEED_TZ = ZoneInfo("Europe/Madrid")

# (nombre, rune, color, [(nombre_ejercicio, sets, reps, peso_kg|None, descanso_s)])
# rune usa los slugs RuneName del picker del frontend (frontend/src/lib/runes.ts),
# no glifos rúnicos sueltos: RoutineList castea routine.rune a RuneName tal cual
ROUTINE_DEFS: list[tuple[str, str, str, list[tuple[str, int, int, float | None, int]]]] = [
    (
        "Push día",
        "chest",
        "#c0392b",
        [
            ("Press banca", 4, 8, 60.0, 120),
            ("Press militar", 4, 8, 35.0, 120),
            ("Fondos en paralelas", 3, 10, None, 90),
            ("Elevaciones laterales", 3, 12, 10.0, 60),
            ("Extensión en polea", 3, 12, 25.0, 60),
        ],
    ),
    (
        "Pull día",
        "back",
        "#2980b9",
        [
            ("Peso muerto", 4, 6, 90.0, 150),
            ("Remo con barra", 4, 8, 50.0, 120),
            ("Dominadas", 3, 8, None, 90),
            ("Curl con barra", 3, 10, 25.0, 60),
            ("Face pull", 3, 15, 15.0, 45),
        ],
    ),
    (
        "Pierna A",
        "legs",
        "#27ae60",
        [
            ("Sentadilla", 4, 8, 70.0, 150),
            ("Prensa de piernas", 4, 10, 120.0, 120),
            ("Peso muerto rumano", 3, 10, 50.0, 90),
            ("Extensión de cuádriceps", 3, 12, 40.0, 60),
            ("Curl femoral", 3, 12, 35.0, 60),
            ("Elevación de gemelos", 3, 15, 50.0, 45),
        ],
    ),
]


def _round25(value: float) -> float:
    return round(value / 2.5) * 2.5


class _Progression:
    """Sobrecarga progresiva con ruido: sube cada 2-3 sesiones de ese ejercicio
    (con 3 rutinas rotando, son ~1-2 semanas reales), con meseta o deload
    ocasional para que la curva no sea una recta perfecta. Los PR de verdad
    los decide detect_prs, no esta clase: aquí solo se simula el entreno."""

    def __init__(self, rng: random.Random, base: float, step: float):
        self._rng = rng
        self._step = step
        self._since_bump = 0
        self.value = base

    def next(self) -> float:
        self._since_bump += 1
        if self._since_bump >= self._rng.choice((2, 3)):
            roll = self._rng.random()
            if roll < 0.12:
                self.value = max(self.value - self._rng.choice((1, 2)) * self._step, self._step)
            elif roll < 0.85:
                self.value += self._step
            self._since_bump = 0
        return self.value


def _ensure_target(db: Session) -> User:
    """El primer admin existente es el objetivo; si la instancia está vacía
    (o, caso límite, no tiene ningún admin) se crea admin/admin1234."""
    target = db.scalar(select(User).where(User.is_admin.is_(True)).order_by(User.id))
    if target is not None:
        return target
    user = User(username="admin", password_hash=hash_password("admin1234"), is_admin=True)
    db.add(user)
    db.commit()
    return user


def _ensure_demo_users(db: Session) -> tuple[User, User]:
    freyja = db.scalar(select(User).where(User.username == "freyja"))
    if freyja is None:
        freyja = User(username="freyja", password_hash=hash_password("secret123"))
        db.add(freyja)
    loki = db.scalar(select(User).where(User.username == "loki"))
    if loki is None:
        loki = User(username="loki", password_hash=hash_password("secret123"))
        db.add(loki)
    db.commit()
    return freyja, loki


def _ensure_grants(db: Session, target: User, freyja: User) -> None:
    """Grant en ambos sentidos: el selector de atleta necesita datos reales
    tanto viendo a freyja como siendo vista por ella."""
    for owner_id, viewer_id in ((freyja.id, target.id), (target.id, freyja.id)):
        exists = db.scalar(
            select(ShareGrant).where(
                ShareGrant.owner_id == owner_id, ShareGrant.viewer_id == viewer_id
            )
        )
        if exists is None:
            db.add(ShareGrant(owner_id=owner_id, viewer_id=viewer_id))
    db.commit()


def _exercise_map(db: Session) -> dict[str, Exercise]:
    exercises = db.scalars(select(Exercise).where(Exercise.owner_id.is_(None))).all()
    return {e.name_es: e for e in exercises}


def _create_routines(db: Session, owner: User, by_name: dict[str, Exercise]) -> list[Routine]:
    routines = []
    for name, rune, color, items in ROUTINE_DEFS:
        routine = Routine(owner_id=owner.id, name=name, rune=rune, color=color)
        db.add(routine)
        db.flush()
        for position, (ex_name, sets, reps, weight, rest) in enumerate(items, start=1):
            db.add(
                RoutineExercise(
                    routine_id=routine.id,
                    exercise_id=by_name[ex_name].id,
                    position=position,
                    target_sets=sets,
                    target_reps=reps,
                    target_weight_kg=weight,
                    rest_seconds=rest,
                )
            )
        routines.append(routine)
    db.commit()
    return routines


def _workout_dates(
    rng: random.Random, weeks: int, end_date: date, per_week: tuple[int, ...]
) -> list[date]:
    """N sesiones/semana en días distintos elegidos al azar, terminando en
    end_date (el historial siempre acaba ayer, nunca hoy)."""
    dates: list[date] = []
    for w in range(weeks):
        week_end = end_date - timedelta(days=7 * (weeks - 1 - w))
        week_start = week_end - timedelta(days=6)
        n = min(rng.choice(per_week), 7)
        for off in rng.sample(range(7), k=n):
            d = week_start + timedelta(days=off)
            if d <= end_date:
                dates.append(d)
                # día doble ocasional (segunda sesión, ej. cardio de mañana +
                # rutina por la tarde): sube el heatmap por encima del tier 1;
                # ambos entrenos quedan cerrados (ended_at), así que el índice
                # único de "un solo entreno activo" no se ve afectado
                if rng.random() < 0.12:
                    dates.append(d)
    return sorted(dates)


def _log_set(
    db: Session,
    owner_id: int,
    exercise: Exercise,
    wex: WorkoutExercise,
    set_number: int,
    is_warmup: bool,
    started_at: datetime,
    **fields,
) -> WorkoutSet:
    rpe = fields.pop("rpe", None)
    # completed_at real, no el instante del seed: sin esto todas las series (y
    # por tanto todos los PR) colapsan en "ahora" y "PRs recientes" muestra el
    # historial entero como si fuera de hoy
    completed_at = started_at + timedelta(minutes=3 * set_number)
    wset = WorkoutSet(
        workout_exercise_id=wex.id,
        set_number=set_number,
        is_warmup=is_warmup,
        rpe=rpe,
        completed_at=completed_at,
        **fields,
    )
    db.add(wset)
    db.flush()
    # misma secuencia que el router log_set: volumen de sesión + detect_prs
    # por cada serie (detect_prs ya ignora calentamientos y no-fuerza)
    volume = session_volume(db, wex.workout_id, exercise.id)
    detect_prs(db, owner_id, exercise, wset, volume, achieved_at=completed_at)
    return wset


def _log_main_exercise(
    db: Session,
    rng: random.Random,
    owner_id: int,
    exercise: Exercise,
    wex: WorkoutExercise,
    item: RoutineExercise,
    progressions: dict[int, _Progression],
    weight_scale: float,
    started_at: datetime,
) -> None:
    target_reps = item.target_reps or 8
    target_sets = item.target_sets or 3
    if exercise.measurement == "strength":
        prog = progressions.setdefault(
            exercise.id,
            _Progression(rng, _round25((item.target_weight_kg or 40.0) * weight_scale), 2.5),
        )
        working_weight = prog.next()
        warmup_weight = max(_round25(working_weight * 0.6), 10.0)
        _log_set(
            db, owner_id, exercise, wex, 1, True, started_at,
            reps=target_reps + 2, weight_kg=warmup_weight,
        )
        for i in range(target_sets):
            last = i == target_sets - 1
            reps = max(target_reps + rng.choice((-1, 0, 0, 0, 1)), 1)
            weight = working_weight + (rng.choice((-2.5, 0, 0, 0)) if last else 0)
            _log_set(
                db, owner_id, exercise, wex, i + 2, False, started_at,
                reps=reps, weight_kg=weight, rpe=rng.randint(6, 9),
            )
    else:  # bodyweight: aquí la progresión sube repeticiones, no peso
        prog = progressions.setdefault(
            exercise.id, _Progression(rng, float(target_reps), 1.0)
        )
        top_reps = int(round(prog.next()))
        _log_set(db, owner_id, exercise, wex, 1, True, started_at, reps=max(top_reps - 3, 3))
        for i in range(target_sets):
            reps = max(top_reps + rng.choice((-1, 0, 0, 1)), 1)
            _log_set(
                db, owner_id, exercise, wex, i + 2, False, started_at,
                reps=reps, rpe=rng.randint(6, 9),
            )


def _log_ad_hoc(
    db: Session, rng: random.Random, owner_id: int, exercise: Exercise, wex: WorkoutExercise, started_at: datetime
) -> None:
    sets = rng.choice((2, 3))
    if exercise.measurement == "strength":
        weight = _round25(rng.uniform(10, 40))
        for i in range(sets):
            _log_set(
                db, owner_id, exercise, wex, i + 1, False, started_at,
                reps=rng.randint(8, 12), weight_kg=weight, rpe=rng.randint(6, 8),
            )
    elif exercise.measurement == "bodyweight":
        for i in range(sets):
            _log_set(
                db, owner_id, exercise, wex, i + 1, False, started_at,
                reps=rng.randint(8, 15), rpe=rng.randint(6, 8),
            )
    elif exercise.measurement == "timed":
        for i in range(sets):
            _log_set(
                db, owner_id, exercise, wex, i + 1, False, started_at,
                duration_seconds=rng.randint(30, 60), rpe=rng.randint(6, 8),
            )
    else:  # cardio, raro como extra pero por si el catálogo del pool lo trae
        _log_set(db, owner_id, exercise, wex, 1, False, started_at, duration_seconds=rng.randint(300, 900))


def _log_cardio(
    db: Session, rng: random.Random, owner_id: int, exercise: Exercise, wex: WorkoutExercise, started_at: datetime
) -> None:
    duration = rng.randint(15, 25) * 60
    distance = round(duration / 60 * rng.uniform(120, 170)) if rng.random() < 0.7 else None
    _log_set(db, owner_id, exercise, wex, 1, False, started_at, duration_seconds=duration, distance_m=distance)


def _build_workout(
    db: Session,
    rng: random.Random,
    owner: User,
    day: date,
    routine: Routine,
    by_id: dict[int, Exercise],
    progressions: dict[int, _Progression],
    weight_scale: float,
    extra_pool: list[Exercise],
    cardio_exercise: Exercise,
) -> Workout:
    # 18:00 en SEED_TZ (no naive-como-UTC-crudo): así un viewer en esa zona ve
    # el entreno a última hora de la tarde, igual que el resto de timestamps
    # reales de la app, que son naive UTC genuinos (utcnow())
    started_local = datetime.combine(day, time(18, 0), tzinfo=SEED_TZ) + timedelta(
        minutes=rng.randint(0, 90)
    )
    started = started_local.astimezone(UTC).replace(tzinfo=None)
    ended = started + timedelta(minutes=rng.randint(50, 80))
    feeling = rng.choices((2, 3, 4, 5), weights=(1, 2, 4, 2))[0]
    workout = Workout(
        owner_id=owner.id,
        date=day,
        started_at=started,
        ended_at=ended,
        routine_id=routine.id,
        feeling=feeling,
    )
    db.add(workout)
    db.flush()

    position = 1
    for item in routine.exercises:
        exercise = by_id[item.exercise_id]
        wex = WorkoutExercise(workout_id=workout.id, exercise_id=exercise.id, position=position)
        db.add(wex)
        db.flush()
        _log_main_exercise(db, rng, owner.id, exercise, wex, item, progressions, weight_scale, started)
        position += 1

    if extra_pool and rng.random() < 0.18:
        used_ids = {item.exercise_id for item in routine.exercises}
        candidates = [e for e in extra_pool if e.id not in used_ids]
        if candidates:
            extra = rng.choice(candidates)
            wex = WorkoutExercise(
                workout_id=workout.id, exercise_id=extra.id, position=position, note="ejercicio extra"
            )
            db.add(wex)
            db.flush()
            _log_ad_hoc(db, rng, owner.id, extra, wex, started)
            position += 1

    if rng.random() < 0.3:
        wex = WorkoutExercise(workout_id=workout.id, exercise_id=cardio_exercise.id, position=position)
        db.add(wex)
        db.flush()
        _log_cardio(db, rng, owner.id, cardio_exercise, wex, started)

    # commit por entreno, no por serie: esto es una herramienta de desarrollo que
    # corre una vez y termina, no un request handler; la regla de "los servicios
    # nunca comitean" protege transacciones de la API, no aplica aquí
    db.commit()
    return workout


def _generate_history(
    db: Session,
    rng: random.Random,
    owner: User,
    routines: list[Routine],
    by_id: dict[int, Exercise],
    dates: list[date],
    weight_scale: float,
    extra_pool: list[Exercise],
    cardio_exercise: Exercise,
) -> list[Workout]:
    progressions: dict[int, _Progression] = {}
    workouts = []
    for i, day in enumerate(dates):
        routine = routines[i % len(routines)]
        workouts.append(
            _build_workout(
                db, rng, owner, day, routine, by_id, progressions, weight_scale, extra_pool, cardio_exercise
            )
        )
    return workouts


def _schedule_sessions(
    db: Session,
    rng: random.Random,
    owner: User,
    workouts: list[Workout],
    routines: list[Routine],
    end_date: date,
) -> int:
    """~80% de los entrenos generados quedan enlazados como sesión 'done';
    unas pocas quedan 'skipped' (día planeado sin entreno real); y 3 quedan
    'planned' en los próximos 7 días para poblar el buzón de "hoy"."""
    count = 0
    linked = set(rng.sample(range(len(workouts)), k=max(1, round(len(workouts) * 0.8))))
    for idx, workout in enumerate(workouts):
        if idx not in linked:
            continue
        db.add(
            ScheduledSession(
                owner_id=owner.id,
                date=workout.date,
                time=workout.started_at.time() if workout.started_at else None,
                routine_id=workout.routine_id,
                status="done",
                workout_id=workout.id,
            )
        )
        count += 1

    existing_dates = {w.date for w in workouts}
    span_days = (end_date - workouts[0].date).days
    free_dates = [
        workouts[0].date + timedelta(days=i)
        for i in range(span_days + 1)
        if workouts[0].date + timedelta(days=i) not in existing_dates
    ]
    for i, d in enumerate(rng.sample(free_dates, k=min(3, len(free_dates)))):
        db.add(
            ScheduledSession(
                owner_id=owner.id, date=d, routine_id=routines[i % len(routines)].id, status="skipped"
            )
        )
        count += 1

    next_idx = len(workouts) % len(routines)
    today = end_date + timedelta(days=1)
    # sesión de "hoy" siempre presente, no una moneda al aire: el buzón de la
    # portada de athlete-mode necesita algo que mostrar sin depender del azar
    first_offset = 0
    for i, offset in enumerate((first_offset, 3, 6)):
        db.add(
            ScheduledSession(
                owner_id=owner.id,
                date=today + timedelta(days=offset),
                routine_id=routines[(next_idx + i) % len(routines)].id,
                status="planned",
            )
        )
        count += 1

    db.commit()
    return count


def _body_entries(db: Session, rng: random.Random, owner: User, weeks: int, end_date: date) -> None:
    """Peso semanal con deriva realista 84.0->81.5kg y ruido; la cintura solo
    se registra de vez en cuando, como en el uso real de la app."""
    start_weight, target_weight = 84.0, 81.5
    for w in range(weeks):
        d = end_date - timedelta(days=7 * (weeks - 1 - w))
        progress = w / max(weeks - 1, 1)
        base = start_weight + (target_weight - start_weight) * progress
        weight = round(base + rng.uniform(-0.4, 0.4), 1)
        waist = round(92 - 3 * progress + rng.uniform(-0.5, 0.5), 1) if rng.random() < 0.3 else None
        db.add(BodyEntry(owner_id=owner.id, date=d, weight_kg=weight, waist_cm=waist))
    db.commit()


def run(db: Session, weeks: int = 12) -> dict:
    """Punto de entrada idempotente. Si el objetivo ya tiene entrenos no se
    toca nada; si no, se genera un historial coherente de ~`weeks` semanas."""
    target = _ensure_target(db)
    already_seeded = bool(
        db.scalar(select(func.count(Workout.id)).where(Workout.owner_id == target.id))
    )
    if already_seeded:
        return {"created": False, "target_username": target.username}

    ensure_catalog(db)
    rng = random.Random(SEED)

    freyja, _loki = _ensure_demo_users(db)
    _ensure_grants(db, target, freyja)

    by_name = _exercise_map(db)
    by_id = {e.id: e for e in by_name.values()}
    cardio_exercise = by_name["Cinta de correr"]
    extra_pool = [e for e in by_name.values() if e.measurement != "cardio"]

    target_routines = _create_routines(db, target, by_name)
    freyja_routines = _create_routines(db, freyja, by_name)

    end_date = date.today() - timedelta(days=1)

    target_dates = _workout_dates(rng, weeks, end_date, (3, 4))
    target_workouts = _generate_history(
        db, rng, target, target_routines, by_id, target_dates, 1.0, extra_pool, cardio_exercise
    )

    freyja_dates = _workout_dates(rng, weeks, end_date, (1, 2, 2))
    freyja_workouts = _generate_history(
        db, rng, freyja, freyja_routines, by_id, freyja_dates, 0.65, extra_pool, cardio_exercise
    )

    scheduled_count = _schedule_sessions(db, rng, target, target_workouts, target_routines, end_date)
    _body_entries(db, rng, target, weeks, end_date)
    # freyja es la atleta compartida de demo (athlete-mode); sin esto tiene
    # entrenos pero ni sesiones programadas ni peso, y esa vista queda vacía
    _schedule_sessions(db, rng, freyja, freyja_workouts, freyja_routines, end_date)
    _body_entries(db, rng, freyja, weeks, end_date)

    pr_count = db.scalar(
        select(func.count(PersonalRecord.id)).where(PersonalRecord.owner_id == target.id)
    )

    return {
        "created": True,
        "target_username": target.username,
        "routines": len(target_routines),
        "workouts": len(target_workouts),
        "freyja_workouts": len(freyja_workouts),
        "personal_records": pr_count,
        "scheduled_sessions": scheduled_count,
    }


def _print_summary(result: dict) -> None:
    if not result["created"]:
        print(
            f"El usuario objetivo ({result['target_username']}) ya tiene entrenos: "
            "no se ha tocado nada (el seed ya estaba aplicado)."
        )
        return
    print("Datos de desarrollo generados:")
    print(f"  admin objetivo:      {result['target_username']}")
    print(f"  rutinas:             {result['routines']}")
    print(f"  entrenos (admin):    {result['workouts']}")
    print(f"  entrenos (freyja):   {result['freyja_workouts']}")
    print(f"  personal records:    {result['personal_records']}")
    print(f"  sesiones programadas:{result['scheduled_sessions']}")


if __name__ == "__main__":
    settings = get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    engine = make_engine(settings.db_url)
    sessionmaker_ = make_sessionmaker(engine)
    with sessionmaker_() as session:
        summary = run(session)
    _print_summary(summary)
