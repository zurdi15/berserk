"""cardio muscle group and user goal weight

v0.11.0 (zurdi): (1) "un grupo debería ser cardio y que salga en todos los
selectores" — grupo global sembrado (slug 'cardio', runa raidho: viaje/
movimiento) y enlace primario a todo ejercicio de measurement 'cardio' que
no tenga ya un grupo primario; (2) users.goal_weight_kg para el objetivo de
peso corporal ("cuánto te queda para tu objetivo al añadir un peso").

Revision ID: 664da4568810
Revises: 793c276167f9
Create Date: 2026-08-07

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '664da4568810'
down_revision: Union[str, Sequence[str], None] = '793c276167f9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("users", sa.Column("goal_weight_kg", sa.Float(), nullable=True))

    conn = op.get_bind()
    # SOLO en instancias YA SEMBRADAS: en una DB fresca las migraciones corren
    # ANTES del seed de arranque, y pre-crear un grupo aquí haría que
    # ensure_catalog (idempotente por conteo de grupos globales) se creyera
    # sembrado y saltara el catálogo entero — instancia nueva sin ejercicios.
    # Las frescas reciben cardio del propio seed (ver app/seed.py).
    seeded = conn.execute(sa.text("SELECT COUNT(*) FROM exercises")).scalar()
    if not seeded:
        return

    existing = conn.execute(
        sa.text("SELECT id FROM muscle_groups WHERE slug = 'cardio' AND owner_id IS NULL")
    ).first()
    if existing is None:
        conn.execute(
            sa.text(
                "INSERT INTO muscle_groups (slug, name_es, name_en, rune, owner_id) "
                "VALUES ('cardio', 'Cardio', 'Cardio', 'raidho', NULL)"
            )
        )
    group_id = conn.execute(
        sa.text("SELECT id FROM muscle_groups WHERE slug = 'cardio' AND owner_id IS NULL")
    ).scalar()

    # el grupo cardio pasa a ser el PRIMARIO de todo ejercicio de cardio
    # (paridad con el seed nuevo): sus primarios musculares anteriores
    # degradan a secundarios
    conn.execute(
        sa.text(
            """
            UPDATE exercise_muscle_groups SET is_primary = 0
            WHERE is_primary = 1
              AND muscle_group_id != :gid
              AND exercise_id IN (SELECT id FROM exercises WHERE measurement = 'cardio')
            """
        ),
        {"gid": group_id},
    )
    conn.execute(
        sa.text(
            """
            INSERT INTO exercise_muscle_groups (exercise_id, muscle_group_id, is_primary)
            SELECT e.id, :gid, 1
            FROM exercises e
            WHERE e.measurement = 'cardio'
              AND NOT EXISTS (
                  SELECT 1 FROM exercise_muscle_groups l
                  WHERE l.exercise_id = e.id AND l.muscle_group_id = :gid
              )
            """
        ),
        {"gid": group_id},
    )


def downgrade() -> None:
    """Downgrade schema."""
    conn = op.get_bind()
    group_id = conn.execute(
        sa.text("SELECT id FROM muscle_groups WHERE slug = 'cardio' AND owner_id IS NULL")
    ).scalar()
    if group_id is not None:
        conn.execute(
            sa.text("DELETE FROM exercise_muscle_groups WHERE muscle_group_id = :gid"),
            {"gid": group_id},
        )
        conn.execute(sa.text("DELETE FROM muscle_groups WHERE id = :gid"), {"gid": group_id})
    op.drop_column("users", "goal_weight_kg")
