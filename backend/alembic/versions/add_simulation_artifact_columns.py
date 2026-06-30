"""add simulation artifact columns

Revision ID: 3a928ef18bc8
Revises: 
Create Date: 2026-06-24 09:23:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '3a928ef18bc8'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Add columns to simulations table
    op.add_column('simulations', sa.Column('artifact_path', sa.String(length=256), nullable=True))
    op.add_column('simulations', sa.Column('artifact_retained', sa.Boolean(), server_default=sa.text('false'), nullable=False))


def downgrade():
    # Remove columns from simulations table
    op.drop_column('simulations', 'artifact_retained')
    op.drop_column('simulations', 'artifact_path')
