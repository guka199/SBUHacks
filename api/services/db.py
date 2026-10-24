"""App database: users, linked accounts, posts.

Uses Snowflake when SNOWFLAKE_ACCOUNT is set in .env; otherwise a local SQLite file (data/local.db), so the app
works before Snowflake is configured. Both run the SAME tables and SQL (kept to what both understand: %s
placeholders, VARCHAR/INTEGER/FLOAT/BOOLEAN/TIMESTAMP_NTZ columns, JSON stored as text).

    db.query("SELECT * FROM USERS WHERE email = %s", (email,))  -> list of dicts (lowercase keys)
    db.execute("DELETE FROM ACCOUNTS WHERE id = %s", (account_id,))
"""

import logging
import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parents[2]
LOCAL_DB = ROOT / "data" / "local.db"
LOCAL_UPLOADS = ROOT / "data" / "uploads"  # media files when Snowflake isn't configured
STAGE = "MEDIA"  # Snowflake internal stage for uploaded images/videos

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS USERS (
        id VARCHAR PRIMARY KEY,
        email VARCHAR,
        password_hash VARCHAR,
        display_name VARCHAR,
        account_type VARCHAR,       -- creator | business
        niche VARCHAR,
        wallet_address VARCHAR,     -- Solana wallet (rewards)
        created_at TIMESTAMP_NTZ
    )""",
    """CREATE TABLE IF NOT EXISTS ACCOUNTS (
        id VARCHAR PRIMARY KEY,
        user_id VARCHAR,
        platform VARCHAR,           -- youtube | tiktok | instagram | linkedin
        connection_type VARCHAR,    -- api (fetched automatically) | manual (entered by the user)
        handle VARCHAR,
        external_id VARCHAR,        -- e.g. YouTube channel id
        display_name VARCHAR,
        profile_url VARCHAR,
        followers INTEGER,          -- subscribers on YouTube
        following_count INTEGER,    -- ("following" and "connection" are reserved words in Snowflake)
        total_posts INTEGER,
        avg_views FLOAT,
        typical_views FLOAT,        -- median views of recent posts (model input)
        avg_likes FLOAT,
        avg_comments FLOAT,
        avg_shares FLOAT,
        engagement_rate FLOAT,      -- (likes + comments + shares) / views, or / followers if no views
        posts_per_week FLOAT,
        audience VARCHAR,           -- JSON: age_range, percent_female, top_countries, interests, language
        extra VARCHAR,              -- JSON: platform-specific details
        updated_at TIMESTAMP_NTZ
    )""",
    """CREATE TABLE IF NOT EXISTS DRAFTS (
        id VARCHAR PRIMARY KEY,
        user_id VARCHAR,
        caption VARCHAR,
        platforms VARCHAR,          -- comma-separated
        planned_time TIMESTAMP_NTZ,
        media_name VARCHAR,         -- original file name
        media_type VARCHAR,         -- MIME type
        media_bytes INTEGER,
        media_path VARCHAR,         -- @MEDIA/<user>/<file> in Snowflake, or a local path
        scores VARCHAR,             -- JSON: per platform score, model_score, content_score, vs_account
        suggestions VARCHAR,        -- JSON list
        content_review VARCHAR,     -- JSON (Gemini), or empty
        gemini_used BOOLEAN,
        created_at TIMESTAMP_NTZ
    )""",
    """CREATE TABLE IF NOT EXISTS POSTS (
        user_id VARCHAR,
        platform VARCHAR,
        format VARCHAR,
        external_id VARCHAR,
        caption VARCHAR,
        posted_at TIMESTAMP_NTZ,
        thumbnail_url VARCHAR,
        views INTEGER,
        likes INTEGER,
        comments INTEGER,
        shares INTEGER,
        followers INTEGER,
        loaded_at TIMESTAMP_NTZ
    )""",
]

_lock = threading.Lock()
_conn = None


def backend() -> str:
    return "snowflake" if os.getenv("SNOWFLAKE_ACCOUNT") else "sqlite"


def now() -> str:
    """UTC timestamp as text both databases accept for TIMESTAMP_NTZ."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def snowflake_params() -> dict:
    """Connection settings from .env. Key-pair auth (SNOWFLAKE_PRIVATE_KEY_PATH) or password."""
    params = dict(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        warehouse=os.getenv("SNOWFLAKE_WAREHOUSE") or None,
        role=os.getenv("SNOWFLAKE_ROLE") or None,
    )
    if key := os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH"):
        path = Path(key) if Path(key).is_absolute() else ROOT / key
        params |= {"private_key_file": str(path), "authenticator": "SNOWFLAKE_JWT"}
    else:
        params["password"] = os.environ["SNOWFLAKE_PASSWORD"]
    return params


def _connect():
    if backend() == "sqlite":
        LOCAL_DB.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(LOCAL_DB, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        for ddl in SCHEMA:  # local file: make sure the tables exist even without API startup (scripts, tests)
            conn.execute(ddl)
        conn.commit()
        return conn

    import snowflake.connector

    database = os.getenv("SNOWFLAKE_DATABASE") or "POSTPILOT"
    schema = os.getenv("SNOWFLAKE_SCHEMA") or "PUBLIC"
    conn = snowflake.connector.connect(**snowflake_params(), client_session_keep_alive=True)
    cur = conn.cursor()
    try:
        cur.execute(f"USE SCHEMA {database}.{schema}")
    except Exception:  # first run with an admin login: create them
        cur.execute(f"CREATE DATABASE IF NOT EXISTS {database}")
        cur.execute(f"CREATE SCHEMA IF NOT EXISTS {database}.{schema}")
        cur.execute(f"USE SCHEMA {database}.{schema}")
    return conn


def _run(sql: str, params: tuple | list[tuple], fetch: bool, many: bool = False):
    global _conn
    if backend() == "sqlite":
        sql = sql.replace("%s", "?")
    with _lock:
        for attempt in range(2):
            try:
                if _conn is None:
                    _conn = _connect()
                cur = _conn.cursor()
                if many:
                    cur.executemany(sql, params)  # Snowflake sends this as one multi-row INSERT
                else:
                    cur.execute(sql, params)
                if not fetch:
                    if backend() == "sqlite":
                        _conn.commit()
                    return None
                columns = [d[0].lower() for d in cur.description]
                return [dict(zip(columns, tuple(row))) for row in cur.fetchall()]
            except Exception as e:
                # Only retry when the connection itself dropped (e.g. Snowflake session expired)
                if attempt == 1 or not _is_connection_error(e):
                    raise
                log.warning("database connection lost (%s); reconnecting", e)
                _conn = None


def _is_connection_error(e: Exception) -> bool:
    text = f"{type(e).__name__} {e}".lower()
    return any(k in text for k in ("connection", "session", "expired", "closed", "authentication token"))


def query(sql: str, params: tuple = ()) -> list[dict]:
    return _run(sql, params, fetch=True)


def execute(sql: str, params: tuple = ()) -> None:
    _run(sql, params, fetch=False)


def execute_many(sql: str, rows: list[tuple]) -> None:
    """Same statement for many rows in one round trip (bulk INSERT)."""
    if rows:
        _run(sql, rows, fetch=False, many=True)


def init() -> None:
    """Create the tables (and the media stage) if they don't exist. Runs at API startup."""
    for ddl in SCHEMA:
        execute(ddl)
    if backend() == "snowflake":
        execute(f"CREATE STAGE IF NOT EXISTS {STAGE} DIRECTORY = (ENABLE = TRUE)")
    log.info("database ready (%s)", backend())


def remove_folder(folder: str) -> None:
    """Delete every stored file in a folder (e.g. all of one user's uploads)."""
    import re
    import shutil

    if not re.fullmatch(r"[0-9a-f]{32}", folder):  # folders are user ids; never build paths from anything else
        raise ValueError("invalid folder")
    if backend() == "sqlite":
        shutil.rmtree(LOCAL_UPLOADS / folder, ignore_errors=True)
    else:
        execute(f"REMOVE @{STAGE}/{folder}/")


def store_file(data: bytes, folder: str, filename: str) -> str:
    """Save an uploaded file: Snowflake stage @MEDIA/<folder>/<filename>, or data/uploads/ locally."""
    import re
    import tempfile

    safe = re.sub(r"[^\w.-]+", "_", filename)[-120:] or "upload"
    if backend() == "sqlite":
        path = LOCAL_UPLOADS / folder / safe
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return str(path.relative_to(ROOT))
    with tempfile.TemporaryDirectory() as tmp:
        local = Path(tmp) / safe
        local.write_bytes(data)
        execute(f"PUT 'file://{local.as_posix()}' @{STAGE}/{folder} AUTO_COMPRESS = FALSE OVERWRITE = TRUE")
    return f"@{STAGE}/{folder}/{safe}"
