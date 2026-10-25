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
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

log = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parents[2]
LOCAL_DB = ROOT / "data" / "local.db"
LOCAL_UPLOADS = ROOT / "data" / "uploads"  # media files when Snowflake isn't configured
STAGE = "MEDIA"  # Snowflake internal stage for uploaded images/videos
ANALYSIS_STAGE = "ANALYSIS_MEDIA"  # SSE permits browser playback through presigned URLs

SCHEMA = [
    """CREATE TABLE IF NOT EXISTS IDEA_PREFERENCES (
        user_id VARCHAR PRIMARY KEY,
        payload VARCHAR,
        updated_at TIMESTAMP_NTZ
    )""",
    """CREATE TABLE IF NOT EXISTS CHANNEL_MEMORIES (
        user_id VARCHAR PRIMARY KEY,
        payload VARCHAR,
        updated_at TIMESTAMP_NTZ
    )""",
    """CREATE TABLE IF NOT EXISTS CONTENT_IDEAS (
        id VARCHAR PRIMARY KEY,
        user_id VARCHAR,
        batch_id VARCHAR,
        platform VARCHAR,
        payload VARCHAR,
        status VARCHAR,
        created_at TIMESTAMP_NTZ
    )""",
    """CREATE TABLE IF NOT EXISTS ANALYSES (
        id VARCHAR PRIMARY KEY,
        user_id VARCHAR,
        caption VARCHAR,
        report VARCHAR,
        media_path VARCHAR,
        media_type VARCHAR,
        created_at TIMESTAMP_NTZ
    )""",
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
# Coordinate the feature's final writes with full account deletion in this API
# process. Provider calls run outside this lock; only owner checks/storage use it.
creator_data_lock = threading.RLock()
_conn = None

# Additive tables only. Payloads contain normalized, public fields, not raw exports.
SCHEMA += [
    '''CREATE TABLE IF NOT EXISTS SOCIAL_LINKS (
        user_id VARCHAR, platform VARCHAR, profile_url VARCHAR, max_posts INTEGER,
        active_job VARCHAR, snapshot_id VARCHAR, interval_hours INTEGER,
        next_refresh FLOAT, last_requested FLOAT,
        PRIMARY KEY (user_id, platform)
    )''',
    '''CREATE TABLE IF NOT EXISTS SOCIAL_JOBS (
        id VARCHAR PRIMARY KEY, user_id VARCHAR, platform VARCHAR, job_status VARCHAR,
        phase VARCHAR, progress INTEGER, request_json VARCHAR, state_json VARCHAR,
        created_at VARCHAR, updated_at VARCHAR, error_message VARCHAR,
        snapshot_id VARCHAR, next_poll FLOAT, deadline FLOAT
    )''',
    '''CREATE TABLE IF NOT EXISTS SOCIAL_SNAPSHOTS (
        id VARCHAR PRIMARY KEY, user_id VARCHAR, platform VARCHAR,
        captured_at VARCHAR, payload VARCHAR
    )''',
]


class Transaction:
    def __init__(self, connection):
        self.connection = connection

    def execute(self, sql, params=()):
        cur = self.connection.cursor()
        try:
            cur.execute(sql.replace('%s', '?') if backend() == 'sqlite' else sql, params)
            if cur.description:
                columns = [d[0].lower() for d in cur.description]
                return [dict(zip(columns, tuple(row))) for row in cur.fetchall()]
            return []
        finally:
            cur.close()


@contextmanager
def transaction():
    """Atomic app operations under the shared connection lock; no ambiguous retries.

    Single API/worker process is required for social job deduplication on Snowflake,
    whose standard-table PKs are informational. See the deployment guide.
    """
    global _conn
    with _lock:
        if _conn is None:
            _conn = _connect()
        tx = Transaction(_conn)
        tx.execute('BEGIN IMMEDIATE' if backend() == 'sqlite' else 'BEGIN')
        try:
            yield tx
            _conn.commit()
        except BaseException:
            _conn.rollback()
            raise


def backend() -> str:
    return "snowflake" if os.getenv("SNOWFLAKE_ACCOUNT") else "sqlite"


def now() -> str:
    """UTC timestamp as text both databases accept for TIMESTAMP_NTZ."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _key_file(encoded: str) -> Path:
    """Write a base64 private key from the environment to a private temp file once (the connector wants a path)."""
    import base64
    import hashlib
    import tempfile

    data = base64.b64decode(encoded)
    path = Path(tempfile.gettempdir()) / f"snowflake_key_{hashlib.sha256(data).hexdigest()[:12]}.p8"
    if not path.exists():
        path.touch(mode=0o600)
        path.write_bytes(data)
    return path


def snowflake_params() -> dict:
    """Connection settings from .env. Key-pair auth (SNOWFLAKE_PRIVATE_KEY_PATH) or password."""
    params = dict(
        account=os.environ["SNOWFLAKE_ACCOUNT"],
        user=os.environ["SNOWFLAKE_USER"],
        warehouse=os.getenv("SNOWFLAKE_WAREHOUSE") or None,
        role=os.getenv("SNOWFLAKE_ROLE") or None,
    )
    if encoded := os.getenv("SNOWFLAKE_PRIVATE_KEY_B64"):  # hosted deploys: the .p8 file's contents, base64-encoded
        params |= {"private_key_file": str(_key_file(encoded)), "authenticator": "SNOWFLAKE_JWT"}
    elif key := os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH"):
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
        execute(f"CREATE STAGE IF NOT EXISTS {ANALYSIS_STAGE} ENCRYPTION = (TYPE = 'SNOWFLAKE_SSE') DIRECTORY = (ENABLE = TRUE)")
    log.info("database ready (%s)", backend())


def close() -> None:
    """Close the shared connection when the API shuts down."""
    global _conn
    with _lock:
        if _conn is not None:
            try:
                _conn.close()
            finally:
                _conn = None


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
        execute(f"REMOVE @{ANALYSIS_STAGE}/{folder}/")


def remove_report_media(user_id: str, report_id: str) -> None:
    """Remove only one report's UUID-prefixed files within the owner's folder."""
    import re

    if not all(re.fullmatch(r"[0-9a-f]{32}", value) for value in (user_id, report_id)):
        raise ValueError("invalid report media identifiers")
    if backend() == "sqlite":
        folder = LOCAL_UPLOADS / user_id
        if folder.is_symlink():
            raise ValueError("invalid report media folder")
        for path in folder.glob(f"{report_id}*"):
            if path.is_file() or path.is_symlink():
                path.unlink(missing_ok=True)
    else:
        # Snowflake stage paths are prefixes. UUID validation prevents path/SQL injection;
        # the full 32-character report ID cannot match another generated report ID.
        # https://docs.snowflake.com/en/sql-reference/sql/remove
        execute(f"REMOVE @{ANALYSIS_STAGE}/{user_id}/{report_id}")
        execute(f"REMOVE @{STAGE}/{user_id}/{report_id}")


def store_files(files: list[tuple[bytes, str]], folder: str, stage: str = STAGE) -> list[str]:
    """Save several files at once: one PUT round trip to Snowflake (vs. one per file). Returns their paths."""
    import re
    import tempfile

    if stage not in (STAGE, ANALYSIS_STAGE):
        raise ValueError("invalid media stage")
    if backend() == "sqlite":
        return [store_file(data, folder, name, stage) for data, name in files]
    names = [re.sub(r"[^\w.-]+", "_", name)[-120:] or f"upload{i}" for i, (_, name) in enumerate(files)]
    with tempfile.TemporaryDirectory() as tmp:
        for (data, _), name in zip(files, names):
            (Path(tmp) / name).write_bytes(data)
        execute(f"PUT 'file://{Path(tmp).as_posix()}/*' @{stage}/{folder} AUTO_COMPRESS = FALSE OVERWRITE = TRUE "
                f"PARALLEL = 8")
    return [f"@{stage}/{folder}/{name}" for name in names]


def store_file(data: bytes, folder: str, filename: str, stage: str = STAGE) -> str:
    """Save an uploaded file: Snowflake stage @MEDIA/<folder>/<filename>, or data/uploads/ locally."""
    import re
    import tempfile

    if stage not in (STAGE, ANALYSIS_STAGE):
        raise ValueError("invalid media stage")
    safe = re.sub(r"[^\w.-]+", "_", filename)[-120:] or "upload"
    if backend() == "sqlite":
        path = LOCAL_UPLOADS / folder / safe
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return str(path.relative_to(ROOT))
    with tempfile.TemporaryDirectory() as tmp:
        local = Path(tmp) / safe
        local.write_bytes(data)
        execute(f"PUT 'file://{local.as_posix()}' @{stage}/{folder} AUTO_COMPRESS = FALSE OVERWRITE = TRUE")
    return f"@{stage}/{folder}/{safe}"
