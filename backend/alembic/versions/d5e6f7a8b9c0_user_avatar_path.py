"""foto de perfil del usuario

v0.19.x (zurdi: "haz que se pueda poner foto de perfil"): columna
avatar_path en users — nombre de fichero (uuid.ext) bajo
BK_DATA_DIR/uploads/avatars, mismo esquema que Exercise.image_path (el
nombre en disco jamás viene del cliente; el GET localiza por id de usuario,
nunca por path arbitrario — ver routers/media.py).

Revision ID: d5e6f7a8b9c0
Revises: c9d0e1f2a3b4
Create Date: 2026-08-19

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, Sequence[str], None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('avatar_path', sa.String(length=80), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'avatar_path')
