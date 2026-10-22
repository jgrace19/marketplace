"""create saved_carts and saved_cart_items

Revision ID: 0001
Revises:
Create Date: 2026-10-01

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "0001"
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "saved_carts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("shopper_id", sa.String(), nullable=False),
        sa.Column("store_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_saved_carts_shopper_id", "saved_carts", ["shopper_id"])
    op.create_index("ix_saved_carts_expires_at", "saved_carts", ["expires_at"])

    op.create_table(
        "saved_cart_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("saved_cart_id", sa.Uuid(), nullable=False),
        sa.Column("product_id", sa.String(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("unit_price_at_save", sa.Numeric(10, 2), nullable=False),
        sa.ForeignKeyConstraint(["saved_cart_id"], ["saved_carts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("saved_cart_id", "product_id", name="uq_saved_cart_items_cart_product"),
        sa.CheckConstraint("quantity >= 1 AND quantity <= 99", name="ck_saved_cart_items_quantity"),
    )


def downgrade() -> None:
    op.drop_table("saved_cart_items")
    op.drop_index("ix_saved_carts_expires_at", table_name="saved_carts")
    op.drop_index("ix_saved_carts_shopper_id", table_name="saved_carts")
    op.drop_table("saved_carts")
