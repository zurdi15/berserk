"""Catálogo global: 7 grupos musculares y ejercicios comunes con nombres ES/EN.

Idempotente por conteo: solo siembra cuando no hay filas globales, así los
usuarios pueden borrar/ignorar el catálogo sin que reaparezca en cada arranque.
"""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Exercise, ExerciseMuscleGroup, MuscleGroup

SEED_MUSCLE_GROUPS = [
    ("chest", "Pecho", "Chest"),
    ("back", "Espalda", "Back"),
    ("biceps", "Bíceps", "Biceps"),
    ("triceps", "Tríceps", "Triceps"),
    ("shoulders", "Hombros", "Shoulders"),
    ("legs", "Piernas", "Legs"),
    ("core", "Core", "Core"),
]

# (name_es, name_en, measurement, primary_slug, [secondary_slugs])
SEED_EXERCISES = [
    # Pecho
    ("Press banca", "Bench press", "strength", "chest", ["triceps", "shoulders"]),
    ("Press banca inclinado", "Incline bench press", "strength", "chest", ["shoulders", "triceps"]),
    ("Press banca declinado", "Decline bench press", "strength", "chest", ["triceps"]),
    ("Press con mancuernas", "Dumbbell press", "strength", "chest", ["triceps", "shoulders"]),
    ("Aperturas con mancuernas", "Dumbbell fly", "strength", "chest", []),
    ("Cruces en polea", "Cable crossover", "strength", "chest", []),
    ("Fondos en paralelas", "Dips", "bodyweight", "chest", ["triceps", "shoulders"]),
    ("Flexiones", "Push-ups", "bodyweight", "chest", ["triceps", "core"]),
    ("Máquina de press", "Chest press machine", "strength", "chest", ["triceps"]),
    # Espalda
    ("Peso muerto", "Deadlift", "strength", "back", ["legs", "core"]),
    ("Dominadas", "Pull-ups", "bodyweight", "back", ["biceps"]),
    ("Dominadas supinas", "Chin-ups", "bodyweight", "back", ["biceps"]),
    ("Remo con barra", "Barbell row", "strength", "back", ["biceps"]),
    ("Remo con mancuerna", "Dumbbell row", "strength", "back", ["biceps"]),
    ("Jalón al pecho", "Lat pulldown", "strength", "back", ["biceps"]),
    ("Remo en polea baja", "Seated cable row", "strength", "back", ["biceps"]),
    ("Remo en máquina", "Machine row", "strength", "back", ["biceps"]),
    ("Pull-over", "Pull-over", "strength", "back", ["chest"]),
    ("Hiperextensiones", "Back extensions", "bodyweight", "back", ["legs", "core"]),
    # Bíceps
    ("Curl con barra", "Barbell curl", "strength", "biceps", []),
    ("Curl con mancuernas", "Dumbbell curl", "strength", "biceps", []),
    ("Curl martillo", "Hammer curl", "strength", "biceps", []),
    ("Curl en predicador", "Preacher curl", "strength", "biceps", []),
    ("Curl en polea", "Cable curl", "strength", "biceps", []),
    # Tríceps
    ("Press francés", "Skull crusher", "strength", "triceps", []),
    ("Extensión en polea", "Triceps pushdown", "strength", "triceps", []),
    ("Extensión sobre cabeza", "Overhead triceps extension", "strength", "triceps", []),
    ("Fondos entre bancos", "Bench dips", "bodyweight", "triceps", ["shoulders"]),
    ("Press cerrado", "Close-grip bench press", "strength", "triceps", ["chest"]),
    # Hombros
    ("Press militar", "Overhead press", "strength", "shoulders", ["triceps", "core"]),
    ("Press Arnold", "Arnold press", "strength", "shoulders", ["triceps"]),
    ("Elevaciones laterales", "Lateral raises", "strength", "shoulders", []),
    ("Elevaciones frontales", "Front raises", "strength", "shoulders", []),
    ("Pájaros", "Rear delt fly", "strength", "shoulders", ["back"]),
    ("Face pull", "Face pull", "strength", "shoulders", ["back"]),
    ("Encogimientos", "Shrugs", "strength", "shoulders", ["back"]),
    # Piernas
    ("Sentadilla", "Squat", "strength", "legs", ["core"]),
    ("Sentadilla frontal", "Front squat", "strength", "legs", ["core"]),
    ("Prensa de piernas", "Leg press", "strength", "legs", []),
    ("Zancadas", "Lunges", "strength", "legs", ["core"]),
    ("Peso muerto rumano", "Romanian deadlift", "strength", "legs", ["back"]),
    ("Extensión de cuádriceps", "Leg extension", "strength", "legs", []),
    ("Curl femoral", "Leg curl", "strength", "legs", []),
    ("Hip thrust", "Hip thrust", "strength", "legs", ["core"]),
    ("Elevación de gemelos", "Calf raises", "strength", "legs", []),
    ("Sentadilla búlgara", "Bulgarian split squat", "strength", "legs", ["core"]),
    # Core
    ("Plancha", "Plank", "timed", "core", []),
    ("Plancha lateral", "Side plank", "timed", "core", []),
    ("Crunch", "Crunch", "bodyweight", "core", []),
    ("Elevaciones de piernas", "Leg raises", "bodyweight", "core", []),
    ("Rueda abdominal", "Ab wheel rollout", "bodyweight", "core", ["back"]),
    ("Russian twist", "Russian twist", "bodyweight", "core", []),
    ("Farmer walk", "Farmer walk", "timed", "core", ["back", "legs"]),
    # Cardio
    ("Cinta de correr", "Treadmill", "cardio", "legs", []),
    ("Bicicleta estática", "Stationary bike", "cardio", "legs", []),
    ("Elíptica", "Elliptical", "cardio", "legs", []),
    ("Remo ergómetro", "Rowing machine", "cardio", "back", ["legs", "core"]),
    ("Comba", "Jump rope", "cardio", "legs", ["core"]),
    ("Escaleras", "Stair climber", "cardio", "legs", []),
]


def ensure_catalog(db: Session) -> None:
    if db.scalar(select(func.count(MuscleGroup.id)).where(MuscleGroup.owner_id.is_(None))):
        return
    groups: dict[str, MuscleGroup] = {}
    for slug, name_es, name_en in SEED_MUSCLE_GROUPS:
        group = MuscleGroup(slug=slug, name_es=name_es, name_en=name_en)
        db.add(group)
        groups[slug] = group
    db.flush()
    for name_es, name_en, measurement, primary, secondaries in SEED_EXERCISES:
        exercise = Exercise(name_es=name_es, name_en=name_en, measurement=measurement)
        db.add(exercise)
        db.flush()
        db.add(
            ExerciseMuscleGroup(
                exercise_id=exercise.id, muscle_group_id=groups[primary].id, is_primary=True
            )
        )
        for slug in secondaries:
            db.add(
                ExerciseMuscleGroup(
                    exercise_id=exercise.id, muscle_group_id=groups[slug].id, is_primary=False
                )
            )
    db.commit()
