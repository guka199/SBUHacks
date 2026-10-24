"""Snowflake storage. All data values use bound parameters; secrets stay server-side."""

import json
import logging
import os
import re
import uuid
from contextlib import contextmanager

import pandas as pd
import snowflake.connector
from snowflake.connector.pandas_tools import write_pandas

from api.services.errors import ConfigurationError, StorageError
from api.services.posts import POST_COLUMNS, PostBatch, validate_user_id

log = logging.getLogger(__name__)


def identifier(value: str) -> str:
    """Only simple identifiers are accepted for configured databases, schemas and tables."""
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value):
        raise ConfigurationError("Snowflake database, schema, warehouse, and table names must be simple SQL identifiers")
    return '"' + value.upper() + '"'


def missing_settings() -> list[str]:
    missing = [key for key in ["SNOWFLAKE_ACCOUNT", "SNOWFLAKE_USER"] if not os.getenv(key, "").strip()]
    if not (os.getenv("SNOWFLAKE_PRIVATE_KEY_PATH") or os.getenv("SNOWFLAKE_PASSWORD")):
        missing.append("SNOWFLAKE_PRIVATE_KEY_PATH (or SNOWFLAKE_PASSWORD)")
    return missing


def is_configured() -> bool:
    return not missing_settings()


@contextmanager
def get_connection(*, bootstrap: bool = False):
    """One Snowflake connection, configured like api/services/db.py (key-pair login, POSTPILOT.APP)."""
    from api.services.db import snowflake_params

    missing = missing_settings()
    if missing:
        raise ConfigurationError("Add " + ", ".join(missing) + " to the repo's .env, then restart the API")
    options = {
        **snowflake_params(),
        "login_timeout": 15, "network_timeout": 30, "socket_timeout": 30,
        "session_parameters": {"QUERY_TAG": "postpilot", "STATEMENT_TIMEOUT_IN_SECONDS": 60, "WEEK_START": 1},
    }
    if not bootstrap:
        options.update(database=os.getenv("SNOWFLAKE_DATABASE") or "POSTPILOT",
                       schema=os.getenv("SNOWFLAKE_SCHEMA") or "APP")
    conn = None
    try:
        conn = snowflake.connector.connect(**options)
        yield conn
    except snowflake.connector.Error as exc:
        log.warning("Snowflake request failed: code=%s sqlstate=%s", exc.errno, exc.sqlstate)
        if exc.errno == 390432:
            raise ConfigurationError("Snowflake requires a network policy allowing this connection's public IP. Configure it in Snowsight, then retry") from None
        raise StorageError("Snowflake request failed. Check credentials, role permissions, and run python -m data.setup") from None
    finally:
        if conn is not None:
            conn.close()


def query_df(sql: str, params: tuple | dict | None = None) -> pd.DataFrame:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        columns = [c[0].lower() for c in cur.description]
        return pd.DataFrame(cur.fetchall(), columns=columns)


def execute(sql: str, params: tuple | dict | None = None) -> None:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(sql, params)


def insert_df(df: pd.DataFrame, table: str) -> int:
    """Append to a trusted table. App post imports must use upsert_posts instead."""
    identifier(table)
    with get_connection() as conn:
        success, _, count, _ = write_pandas(conn, df.rename(columns=str.upper), table.upper(), use_logical_type=True)
        if not success:
            raise StorageError("Snowflake could not load the data")
        return count


def _ensure_user(cur, user_id: str) -> None:
    cur.execute("""MERGE INTO USERS t USING (SELECT %s AS id) s ON t.id = s.id
                   WHEN NOT MATCHED THEN INSERT (id) VALUES (s.id)""", (user_id,))


def _save_account(cur, user_id: str, account: dict | None) -> None:
    if not account:
        return
    # One account per user and platform (same rule as the Accounts page in api/services/accounts.py)
    account_id = uuid.uuid5(uuid.NAMESPACE_URL, f"{user_id}:{account['platform']}:{account['external_id']}").hex
    cur.execute("""MERGE INTO ACCOUNTS t USING
        (SELECT %s AS id, %s AS user_id, %s AS platform, %s AS handle, %s AS external_id, %s AS followers) s
        ON t.user_id = s.user_id AND t.platform = s.platform
        WHEN MATCHED THEN UPDATE SET handle = s.handle, external_id = s.external_id, followers = s.followers,
                                     updated_at = CURRENT_TIMESTAMP()
        WHEN NOT MATCHED THEN INSERT (id, user_id, platform, connection_type, handle, external_id, followers, updated_at)
        VALUES (s.id, s.user_id, s.platform, 'import', s.handle, s.external_id, s.followers, CURRENT_TIMESTAMP())""",
        (account_id, user_id, account["platform"], account["handle"], account.get("external_id"), account["followers"]))


def upsert_posts(user_id: str, batch: PostBatch, source: str, account: dict | None = None) -> dict:
    """Atomically update current posts and append the original payloads to the audit table.

    The staging table is created/loaded before BEGIN because Snowflake DDL commits transactions.
    Reimporting a post updates its stats, keyed by (user_id, platform, external_id).
    """
    user_id = validate_user_id(user_id)
    frame = batch.frame.copy()
    if not frame.empty and not frame["user_id"].eq(user_id).all():
        raise ValueError("Batch contains a different user")
    stage = "INGEST_" + uuid.uuid4().hex.upper()
    stage_sql = identifier(stage)
    batch_id = uuid.uuid4().hex
    inserted = updated = 0
    with get_connection() as conn, conn.cursor() as cur:
        try:
            if not frame.empty:
                cur.execute(f"CREATE TEMPORARY TABLE {stage_sql} LIKE POSTS")
                cur.execute(f"ALTER TABLE {stage_sql} ADD COLUMN RAW_PAYLOAD STRING")
                success, _, count, _ = write_pandas(conn, frame.rename(columns=str.upper), stage, use_logical_type=True)
                if not success or count != len(frame):
                    raise StorageError("Snowflake did not load the complete import; no posts were changed")
            cur.execute("BEGIN")
            try:
                _ensure_user(cur, user_id)
                _save_account(cur, user_id, account)
                if not frame.empty:
                    updates = ", ".join(f"{c}=s.{c}" for c in POST_COLUMNS if c not in ("user_id", "platform", "external_id"))
                    columns = ", ".join(POST_COLUMNS)
                    values = ", ".join(f"s.{c}" for c in POST_COLUMNS)
                    cur.execute(f"""MERGE INTO POSTS t USING {stage_sql} s
                        ON t.user_id=s.user_id AND t.platform=s.platform AND t.external_id=s.external_id
                        WHEN MATCHED THEN UPDATE SET {updates}, loaded_at=CURRENT_TIMESTAMP()
                        WHEN NOT MATCHED THEN INSERT ({columns}) VALUES ({values})""")
                    merge_counts = dict(zip([c[0].lower() for c in cur.description], cur.fetchone()))
                    inserted = int(merge_counts.get("number of rows inserted", 0))
                    updated = int(merge_counts.get("number of rows updated", 0))
                    cur.execute(f"""INSERT INTO RAW_POSTS (source, payload, user_id, batch_id)
                        SELECT %s, PARSE_JSON(raw_payload), %s, %s FROM {stage_sql}""", (source, user_id, batch_id))
                conn.commit()
            except BaseException:
                conn.rollback()
                raise
        finally:
            if not frame.empty:
                try:
                    cur.execute(f"DROP TABLE IF EXISTS {stage_sql}")
                except snowflake.connector.Error:
                    # The connection close also drops temporary tables. Cleanup must not
                    # turn a successful commit into an apparent failed import.
                    log.warning("Import staging cleanup deferred until connection close")
    return {"posts_loaded": len(frame), "inserted": inserted, "updated": updated,
            "duplicates_skipped": batch.duplicates_skipped, "batch_id": batch_id}


def save_prediction(user_id: str, caption: str, result, context: dict) -> str:
    user_id = validate_user_id(user_id)
    request_id = uuid.uuid4().hex
    payload = result.model_dump(mode="json")
    def encode(value):
        return json.dumps(value, default=str, allow_nan=False)
    rows = []
    for score in payload["scores"]:
        rows.append((uuid.uuid4().hex, user_id, score["platform"], caption, score["score"],
                     encode(score["top_factors"]), encode(payload["suggestions"]), request_id,
                     score.get("model_score", score["score"]), score.get("content_score"),
                     "model+gemini" if payload.get("gemini_used") else "model", encode(context),
                     encode(payload.get("content")), encode(score.get("vs_account"))))
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("BEGIN")
        try:
            _ensure_user(cur, user_id)
            # The connector's executemany rewrite requires INSERT ... VALUES;
            # these JSON fields use INSERT ... SELECT with PARSE_JSON instead.
            for row in rows:
                cur.execute("""INSERT INTO PREDICTIONS
                    (id, user_id, platform, caption, score, top_factors, suggestions, request_id,
                     model_score, content_score, provider, context, content_analysis, vs_account)
                    SELECT %s,%s,%s,%s,%s,PARSE_JSON(%s),PARSE_JSON(%s),%s,%s,%s,%s,
                           PARSE_JSON(%s),PARSE_JSON(%s),PARSE_JSON(%s)""", row)
            conn.commit()
        except BaseException:
            conn.rollback()
            raise
    return request_id
