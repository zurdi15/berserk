"""routine templates

Revision ID: cca94a818289
Revises: ff442e18f01d
Create Date: 2026-08-07 01:11:01.215878

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'cca94a818289'
down_revision: Union[str, Sequence[str], None] = 'ff442e18f01d'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # W2 feature 2: is_public (compartir una rutina propia como plantilla,
    # mismo patrón que exercises.is_public de ff442e18f01d) + owner_id ahora
    # nullable (NULL = plantilla GLOBAL creada por un admin, mirror de
    # Exercise/MuscleGroup owner_id NULL). Ambos cambios en un solo batch:
    # SQLite reconstruye la tabla una vez para las dos alteraciones.
    with op.batch_alter_table('routines', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('is_public', sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.alter_column('owner_id', existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('routines', schema=None) as batch_op:
        batch_op.alter_column('owner_id', existing_type=sa.Integer(), nullable=False)
        batch_op.drop_column('is_public')
