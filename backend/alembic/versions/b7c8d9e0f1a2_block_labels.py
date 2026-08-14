"""block labels en rutinas y entrenos

v0.17.0 (zurdi: "que puedas definir bloques en las rutinas o entrenamientos,
cada bloque tiene unos ejercicios y cada step del stepper es un bloque"):
columna block_label en routine_exercises y workout_exercises — NULL = sin
bloque. Mismo patrón de snapshot que superset_group: la rutina define, el
entreno copia al empezar. Solo esquema, segura en instancias frescas.

Revision ID: b7c8d9e0f1a2
Revises: a1f2c3d4e5b6
Create Date: 2026-08-14

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, Sequence[str], None] = 'a1f2c3d4e5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "routine_exercises",
        sa.Column("block_label", sa.String(length=40), nullable=True),
    )
    op.add_column(
        "workout_exercises",
        sa.Column("block_label", sa.String(length=40), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("workout_exercises", "block_label")
    op.drop_column("routine_exercises", "block_label")
