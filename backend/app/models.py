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
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

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

    muscle_links: Mapped[list["ExerciseMuscleGroup"]] = relationship(
        cascade="all, delete-orphan", passive_deletes=True
    )


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
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(60))
    description: Mapped[str | None] = mapped_column(String(300), default=None)
    rune: Mapped[str | None] = mapped_column(String(20), default=None)
    color: Mapped[str | None] = mapped_column(String(30), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    exercises: Mapped[list["RoutineExercise"]] = relationship(
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="RoutineExercise.position",
    )


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
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
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

    id: Mapped[int] = mapped_column(primary_key=True)
    workout_id: Mapped[int] = mapped_column(
        ForeignKey("workouts.id", ondelete="CASCADE"), index=True
    )
    exercise_id: Mapped[int] = mapped_column(ForeignKey("exercises.id"), index=True)
    position: Mapped[int] = mapped_column()
    note: Mapped[str | None] = mapped_column(String(300), default=None)

    sets: Mapped[list["WorkoutSet"]] = relationship(
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="WorkoutSet.set_number",
    )


class WorkoutSet(Base):
    # "workout_sets" y no "sets": evita la palabra reservada en consultas a mano
    __tablename__ = "workout_sets"

    id: Mapped[int] = mapped_column(primary_key=True)
    workout_exercise_id: Mapped[int] = mapped_column(
        ForeignKey("workout_exercises.id", ondelete="CASCADE"), index=True
    )
    set_number: Mapped[int] = mapped_column()
    reps: Mapped[int | None] = mapped_column(default=None)
    weight_kg: Mapped[float | None] = mapped_column(Float, default=None)
    duration_seconds: Mapped[int | None] = mapped_column(default=None)
    distance_m: Mapped[float | None] = mapped_column(Float, default=None)
    is_warmup: Mapped[bool] = mapped_column(default=False)
    rpe: Mapped[int | None] = mapped_column(default=None)
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
