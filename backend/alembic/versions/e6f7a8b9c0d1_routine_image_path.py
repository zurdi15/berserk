"""imagen propia de la rutina

v0.20.x (zurdi: "que la imagen de hero de una rutina no sea la de un
ejercicio, si no que sea la runa, a no ser que se añada la imagen
específicamente al editar la rutina"): columna image_path en routines —
fichero uuid.ext bajo BK_DATA_DIR/uploads/routines, mismo esquema que
Exercise.image_path (ver routers/media.py).

Revision ID: e6f7a8b9c0d1
Revises: d5e6f7a8b9c0
Create Date: 2026-08-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e6f7a8b9c0d1'
down_revision: Union[str, Sequence[str], None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('routines', sa.Column('image_path', sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column('routines', 'image_path')
