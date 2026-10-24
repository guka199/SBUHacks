-- Adds sentiment, caption embeddings and the engagement target using Snowflake Cortex.
-- Re-run after loading new posts. Thumbnail embeddings (CLIP) are added from Python.

USE DATABASE POSTPILOT;
USE SCHEMA PUBLIC;

INSERT INTO POST_FEATURES (external_id, platform, sentiment, caption_embedding, engagement_rate)
SELECT
    p.external_id,
    p.platform,
    SNOWFLAKE.CORTEX.SENTIMENT(p.caption),
    SNOWFLAKE.CORTEX.EMBED_TEXT_768('snowflake-arctic-embed-m', p.caption),
    (p.likes + p.comments + p.shares) / NULLIF(COALESCE(NULLIF(p.views, 0), p.followers), 0)
FROM POSTS p
LEFT JOIN POST_FEATURES f
    ON f.external_id = p.external_id AND f.platform = p.platform
WHERE f.external_id IS NULL
  AND p.caption IS NOT NULL;

-- Training view: everything ml/train.py needs in one query
CREATE OR REPLACE VIEW TRAINING_DATA AS
SELECT p.platform, p.caption, p.posted_at, p.views, p.likes, p.comments, p.shares, p.followers,
       f.sentiment, f.engagement_rate
FROM POSTS p
JOIN POST_FEATURES f
    ON f.external_id = p.external_id AND f.platform = p.platform
WHERE f.engagement_rate IS NOT NULL;
