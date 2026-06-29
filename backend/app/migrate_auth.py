import sqlite3
import os
import sys

def run_migration():
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "dev.db"))
    print(f"Connecting to database at {db_path}...")
    
    if not os.path.exists(db_path):
        print("dev.db does not exist yet. Startup hook will create tables automatically. Migration skipped.")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    columns_to_add = [
        ("oauth_provider", "VARCHAR(32)"),
        ("oauth_subject", "VARCHAR(255)"),
        ("is_verified", "BOOLEAN DEFAULT 0"),
        ("email_otp", "VARCHAR(6)"),
        ("otp_expires_at", "TIMESTAMP"),
        ("otp_attempts", "INTEGER DEFAULT 0"),
    ]

    for col_name, col_type in columns_to_add:
        try:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_type};")
            print(f"Added column {col_name} successfully.")
        except sqlite3.OperationalError as e:
            if "duplicate column name" in str(e):
                print(f"Column {col_name} already exists. Skipping.")
            else:
                print(f"Error adding column {col_name}: {e}")
                conn.close()
                sys.exit(1)

    # Update seeded default users to be verified
    try:
        cursor.execute("UPDATE users SET is_verified = 1 WHERE email IN ('admin@silicofeller.com', 'manager@quantumlabs.com', 'engineer@quantumlabs.com');")
        print("Updated seeded default users to verified.")
    except Exception as e:
        print(f"Error updating seeded users: {e}")

    conn.commit()
    conn.close()
    print("Database migration completed successfully!")

if __name__ == "__main__":
    run_migration()
