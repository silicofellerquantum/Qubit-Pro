import asyncio
import os
import sys
from dotenv import load_dotenv
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy import select, Table, MetaData
from sqlalchemy.exc import NoSuchTableError

# Load environment variables
load_dotenv()

# We need the local SQLite engine (using aiosqlite) and the Supabase Postgres engine (using asyncpg)
SQLITE_URL = "sqlite+aiosqlite:///dev.db"
POSTGRES_URL = os.getenv("DATABASE_URL")

if not POSTGRES_URL or "sqlite" in POSTGRES_URL:
    print("Error: DATABASE_URL is not set to a Postgres URL in .env.")
    sys.exit(1)

# Initialize engines
sqlite_engine = create_async_engine(SQLITE_URL, echo=False)
postgres_engine = create_async_engine(POSTGRES_URL, echo=False)

SQLiteSession = async_sessionmaker(sqlite_engine, class_=AsyncSession, expire_on_commit=False)
PostgresSession = async_sessionmaker(postgres_engine, class_=AsyncSession, expire_on_commit=False)

# Add the backend app folder to sys.path so we can import the models
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.models import (
    User, Subscription, TeamInvite, Project, Version, QCLangFile,
    Layout, Simulation, VerificationReport, TapeoutPackage, ChatHistory,
    UserFeatureUsage
)

# Topological order of models to respect foreign key constraints
MODELS_TO_MIGRATE = [
    User,
    Subscription,
    TeamInvite,
    Project,
    Version,
    QCLangFile,
    Layout,
    Simulation,
    VerificationReport,
    TapeoutPackage,
    ChatHistory,
    UserFeatureUsage
]

async def migrate_table(sqlite_sess, postgres_sess, model_cls):
    model_name = model_cls.__name__
    table_name = model_cls.__tablename__
    print(f"\n[+] Migrating {model_name} (table: {table_name})...")
    
    sqlite_conn = await sqlite_sess.connection()
    
    # Reflect the table dynamically from SQLite
    def reflect_tbl(conn):
        meta = MetaData()
        return Table(table_name, meta, autoload_with=conn)
        
    try:
        sqlite_table = await sqlite_conn.run_sync(reflect_tbl)
    except NoSuchTableError:
        print(f"    Table {table_name} does not exist in SQLite. Skipping.")
        return 0
    except Exception as e:
        print(f"    Could not reflect table {table_name} in SQLite: {e}. Skipping.")
        return 0
        
    # Query all rows from SQLite using reflected table schema
    result = await sqlite_sess.execute(sqlite_table.select())
    rows = result.fetchall()
    
    if not rows:
        print(f"    No records found for {model_name} in SQLite. Skipping.")
        return 0
        
    print(f"    Found {len(rows)} records in SQLite. Migrating to Supabase...")
    
    migrated_count = 0
    for row in rows:
        # Convert row tuple to dictionary based on column keys of the reflected table
        row_dict = dict(row._mapping)
        
        # Instantiate model using only fields retrieved from SQLite
        # Any missing fields (like is_premium) will default to their model-defined defaults
        new_instance = model_cls(**row_dict)
        
        # Merge ensures upsert (update if exists, insert if new)
        await postgres_sess.merge(new_instance)
        migrated_count += 1
        
    await postgres_sess.commit()
    print(f"    Successfully migrated {migrated_count} records for {model_name}.")
    return migrated_count

async def main():
    print("=" * 60)
    print("DATABASE DATA MIGRATION: SQLite -> Supabase (PostgreSQL)")
    print("=" * 60)
    print(f"SQLite Source: {SQLITE_URL}")
    print(f"Supabase Dest: {POSTGRES_URL}")
    print("-" * 60)
    
    async with SQLiteSession() as sqlite_sess:
        async with PostgresSession() as postgres_sess:
            for model_cls in MODELS_TO_MIGRATE:
                try:
                    await migrate_table(sqlite_sess, postgres_sess, model_cls)
                except Exception as e:
                    print(f"    [!] Error migrating {model_cls.__name__}: {e}")
                    await postgres_sess.rollback()
                    
    await sqlite_engine.dispose()
    await postgres_engine.dispose()
    print("\n[+] Migration processing complete!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main())
