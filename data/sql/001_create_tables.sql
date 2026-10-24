-- PostPilot schema. Run: python -m data.setup
-- In a worksheet, first select/create the database and schema you want to use.
-- Safe to run repeatedly; existing rows are preserved.

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
    user_id     STRING,
    batch_id    STRING,
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
    user_id              STRING,
    external_id          STRING,
    platform             STRING,
    sentiment            FLOAT,
    sentiment_label      STRING,
    sentiment_details    VARIANT,
    caption_hash         STRING,
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
    request_id      STRING,
    model_score     FLOAT,
    content_score   FLOAT,
    provider        STRING,
    context         VARIANT,
    content_analysis VARIANT,
    vs_account      VARIANT,
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

-- Additive migrations for accounts initialized from the original scaffold.
ALTER TABLE RAW_POSTS ADD COLUMN IF NOT EXISTS user_id STRING;
ALTER TABLE RAW_POSTS ADD COLUMN IF NOT EXISTS batch_id STRING;
ALTER TABLE POST_FEATURES ADD COLUMN IF NOT EXISTS user_id STRING;
ALTER TABLE POST_FEATURES ADD COLUMN IF NOT EXISTS sentiment_label STRING;
ALTER TABLE POST_FEATURES ADD COLUMN IF NOT EXISTS sentiment_details VARIANT;
ALTER TABLE POST_FEATURES ADD COLUMN IF NOT EXISTS caption_hash STRING;
ALTER TABLE PREDICTIONS ADD COLUMN IF NOT EXISTS request_id STRING;
ALTER TABLE PREDICTIONS ADD COLUMN IF NOT EXISTS model_score FLOAT;
ALTER TABLE PREDICTIONS ADD COLUMN IF NOT EXISTS content_score FLOAT;
ALTER TABLE PREDICTIONS ADD COLUMN IF NOT EXISTS provider STRING;
ALTER TABLE PREDICTIONS ADD COLUMN IF NOT EXISTS context VARIANT;
ALTER TABLE PREDICTIONS ADD COLUMN IF NOT EXISTS content_analysis VARIANT;
ALTER TABLE PREDICTIONS ADD COLUMN IF NOT EXISTS vs_account VARIANT;
