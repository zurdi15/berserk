"""rename routine is_public to is_global

Revision ID: fbf6cb158a4e
Revises: cca94a818289
Create Date: 2026-08-07 12:13:15.859186

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fbf6cb158a4e'
down_revision: Union[str, Sequence[str], None] = 'cca94a818289'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # ROUTINES-OPEN (course correction de zurdi): el gate de visibilidad
    # sobrevive, solo cambia de nombre/semántica de lectura ("plantilla
    # pública" -> "rutina global") — no se dropea la columna, se renombra.
    # SQLite necesita batch mode para el RENAME COLUMN.
    with op.batch_alter_table('routines', schema=None) as batch_op:
        batch_op.alter_column(
            'is_public',
            new_column_name='is_global',
            existing_type=sa.Boolean(),
            existing_nullable=False,
            existing_server_default=sa.false(),
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('routines', schema=None) as batch_op:
        batch_op.alter_column(
            'is_global',
            new_column_name='is_public',
            existing_type=sa.Boolean(),
            existing_nullable=False,
            existing_server_default=sa.false(),
        )
