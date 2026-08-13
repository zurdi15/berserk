"""rotation manual next override

v0.15.0 (zurdi): fijar a mano "el que toca hoy" en el plan rotatorio —
override que se consume al terminar cualquier entreno del plan. Solo
esquema, segura en instancias frescas.

Revision ID: e7b83f5c1a09
Revises: c4d19ab7e2f1
Create Date: 2026-08-10

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e7b83f5c1a09'
down_revision: Union[str, Sequence[str], None] = 'c4d19ab7e2f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "rotation_state",
        sa.Column(
            "owner_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "routine_id",
            sa.Integer(),
            sa.ForeignKey("routines.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("set_at", sa.DateTime(), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("rotation_state")
