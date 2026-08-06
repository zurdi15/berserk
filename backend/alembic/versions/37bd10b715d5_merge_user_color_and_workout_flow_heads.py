"""merge user color and workout flow heads

Revision ID: 37bd10b715d5
Revises: 373083857bd5, 4d8d5ec665aa
Create Date: 2026-08-06 23:36:58.104537

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '37bd10b715d5'
down_revision: Union[str, Sequence[str], None] = ('373083857bd5', '4d8d5ec665aa')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
