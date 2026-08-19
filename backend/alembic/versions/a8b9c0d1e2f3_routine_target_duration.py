"""tiempo objetivo del cardio en rutinas

v0.23.0 (zurdi: "los ejercicios de cardio tienen series objetivo pero
debería ser tiempo objetivo; y en el pre-inicio, en cardio pon tiempo, no
series"): target_duration_seconds nullable en routine_exercises — solo con
sentido en cardio/timed; NULL = sin objetivo. Solo esquema, segura en
instancias frescas.

Revision ID: a8b9c0d1e2f3
Revises: f7a8b9c0d1e2
Create Date: 2026-08-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a8b9c0d1e2f3'
down_revision: Union[str, Sequence[str], None] = 'f7a8b9c0d1e2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "routine_exercises",
        sa.Column("target_duration_seconds", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("routine_exercises", "target_duration_seconds")
