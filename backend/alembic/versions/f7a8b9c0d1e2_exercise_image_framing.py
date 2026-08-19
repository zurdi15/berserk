"""encuadre de la imagen del ejercicio (posición + zoom)

v0.21.4 (zurdi: "la preview debería ser 9:16 como luego se ve, y molaría
mover la imagen y hacer zoom para encuadrarla — tal cual quede en la
preview es como se ve en los ejercicios"): tres columnas de encuadre en
exercises — posición focal en % (50/50 = centrada) y zoom (1 = sin zoom).
El frontend las aplica como object-position + transform scale con el mismo
origen, así el encuadre es WYSIWYG en cualquier superficie 9:16. Solo
esquema, segura en instancias frescas.

Revision ID: f7a8b9c0d1e2
Revises: e6f7a8b9c0d1
Create Date: 2026-08-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'f7a8b9c0d1e2'
down_revision: Union[str, Sequence[str], None] = 'e6f7a8b9c0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "exercises",
        sa.Column("image_pos_x", sa.Float(), nullable=False, server_default="50"),
    )
    op.add_column(
        "exercises",
        sa.Column("image_pos_y", sa.Float(), nullable=False, server_default="50"),
    )
    op.add_column(
        "exercises",
        sa.Column("image_zoom", sa.Float(), nullable=False, server_default="1"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("exercises", "image_zoom")
    op.drop_column("exercises", "image_pos_y")
    op.drop_column("exercises", "image_pos_x")
