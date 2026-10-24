-- PostPilot schema. Run once in a Snowflake worksheet (or: snowsql -f data/sql/001_create_tables.sql).

CREATE DATABASE IF NOT EXISTS POSTPILOT;
USE DATABASE POSTPILOT;
USE SCHEMA PUBLIC;

CREATE TABLE IF NOT EXISTS USERS (
    id              STRING PRIMARY KEY,
    wallet_address  STRING,          -- Solana wallet doubles as login
    display_name    STRING,
    type            STRING,          -- 'creator' or 'business'
    created_at      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS ACCOUNTS (
    id          STRING PRIMARY KEY,
    user_id     STRING,
    platform    STRING,              -- youtube | tiktok | instagram | linkedin
    handle      STRING,
    followers   NUMBER
);

-- Posts exactly as they arrived (API JSON or CSV row), before cleaning
CREATE TABLE IF NOT EXISTS RAW_POSTS (
    source      STRING,              -- 'youtube_api', 'tiktok_csv', 'kaggle_tiktok', ...
    payload     VARIANT,
    loaded_at   TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

-- One cleaned row per post, same shape for every platform
CREATE TABLE IF NOT EXISTS POSTS (
    user_id         STRING,          -- NULL for public training data (Kaggle)
    platform        STRING,
    format          STRING,
    external_id     STRING,
    caption         STRING,
    posted_at       TIMESTAMP_NTZ,
    thumbnail_url   STRING,
    views           NUMBER,
    likes           NUMBER,
    comments        NUMBER,
    shares          NUMBER,
    followers       NUMBER,
    loaded_at       TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS POST_FEATURES (
    external_id          STRING,
    platform             STRING,
    sentiment            FLOAT,
    caption_embedding    VECTOR(FLOAT, 768),
    thumbnail_embedding  VECTOR(FLOAT, 512),
    engagement_rate      FLOAT
);

CREATE TABLE IF NOT EXISTS PREDICTIONS (
    id              STRING,
    user_id         STRING,
    platform        STRING,
    caption         STRING,
    score           FLOAT,
    top_factors     VARIANT,
    suggestions     VARIANT,
    created_at      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);

CREATE TABLE IF NOT EXISTS CONTRIBUTIONS (
    id              STRING PRIMARY KEY,
    user_id         STRING,
    wallet_address  STRING,
    posts_shared    NUMBER,
    tokens_owed     NUMBER,
    tokens_sent     NUMBER DEFAULT 0,
    tx_signature    STRING,          -- Solana transaction, filled after payout
    created_at      TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP()
);
