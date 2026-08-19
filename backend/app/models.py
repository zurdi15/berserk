from datetime import UTC, date, datetime, time

from sqlalchemy import (
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    String,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    """UTC naive, coherente con el resto de fechas de la app."""
    return datetime.now(UTC).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(100))
    is_admin: Mapped[bool] = mapped_column(default=False)
    locale: Mapped[str] = mapped_column(String(5), default="es")
    units: Mapped[str] = mapped_column(String(2), default="kg")
    timezone: Mapped[str] = mapped_column(String(50), default="Europe/Madrid")
    # NULL = sin color propio; el frontend cae al aurora del tema como default
    color: Mapped[str | None] = mapped_column(String(7), default=None)
    # v0.19.x (zurdi: "que se pueda poner foto de perfil"): nombre de fichero
    # (uuid.ext) bajo BK_DATA_DIR/uploads/avatars — mismo esquema que
    # Exercise.image_path (el nombre en disco jamás viene del cliente)
    avatar_path: Mapped[str | None] = mapped_column(String(80), default=None)
    # v0.11.0 (zurdi: "objetivos de peso — cuánto te queda al añadir un
    # peso"): peso corporal objetivo, en kg canónicos; NULL = sin objetivo
    goal_weight_kg: Mapped[float | None] = mapped_column(Float, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    @property
    def has_avatar(self) -> bool:
        # bandera para UserOut (from_attributes lee properties): el cliente
        # pide el fichero a /users/{id}/avatar solo si esto es True
        return self.avatar_path is not None

    sessions: Mapped[list["AuthSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan", passive_deletes=True
    )


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)

    user: Mapped[User] = relationship(back_populates="sessions")


class Invite(Base):
    __tablename__ = "invites"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None, index=True
    )
    used_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)


MEASUREMENTS = ("strength", "bodyweight", "timed", "cardio")


class MuscleGroup(Base):
    __tablename__ = "muscle_groups"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(30))
    name_es: Mapped[str] = mapped_column(String(50))
    name_en: Mapped[str] = mapped_column(String(50))
    # runa dedicada (item 14): antes el frontend derivaba la runa DIRECTO del
    # slug (ver runeResolve.ts), así que solo el subconjunto de grupos
    # "canónicos" (slug == nombre de runa) podía mostrar icono. Con esta
    # columna cualquier grupo (global o propio) puede llevar cualquier runa
    # del futhark sin que su slug tenga que coincidir. NULL = sin runa
    # propia; el frontend cae de vuelta al slug (rune ?? slug, ver
    # runeResolve.groupRune) — así los grupos sembrados antes de esta
    # columna (backfill de la migración) siguen mostrando su icono de siempre.
    rune: Mapped[str | None] = mapped_column(String(30), default=None)
    # NULL = grupo global del seed; con owner = grupo privado del usuario
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), default=None, index=True
    )


class Exercise(Base):
    __tablename__ = "exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    name_es: Mapped[str] = mapped_column(String(80))
    name_en: Mapped[str] = mapped_column(String(80))
    measurement: Mapped[str] = mapped_column(String(10))
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), default=None, index=True
    )
    # W2 feature 1: el dueño sigue siendo el único que edita/borra (_can_edit
    # sin cambios), pero con is_public=True el ejercicio aparece en el
    # listado de CUALQUIER usuario (no solo el propio) y es usable en sus
    # rutinas/entrenos (ver get_visible_exercise) — distinto del catálogo
    # admin (owner_id NULL), que ya era global desde antes de esta columna
    is_public: Mapped[bool] = mapped_column(default=False)
    # v0.12.0 (zurdi: "añadir fotos a un ejercicio para mejor visual"):
    # nombre de fichero (uuid.ext) bajo BK_DATA_DIR/uploads/exercises — la
    # visibilidad de la imagen sigue a la del ejercicio, subirla exige
    # _can_edit (ver routers/media.py)
    image_path: Mapped[str | None] = mapped_column(String(80), default=None)
    # (v0.18.0: el load_mode por-EJERCICIO de la v0.17.x murió — el modo
    # kg/nivel se elige al registrar cada serie, ver WorkoutSet.load_mode:
    # "un día la polea libre es la de kg y otro la de niveles" — zurdi)

    muscle_links: Mapped[list["ExerciseMuscleGroup"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )
    # lazy="select" (default): solo dispara una query extra cuando el
    # serializer pide owner.username (atribución en el listado), el resto de
    # consultas existentes no la pagan
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id])

    @property
    def owner_username(self) -> str | None:
        return self.owner.username if self.owner is not None else None


class ExerciseMuscleGroup(Base):
    __tablename__ = "exercise_muscle_groups"

    exercise_id: Mapped[int] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"), primary_key=True
    )
    muscle_group_id: Mapped[int] = mapped_column(
        ForeignKey("muscle_groups.id", ondelete="CASCADE"), primary_key=True
    )
    is_primary: Mapped[bool] = mapped_column(default=False)


class ShareGrant(Base):
    __tablename__ = "share_grants"
    __table_args__ = (UniqueConstraint("owner_id", "viewer_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    viewer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


PR_KINDS = ("max_weight", "est_1rm", "max_volume")


class Routine(Base):
    __tablename__ = "routines"

    id: Mapped[int] = mapped_column(primary_key=True)
    # ROUTINES-OPEN: nullable desde cca94a818289 — NULL es una plantilla
    # global LEGACY (creada vía el extinto POST .../globalize, que perdía la
    # propiedad). Ya no hay forma de producir owner_id NULL desde la API,
    # pero las filas existentes se mantienen visibles bajo la misma regla que
    # is_global (ver _visible_template/list_templates en routers/routines.py)
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), default=None, index=True
    )
    name: Mapped[str] = mapped_column(String(60))
    description: Mapped[str | None] = mapped_column(String(300), default=None)
    rune: Mapped[str | None] = mapped_column(String(20), default=None)
    color: Mapped[str | None] = mapped_column(String(30), default=None)
    # ROUTINES-OPEN (renombrada desde is_public, migración
    # fbf6cb158a4e_rename_routine_is_public_to_is_global): un check por
    # rutina, editable por CUALQUIER usuario sobre la suya desde el editor —
    # is_global=True la hace visible/usable/duplicable por todo el mundo sin
    # perder la propiedad (a diferencia del viejo flujo globalize). Consumo
    # siempre vía POST .../copy (snapshot, nunca referencia viva).
    is_global: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    exercises: Mapped[list["RoutineExercise"]] = relationship(
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="RoutineExercise.position",
    )
    owner: Mapped[User | None] = relationship(foreign_keys=[owner_id])

    @property
    def owner_username(self) -> str | None:
        return self.owner.username if self.owner is not None else None


class RoutineExercise(Base):
    __tablename__ = "routine_exercises"

    id: Mapped[int] = mapped_column(primary_key=True)
    routine_id: Mapped[int] = mapped_column(
        ForeignKey("routines.id", ondelete="CASCADE"), index=True
    )
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), index=True)
    position: Mapped[int] = mapped_column()
    target_sets: Mapped[int] = mapped_column(default=3)
    target_reps: Mapped[int | None] = mapped_column(default=None)
    target_weight_kg: Mapped[float | None] = mapped_column(Float, default=None)
    rest_seconds: Mapped[int | None] = mapped_column(default=None)
    # v0.5.0 superseries: ejercicios CONTIGUOS (por position) con el mismo
    # valor forman un grupo A1/A2; NULL = suelto. El valor es un índice
    # normalizado (0,1,2…) sin semántica propia — la etiqueta A/B/C que ve el
    # usuario es presentacional (frontend lib/supersets.ts). Se edita SOLO en
    # el editor de rutina; el entreno lo recibe copiado (ver WorkoutExercise)
    superset_group: Mapped[int | None] = mapped_column(default=None)
    # v0.17.0 bloques (zurdi: "definir bloques en las rutinas, cada bloque
    # tiene unos ejercicios y cada step del stepper es un bloque"): nombre
    # del bloque al que pertenece la fila, NULL = sin bloque. El editor
    # mantiene las filas del mismo bloque contiguas, pero los lectores
    # agrupan por ETIQUETA (no por contigüidad, a diferencia de
    # superset_group): un alta posterior no-contigua se recoloca sola en su
    # step. El entreno lo recibe copiado (ver WorkoutExercise).
    block_label: Mapped[str | None] = mapped_column(String(40), default=None)


class Workout(Base):
    __tablename__ = "workouts"
    # los endpoints sync corren en threadpool: el doble-tap del CTA de
    # "empezar entreno" es una carrera real entre dos requests; la DB,
    # no el chequeo previo en Python, es el árbitro final
    __table_args__ = (
        Index(
            "ix_workouts_single_active",
            "owner_id",
            unique=True,
            sqlite_where=text("ended_at IS NULL"),
        ),
        # v0.6.0 offline: replay idempotente — el cliente genera un UUID por
        # "empezar entreno" encolado sin red; si el replay se corta tras
        # insertar pero antes de confirmar al cliente, el reintento encuentra
        # la fila por client_id en vez de duplicarla. Scoped por owner: la
        # búsqueda de dedupe siempre filtra por dueño, el índice solo lo
        # respalda. NULLs no colisionan en SQLite (cada NULL es distinto).
        Index("uq_workouts_owner_client_id", "owner_id", "client_id", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    client_id: Mapped[str | None] = mapped_column(String(36), default=None)
    date: Mapped[date] = mapped_column(Date, index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, default=None)
    routine_id: Mapped[int | None] = mapped_column(
        ForeignKey("routines.id", ondelete="SET NULL"), default=None
    )
    note: Mapped[str | None] = mapped_column(String(500), default=None)
    feeling: Mapped[int | None] = mapped_column(default=None)
    # item 8 (round v0.3.0): "check en el entreno" — si el usuario ha
    # estirado, sin más semántica que esa (no hay minutos/tipo de estiramiento)
    # TODO ronda siguiente: mostrarlo en WorkoutDayInfo (calendario) — surface
    # de un sibling, no tocada por este lane; el campo ya viaja en WorkoutOut
    stretched: Mapped[bool] = mapped_column(default=False)

    exercises: Mapped[list["WorkoutExercise"]] = relationship(
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="WorkoutExercise.position",
    )
    muscle_tags: Mapped[list["WorkoutMuscleGroup"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )


class WorkoutExercise(Base):
    __tablename__ = "workout_exercises"
    # v0.6.0 offline: mismo criterio que Workout.client_id (ver ahí)
    __table_args__ = (
        Index("uq_workout_exercises_workout_client_id", "workout_id", "client_id", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workout_id: Mapped[int] = mapped_column(
        ForeignKey("workouts.id", ondelete="CASCADE"), index=True
    )
    client_id: Mapped[str | None] = mapped_column(String(36), default=None)
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), index=True)
    position: Mapped[int] = mapped_column()
    note: Mapped[str | None] = mapped_column(String(300), default=None)
    # item 11 (round v0.3.0): descanso configurable por ejercicio DEL ENTRENO
    # (no solo de la rutina) — None = "sin override", cae al target de la
    # rutina de origen o al default general (ver services/workouts.py::
    # resolve_rest_seconds y frontend rest.ts::restFor, misma prioridad)
    rest_seconds: Mapped[int | None] = mapped_column(default=None)
    # v0.5.0 superseries: snapshot del grouping de la rutina de origen al
    # empezar el entreno (mismo patrón de copia que rest_seconds). NULL =
    # suelto; los añadidos ad-hoc a un entreno nacen NULL. En v1 no se edita
    # mid-workout — gobierna el gating del auto-descanso (frontend
    # WorkoutExerciseCard: solo descansa el ÚLTIMO miembro del grupo)
    superset_group: Mapped[int | None] = mapped_column(default=None)
    # v0.17.0 bloques: snapshot de RoutineExercise.block_label al empezar
    # (mismo patrón que superset_group). Un alta ad-hoc SÍ puede traer
    # etiqueta (add_exercise la acepta): en el stepper del entreno, añadir un
    # ejercicio mientras miras un bloque lo mete en ESE bloque.
    block_label: Mapped[str | None] = mapped_column(String(40), default=None)

    sets: Mapped[list["WorkoutSet"]] = relationship(
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="WorkoutSet.set_number",
    )


class WorkoutSet(Base):
    # "workout_sets" y no "sets": evita la palabra reservada en consultas a mano
    __tablename__ = "workout_sets"
    # v0.6.0 offline: mismo criterio que Workout.client_id (ver ahí)
    __table_args__ = (
        Index("uq_workout_sets_wex_client_id", "workout_exercise_id", "client_id", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    workout_exercise_id: Mapped[int] = mapped_column(
        ForeignKey("workout_exercises.id", ondelete="CASCADE"), index=True
    )
    client_id: Mapped[str | None] = mapped_column(String(36), default=None)
    set_number: Mapped[int] = mapped_column()
    reps: Mapped[int | None] = mapped_column(default=None)
    weight_kg: Mapped[float | None] = mapped_column(Float, default=None)
    duration_seconds: Mapped[int | None] = mapped_column(default=None)
    distance_m: Mapped[float | None] = mapped_column(Float, default=None)
    is_warmup: Mapped[bool] = mapped_column(default=False)
    rpe: Mapped[int | None] = mapped_column(default=None)
    # v0.18.0 (zurdi: "el modo se pone cuando VAS A HACER el ejercicio"):
    # 'weight' = weight_kg son kg canónicos; 'level' = número plano de
    # máquina guardado tal cual (sin conversión). Por SERIE, no por
    # ejercicio: la misma polea un día tiene etiquetas de kg y otro de
    # niveles. Las series de nivel quedan fuera de todo agregado de volumen
    # (effective_set_filters) y sus PRs compiten solo entre niveles
    # (PersonalRecord.load_mode).
    load_mode: Mapped[str] = mapped_column(String(10), default="weight")
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class WorkoutMuscleGroup(Base):
    __tablename__ = "workout_muscle_groups"

    workout_id: Mapped[int] = mapped_column(
        ForeignKey("workouts.id", ondelete="CASCADE"), primary_key=True
    )
    muscle_group_id: Mapped[int] = mapped_column(
        ForeignKey("muscle_groups.id", ondelete="CASCADE"), primary_key=True
    )


class PersonalRecord(Base):
    __tablename__ = "personal_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    exercise_id: Mapped[int] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(12))
    value: Mapped[float] = mapped_column(Float)
    set_id: Mapped[int | None] = mapped_column(
        ForeignKey("workout_sets.id", ondelete="SET NULL"), default=None
    )
    # v0.18.0: modo de la serie que lo logró — un récord de nivel solo
    # compite contra récords de nivel (detect_prs filtra por esto) y el
    # frontend lo pinta plano sin unidad
    load_mode: Mapped[str] = mapped_column(String(10), default="weight")
    achieved_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ScheduledSession(Base):
    __tablename__ = "scheduled_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date, index=True)
    # nullable explícito: el nombre del campo colisiona con datetime.time en su
    # propia anotación y SQLAlchemy no infiere Optional del Mapped[time | None]
    time: Mapped[time | None] = mapped_column(Time, nullable=True, default=None)
    routine_id: Mapped[int | None] = mapped_column(
        ForeignKey("routines.id", ondelete="SET NULL"), default=None
    )
    status: Mapped[str] = mapped_column(String(8), default="planned")
    workout_id: Mapped[int | None] = mapped_column(
        ForeignKey("workouts.id", ondelete="SET NULL"), default=None
    )
    note: Mapped[str | None] = mapped_column(String(300), default=None)


class RotationEntry(Base):
    """v0.14.0 — plan rotatorio de rutinas (zurdi: "rutina semanal rotatoria:
    siempre te sugiere el siguiente entrenamiento que te toca, en orden").
    Lista ORDENADA por usuario; el puntero de "te toca" NO se guarda: se
    deriva del último entreno TERMINADO cuya rutina esté en la rotación
    (siguiente posición, cíclico) — sin estado que desincronizar si una
    semana queda a medias o se edita el plan."""

    __tablename__ = "routine_rotation"
    __table_args__ = (
        UniqueConstraint("owner_id", "position"),
        # una rutina solo puede aparecer una vez: con duplicados el puntero
        # derivado sería ambiguo
        UniqueConstraint("owner_id", "routine_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    position: Mapped[int] = mapped_column()
    routine_id: Mapped[int] = mapped_column(
        ForeignKey("routines.id", ondelete="CASCADE"), index=True
    )


class RotationState(Base):
    """v0.15.0 — override manual del "te toca" (zurdi: "poder setear el que
    toca hoy"). Gana sobre la derivación por historial hasta CONSUMIRSE:
    cualquier entreno del plan TERMINADO después de set_at lo invalida (la
    rotación sigue desde lo realmente hecho — la regla "siempre en orden" no
    cambia). Tabla aparte de RotationEntry a propósito: el PUT del plan
    reemplaza las entradas enteras y el pin debe sobrevivir a un reorden."""

    __tablename__ = "rotation_state"

    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    routine_id: Mapped[int] = mapped_column(
        ForeignKey("routines.id", ondelete="CASCADE")
    )
    set_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class ExerciseNote(Base):
    """v0.12.0 — nota persistente POR USUARIO y ejercicio ("asiento en el 5,
    agarre ancho"): se enseña en la card del entreno la siguiente sesión.
    Upsert por (user, exercise); nota vacía = borrar (ver routers)."""

    __tablename__ = "exercise_notes"
    __table_args__ = (UniqueConstraint("user_id", "exercise_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    exercise_id: Mapped[int] = mapped_column(
        ForeignKey("exercises.id", ondelete="CASCADE"), index=True
    )
    note: Mapped[str] = mapped_column(String(500))


class BodyPhoto(Base):
    """v0.12.0 — foto de progreso PRIVADA del usuario (no viaja por sharing):
    fichero uuid.ext bajo BK_DATA_DIR/uploads/body, asociada a una fecha para
    el comparador antes/después."""

    __tablename__ = "body_photos"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date)
    path: Mapped[str] = mapped_column(String(80))


class BodyEntry(Base):
    __tablename__ = "body_entries"
    __table_args__ = (UniqueConstraint("owner_id", "date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    date: Mapped[date] = mapped_column(Date)
    weight_kg: Mapped[float | None] = mapped_column(Float, default=None)
    waist_cm: Mapped[float | None] = mapped_column(Float, default=None)
    chest_cm: Mapped[float | None] = mapped_column(Float, default=None)
    arm_cm: Mapped[float | None] = mapped_column(Float, default=None)
    thigh_cm: Mapped[float | None] = mapped_column(Float, default=None)
    hip_cm: Mapped[float | None] = mapped_column(Float, default=None)
