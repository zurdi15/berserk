"""muscle group rune column

Revision ID: 54870c586688
Revises: 37bd10b715d5
Create Date: 2026-08-07 00:27:08.510595

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '54870c586688'
down_revision: Union[str, Sequence[str], None] = '37bd10b715d5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# item 14: los 7 grupos musculares que app/seed.py siembra (SEED_MUSCLE_GROUPS)
# tienen un slug que YA coincide 1:1 con una clave de RUNES en el frontend
# (chest/back/biceps/triceps/shoulders/legs/core — ver frontend/src/lib/
# runes.ts) porque, antes de esta columna, el frontend derivaba la runa
# DIRECTO del slug. Backfillear rune=slug para justo este set conserva el
# icono que ya se veía en cualquier instancia desplegada; un grupo custom de
# usuario con un slug fuera de este set nunca tuvo una runa asociada, así que
# se queda con rune NULL (cae al slug igualmente vía runeResolve.groupRune,
# pero sin fingir que fue una asignación deliberada).
_KNOWN_GROUP_RUNE_SLUGS = (
    "chest", "back", "biceps", "triceps", "shoulders", "legs", "core",
)


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('muscle_groups', schema=None) as batch_op:
        batch_op.add_column(sa.Column('rune', sa.String(length=30), nullable=True))

    muscle_groups = sa.table(
        'muscle_groups',
        sa.column('slug', sa.String),
        sa.column('rune', sa.String),
    )
    op.execute(
        muscle_groups.update()
        .where(muscle_groups.c.slug.in_(_KNOWN_GROUP_RUNE_SLUGS))
        .values(rune=muscle_groups.c.slug)
    )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('muscle_groups', schema=None) as batch_op:
        batch_op.drop_column('rune')
