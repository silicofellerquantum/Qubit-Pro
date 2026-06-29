import asyncio
from sqlalchemy import text, inspect
from app.database import engine

async def migrate():
    dialect = engine.dialect.name
    print(f"Running migration on database dialect: {dialect}...")

    columns_to_add = [
        ("plan", "VARCHAR(20) DEFAULT 'free'"),
        ("billing_cycle", "VARCHAR(10) DEFAULT 'monthly'"),
        ("subscription_status", "VARCHAR(30) NULL"),
        ("razorpay_customer_id", "VARCHAR(64) NULL"),
        ("razorpay_subscription_id", "VARCHAR(64) NULL"),
        ("licenses_purchased", "INTEGER DEFAULT 1"),
        ("team_owner_id", "VARCHAR(36) NULL"),
        ("oauth_provider", "VARCHAR(32) NULL"),
        ("oauth_subject", "VARCHAR(255) NULL"),
        ("is_verified", "BOOLEAN DEFAULT FALSE" if dialect == "postgresql" else "BOOLEAN DEFAULT 0"),
        ("email_otp", "VARCHAR(6) NULL"),
        ("otp_expires_at", "TIMESTAMP NULL"),
        ("otp_attempts", "INTEGER DEFAULT 0"),
    ]

    async with engine.begin() as conn:
        # Check existing columns first to avoid failed transactions
        def get_cols(connection):
            inspector = inspect(connection)
            return [col['name'] for col in inspector.get_columns('users')]

        existing_cols = await conn.run_sync(get_cols)
        
        for col_name, col_type in columns_to_add:
            if col_name in existing_cols:
                print(f"Column '{col_name}' already exists. Skipping.")
                continue

            try:
                await conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type};"))
                print(f"Column '{col_name}' added successfully.")
            except Exception as e:
                print(f"Could not add column '{col_name}': {e}")
                    
        try:
            val = "TRUE" if dialect == "postgresql" else "1"
            await conn.execute(text(f"UPDATE users SET is_verified = {val} WHERE email IN ('admin@silicofeller.com', 'manager@quantumlabs.com', 'engineer@quantumlabs.com');"))
            print("Seeded users updated to verified.")
        except Exception as e:
            print(f"Could not update seeded users: {e}")

if __name__ == "__main__":
    asyncio.run(migrate())
