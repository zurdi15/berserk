"""routine rotation plan

v0.14.0 (zurdi): plan rotatorio de rutinas — lista ordenada por usuario;
el "te toca" se deriva del historial, sin columnas de estado. Solo esquema,
segura en instancias frescas.

Revision ID: c4d19ab7e2f1
Revises: 8f3a21c90d47
Create Date: 2026-08-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c4d19ab7e2f1'
down_revision: Union[str, Sequence[str], None] = '8f3a21c90d47'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "routine_rotation",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "owner_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "routine_id",
            sa.Integer(),
            sa.ForeignKey("routines.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.UniqueConstraint("owner_id", "position"),
        sa.UniqueConstraint("owner_id", "routine_id"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("routine_rotation")
