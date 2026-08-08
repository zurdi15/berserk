"""media (exercise image, body photos) and per-user exercise notes

v0.12.0 (zurdi): (1) "añadir fotos a un ejercicio de la biblioteca" —
exercises.image_path; (2) fotos de progreso privadas en Cuerpo —
body_photos; (3) notas persistentes por ejercicio — exercise_notes.
Sin datos que sembrar: solo esquema, seguro en instancias frescas.

Revision ID: 8f3a21c90d47
Revises: 664da4568810
Create Date: 2026-08-08

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '8f3a21c90d47'
down_revision: Union[str, Sequence[str], None] = '664da4568810'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("exercises", sa.Column("image_path", sa.String(80), nullable=True))
    op.create_table(
        "exercise_notes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column(
            "exercise_id",
            sa.Integer(),
            sa.ForeignKey("exercises.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("note", sa.String(500), nullable=False),
        sa.UniqueConstraint("user_id", "exercise_id"),
    )
    op.create_table(
        "body_photos",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "owner_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("path", sa.String(80), nullable=False),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table("body_photos")
    op.drop_table("exercise_notes")
    op.drop_column("exercises", "image_path")
