"""Snowflake connection helpers. Credentials come from .env."""

import os
from contextlib import contextmanager

import pandas as pd
import snowflake.connector
from snowflake.connector.pandas_tools import write_pandas


@contextmanager
def get_connection():
    conn = snowflake.connector.connect(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        password=os.environ["SNOWFLAKE_PASSWORD"],
        warehouse=os.getenv("SNOWFLAKE_WAREHOUSE"),
        database=os.getenv("SNOWFLAKE_DATABASE", "POSTPILOT"),
        schema=os.getenv("SNOWFLAKE_SCHEMA", "PUBLIC"),
        role=os.getenv("SNOWFLAKE_ROLE") or None,
    )
    try:
        yield conn
    finally:
        conn.close()


def query_df(sql: str, params: tuple | dict | None = None) -> pd.DataFrame:
    """Run a SELECT and return a DataFrame with lowercase column names."""
    with get_connection() as conn:
        cur = conn.cursor()
        cur.execute(sql, params)
        df = cur.fetch_pandas_all()
    df.columns = [c.lower() for c in df.columns]
    return df


def execute(sql: str, params: tuple | dict | None = None) -> None:
    with get_connection() as conn:
        conn.cursor().execute(sql, params)


def insert_df(df: pd.DataFrame, table: str) -> int:
    """Append a DataFrame to a table. Column names must match the table (case-insensitive)."""
    df = df.copy()
    df.columns = [c.upper() for c in df.columns]
    with get_connection() as conn:
        _, _, nrows, _ = write_pandas(conn, df, table.upper())
    return nrows
