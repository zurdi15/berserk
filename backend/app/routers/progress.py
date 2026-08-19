from datetime import date as date_type
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import PersonalRecord, Workout
from ..permissions import TargetUser
from ..schemas.progress import (
    DistributionItem,
    ExerciseHistoryOut,
    ExerciseSessionOut,
    HeatmapDay,
    SeriesOut,
    StatsOut,
    StreakOut,
    TrainedExercisesOut,
)
from ..schemas.workouts import PersonalRecordOut
from ..services.progress import (
    annual_heatmap,
    exercise_series,
    exercise_sessions,
    latest_exercise_session,
    recent_cardio_entries,
    lifetime_stats,
    muscle_distribution,
    trained_exercise_ids,
    weekly_streak,
)
from .exercises import get_visible_exercise

router = APIRouter(prefix="/progress", tags=["progress"])


@router.get("/exercises/{exercise_id}", response_model=SeriesOut)
def series(exercise_id: int, target: TargetUser, db: Session = Depends(get_db)):
    if get_visible_exercise(db, target.id, exercise_id) is None:
        raise HTTPException(status_code=404, detail="not_found")
    return SeriesOut(series=exercise_series(db, target.id, exercise_id))


@router.get("/exercise-history/{exercise_id}", response_model=ExerciseHistoryOut | None)
def exercise_history(
    exercise_id: int,
    target: TargetUser,
    db: Session = Depends(get_db),
    exclude_workout_id: int | None = Query(default=None),
):
    exercise = get_visible_exercise(db, target.id, exercise_id)
    if exercise is None:
        raise HTTPException(status_code=404, detail="not_found")
    result = latest_exercise_session(db, target.id, exercise_id, exclude_workout_id)
    if result is None:
        return None
    # v0.10.0 (zurdi): las últimas 4 veces de cardio viajan con el historial
    # — solo para ejercicios de cardio, el resto no las necesita
    recent = (
        recent_cardio_entries(db, target.id, exercise_id, exclude_workout_id)
        if exercise.measurement == "cardio"
        else []
    )
    return ExerciseHistoryOut(**result, recent_cardio=recent)


@router.get("/exercise-sessions/{exercise_id}", response_model=list[ExerciseSessionOut])
def sessions(
    exercise_id: int,
    target: TargetUser,
    db: Session = Depends(get_db),
    limit: int = Query(default=50, ge=1, le=200),
):
    # v0.24.0: historial completo por sesión para la vista detalle
    if get_visible_exercise(db, target.id, exercise_id) is None:
        raise HTTPException(status_code=404, detail="not_found")
    return exercise_sessions(db, target.id, exercise_id, limit)


@router.get("/records", response_model=list[PersonalRecordOut])
def records(
    target: TargetUser,
    db: Session = Depends(get_db),
    exercise_id: int | None = Query(default=None),
):
    query = select(PersonalRecord).where(PersonalRecord.owner_id == target.id)
    if exercise_id is not None:
        query = query.where(PersonalRecord.exercise_id == exercise_id)
    return db.scalars(query.order_by(PersonalRecord.achieved_at.desc())).all()


@router.get("/heatmap/{year}", response_model=list[HeatmapDay])
def heatmap(
    target: TargetUser,
    year: int = Path(ge=2000, le=2100),
    db: Session = Depends(get_db),
):
    return [HeatmapDay(date=d, count=c) for d, c in annual_heatmap(db, target.id, year)]


@router.get("/streak", response_model=StreakOut)
def streak(target: TargetUser, db: Session = Depends(get_db)):
    dates = db.scalars(select(Workout.date).where(Workout.owner_id == target.id)).all()
    # racha sobre la fecha del servidor: app personal, margen de una semana entera
    return StreakOut(weeks=weekly_streak(dates, today=date_type.today()))


@router.get("/trained-exercises", response_model=TrainedExercisesOut)
def trained_exercises(target: TargetUser, db: Session = Depends(get_db)):
    return TrainedExercisesOut(exercise_ids=sorted(trained_exercise_ids(db, target.id)))


@router.get("/stats", response_model=StatsOut)
def stats(target: TargetUser, db: Session = Depends(get_db)):
    return StatsOut(**lifetime_stats(db, target.id))


@router.get("/muscle-distribution", response_model=list[DistributionItem])
def distribution(
    target: TargetUser,
    db: Session = Depends(get_db),
    weeks: int = Query(default=4, ge=1, le=52),
):
    end = date_type.today()
    start = end - timedelta(weeks=weeks)
    dist = muscle_distribution(db, target.id, start=start, end=end)
    return [
        DistributionItem(muscle_group_id=gid, sets=count)
        for gid, count in sorted(dist.items())
    ]
