"""client_id idempotency columns

v0.6.0 offline de gimnasio: el cliente encola mutaciones sin red con un UUID
propio (client_id) y las reproduce al recuperar conexión — si el replay se
corta tras insertar pero antes de confirmar, el reintento encuentra la fila
por client_id en vez de duplicarla (ver los dedupe en routers/workouts.py).
Índices únicos scoped al padre (owner/workout/workout_exercise): los NULL no
colisionan en SQLite, así que el flujo online normal (sin client_id) no paga
nada.

Revision ID: 793c276167f9
Revises: 1162ad243925
Create Date: 2026-08-07 15:43:39.397245

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '793c276167f9'
down_revision: Union[str, Sequence[str], None] = '1162ad243925'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES = (
    ("workouts", "owner_id", "uq_workouts_owner_client_id"),
    ("workout_exercises", "workout_id", "uq_workout_exercises_workout_client_id"),
    ("workout_sets", "workout_exercise_id", "uq_workout_sets_wex_client_id"),
)


def upgrade() -> None:
    """Upgrade schema."""
    for table, scope_col, index_name in _TABLES:
        op.add_column(table, sa.Column("client_id", sa.String(length=36), nullable=True))
        op.create_index(index_name, table, [scope_col, "client_id"], unique=True)


def downgrade() -> None:
    """Downgrade schema."""
    for table, _scope_col, index_name in reversed(_TABLES):
        op.drop_index(index_name, table_name=table)
        op.drop_column(table, "client_id")
