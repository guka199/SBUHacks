"""Create/migrate the configured Snowflake schema, or check its connectivity.

python -m data.setup [--create-warehouse] [--check]
"""

import argparse
import os
from pathlib import Path

from dotenv import load_dotenv
from snowflake.connector import Error as SnowflakeError
from snowflake.connector.util_text import split_statements

from api.services import snowflake
from api.services.errors import ServiceError

ROOT = Path(__file__).resolve().parents[1]
TABLES = ["USERS", "ACCOUNTS", "RAW_POSTS", "POSTS", "POST_FEATURES", "PREDICTIONS", "CONTRIBUTIONS"]


def setup(create_warehouse: bool = False) -> None:
    database = snowflake.identifier(os.getenv("SNOWFLAKE_DATABASE") or "POSTPILOT")
    schema = snowflake.identifier(os.getenv("SNOWFLAKE_SCHEMA") or "PUBLIC")
    warehouse = snowflake.identifier(os.getenv("SNOWFLAKE_WAREHOUSE") or "COMPUTE_WH")
    with snowflake.get_connection(bootstrap=True) as conn, conn.cursor() as cur:
        if create_warehouse:
            cur.execute(f"""CREATE WAREHOUSE IF NOT EXISTS {warehouse}
                WAREHOUSE_SIZE=XSMALL AUTO_SUSPEND=60 AUTO_RESUME=TRUE INITIALLY_SUSPENDED=TRUE""")
        cur.execute(f"USE WAREHOUSE {warehouse}")
        # Reuse an administrator-provisioned namespace without requiring the
        # application role to have account-wide CREATE DATABASE privileges.
        for kind, name in [("DATABASE", database), ("SCHEMA", schema)]:
            try:
                cur.execute(f"USE {kind} {name}")
            except SnowflakeError as exc:
                if exc.errno not in (2003, 2043):
                    raise
                cur.execute(f"CREATE {kind} IF NOT EXISTS {name}")
                cur.execute(f"USE {kind} {name}")
        with (ROOT / "data/sql/001_create_tables.sql").open() as source:
            for statement, _ in split_statements(source):
                if statement.strip():
                    cur.execute(statement)


def check() -> dict:
    df = snowflake.query_df("""SELECT CURRENT_DATABASE() AS database_name,
        CURRENT_SCHEMA() AS schema_name, CURRENT_WAREHOUSE() AS warehouse_name""")
    with snowflake.get_connection() as conn, conn.cursor() as cur:
        for table in TABLES:
            cur.execute(f"SELECT 1 FROM {snowflake.identifier(table)} LIMIT 0")
    return df.iloc[0].to_dict()


def main() -> None:
    load_dotenv(ROOT / ".env")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check connection and all seven tables, without creating anything")
    parser.add_argument("--create-warehouse", action="store_true", help="Create an X-Small auto-suspending warehouse if missing")
    args = parser.parse_args()
    try:
        if not args.check:
            setup(args.create_warehouse)
        print("Snowflake ready:", check())
    except ServiceError as exc:
        raise SystemExit(str(exc)) from None


if __name__ == "__main__":
    main()
