"""exercise public flag

Revision ID: ff442e18f01d
Revises: 54870c586688
Create Date: 2026-08-07 01:11:01.215878

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ff442e18f01d'
down_revision: Union[str, Sequence[str], None] = '54870c586688'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    # W2 feature 1: "los ejercicios que añade un user que tengan un check de
    # globales para que otros usuarios puedan verlos" — server_default a
    # mano (mismo motivo que 'stretched' en 55d9b0947067): NOT NULL sobre
    # filas ya existentes exige un valor de relleno para el batch rebuild
    # de SQLite, y se conserva tras el ADD COLUMN para que un INSERT futuro
    # fuera del ORM también caiga en False.
    with op.batch_alter_table('exercises', schema=None) as batch_op:
        batch_op.add_column(
            sa.Column('is_public', sa.Boolean(), nullable=False, server_default=sa.false())
        )


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('exercises', schema=None) as batch_op:
        batch_op.drop_column('is_public')
