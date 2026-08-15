"""v0.12.0 — feed social (zurdi: "feed de actividad de usuarios compartidos
en Hoy + comparativas amistosas de streak/volumen semanal").

Solo LECTURA sobre lo que el sharing ya permite ver: los eventos salen de
los usuarios que comparten SU registro conmigo (yo soy viewer). La
comparativa me incluye a mí — sin rivales sigue siendo útil como resumen
semanal propio, y el frontend decide si la pinta.
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import CurrentUser
from ..db import get_db
from ..models import (
    MuscleGroup,
    PersonalRecord,
    ShareGrant,
    User,
    Workout,
    WorkoutExercise,
    WorkoutSet,
)
from ..schemas.social import FeedComparisonRow, FeedEvent, FeedOut, FeedUser
from ..services.progress import weekly_streak, workout_muscle_group_ids
from ..services.workout_sets import effective_set_filters

router = APIRouter(prefix="/social", tags=["social"])

FEED_DAYS = 7


def _feed_user(user: User) -> FeedUser:
    return FeedUser(id=user.id, username=user.username, color=user.color)


def _week_start(today: date) -> date:
    return today - timedelta(days=today.weekday())


def _volumes_by_workout(db: Session, workout_ids: list[int]) -> dict[int, float]:
    if not workout_ids:
        return {}
    rows = db.execute(
        select(
            WorkoutExercise.workout_id,
            func.coalesce(func.sum(WorkoutSet.reps * WorkoutSet.weight_kg), 0.0),
        )
        .join(WorkoutSet, WorkoutSet.workout_exercise_id == WorkoutExercise.id)
        # v0.18.0: effective_set_filters ya excluye las series en modo nivel
        .where(WorkoutExercise.workout_id.in_(workout_ids), *effective_set_filters())
        .group_by(WorkoutExercise.workout_id)
    ).all()
    return {int(workout_id): float(volume) for workout_id, volume in rows}


def _pr_counts_by_workout(db: Session, workout_ids: list[int]) -> dict[int, int]:
    if not workout_ids:
        return {}
    rows = db.execute(
        select(WorkoutExercise.workout_id, func.count(PersonalRecord.id))
        .join(WorkoutSet, WorkoutSet.workout_exercise_id == WorkoutExercise.id)
        .join(PersonalRecord, PersonalRecord.set_id == WorkoutSet.id)
        .where(WorkoutExercise.workout_id.in_(workout_ids))
        .group_by(WorkoutExercise.workout_id)
    ).all()
    return {int(workout_id): int(count) for workout_id, count in rows}


def _comparison_row(db: Session, user: User, today: date, is_me: bool) -> FeedComparisonRow:
    dates = [
        row[0]
        for row in db.execute(
            select(Workout.date).where(
                Workout.owner_id == user.id, Workout.ended_at.is_not(None)
            )
        ).all()
    ]
    week_start = _week_start(today)
    week_ids = [
        int(row[0])
        for row in db.execute(
            select(Workout.id).where(
                Workout.owner_id == user.id,
                Workout.ended_at.is_not(None),
                Workout.date >= week_start,
                Workout.date <= today,
            )
        ).all()
    ]
    week_volume = sum(_volumes_by_workout(db, week_ids).values())
    return FeedComparisonRow(
        user=_feed_user(user),
        is_me=is_me,
        streak_weeks=weekly_streak(dates, today),
        week_workouts=len(week_ids),
        week_volume_kg=round(week_volume, 1),
    )


@router.get("/feed", response_model=FeedOut)
def get_feed(user: CurrentUser, db: Session = Depends(get_db)):
    sharers = db.scalars(
        select(User)
        .join(ShareGrant, ShareGrant.owner_id == User.id)
        .where(ShareGrant.viewer_id == user.id)
        .order_by(User.username)
    ).all()

    today = date.today()
    events: list[FeedEvent] = []
    if sharers:
        since = today - timedelta(days=FEED_DAYS)
        workouts = db.execute(
            select(Workout, User)
            .join(User, User.id == Workout.owner_id)
            .where(
                Workout.owner_id.in_([s.id for s in sharers]),
                Workout.ended_at.is_not(None),
                Workout.date >= since,
            )
            .order_by(Workout.date.desc(), Workout.id.desc())
        ).all()
        workout_ids = [w.id for w, _ in workouts]
        groups_by_workout = workout_muscle_group_ids(db, workout_ids)
        all_group_ids = {gid for ids in groups_by_workout.values() for gid in ids}
        group_names = {
            g.id: g
            for g in db.scalars(
                select(MuscleGroup).where(MuscleGroup.id.in_(all_group_ids))
            ).all()
        } if all_group_ids else {}
        volumes = _volumes_by_workout(db, workout_ids)
        pr_counts = _pr_counts_by_workout(db, workout_ids)

        for workout, owner in workouts:
            duration = 0
            if workout.started_at is not None and workout.ended_at is not None:
                duration = max(0, int((workout.ended_at - workout.started_at).total_seconds()))
            groups = [
                group_names[gid]
                for gid in sorted(groups_by_workout.get(workout.id, set()))
                if gid in group_names
            ]
            events.append(
                FeedEvent(
                    user=_feed_user(owner),
                    workout_id=workout.id,
                    date=workout.date,
                    duration_seconds=duration,
                    muscle_groups_es=[g.name_es for g in groups],
                    muscle_groups_en=[g.name_en for g in groups],
                    pr_count=pr_counts.get(workout.id, 0),
                    volume_kg=round(volumes.get(workout.id, 0.0), 1),
                )
            )

    comparison = [_comparison_row(db, user, today, is_me=True)] + [
        _comparison_row(db, sharer, today, is_me=False) for sharer in sharers
    ]
    return FeedOut(events=events, comparison=comparison)
