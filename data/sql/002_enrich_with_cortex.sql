-- Manual worksheet equivalent of POST /data/enrich (first 25 pending posts for one user).
-- Select your database/schema and run 001_create_tables.sql first.
-- Cortex requires SNOWFLAKE.CORTEX_USER (or AI_FUNCTIONS_USER) and USE AI FUNCTIONS.
-- Current AI_* functions work for new accounts where legacy CORTEX functions may be unavailable.
SET POSTPILOT_USER_ID = 'demo';

MERGE INTO POST_FEATURES f USING (
    SELECT pending.*, AI_SENTIMENT(LEFT(caption,1000)) AS analysis,
           AI_EMBED('snowflake-arctic-embed-m',LEFT(caption,1000)) AS embedding
    FROM (
        SELECT p.user_id,p.platform,p.external_id,p.caption,SHA2(p.caption,256) AS caption_hash,
            (COALESCE(p.likes,0)+COALESCE(p.comments,0)+COALESCE(p.shares,0)) /
            NULLIF(COALESCE(NULLIF(p.views,0),p.followers),0) AS engagement_rate
        FROM POSTS p LEFT JOIN POST_FEATURES existing
            ON existing.user_id=p.user_id AND existing.platform=p.platform AND existing.external_id=p.external_id
        WHERE p.user_id=$POSTPILOT_USER_ID AND p.external_id IS NOT NULL AND NULLIF(TRIM(p.caption),'') IS NOT NULL
            AND (existing.caption_hash IS NULL OR existing.caption_hash<>SHA2(p.caption,256)
                 OR existing.sentiment_details IS NULL OR existing.caption_embedding IS NULL)
        ORDER BY p.loaded_at DESC,p.platform,p.external_id LIMIT 25
    ) pending
) s ON f.user_id=s.user_id AND f.platform=s.platform AND f.external_id=s.external_id
WHEN MATCHED THEN UPDATE SET
    sentiment_details=s.analysis,sentiment_label=s.analysis:categories[0]:sentiment::STRING,
    sentiment=CASE s.analysis:categories[0]:sentiment::STRING
        WHEN 'positive' THEN 1 WHEN 'negative' THEN -1 WHEN 'neutral' THEN 0 ELSE NULL END,
    caption_embedding=s.embedding,caption_hash=s.caption_hash,engagement_rate=s.engagement_rate
WHEN NOT MATCHED THEN INSERT
    (user_id,platform,external_id,sentiment_details,sentiment_label,sentiment,caption_embedding,caption_hash,engagement_rate)
VALUES (s.user_id,s.platform,s.external_id,s.analysis,s.analysis:categories[0]:sentiment::STRING,
    CASE s.analysis:categories[0]:sentiment::STRING
        WHEN 'positive' THEN 1 WHEN 'negative' THEN -1 WHEN 'neutral' THEN 0 ELSE NULL END,
    s.embedding,s.caption_hash,s.engagement_rate);

CREATE OR REPLACE VIEW TRAINING_DATA AS
SELECT p.user_id,p.platform,p.caption,p.posted_at,p.views,p.likes,p.comments,p.shares,p.followers,
       f.sentiment,f.engagement_rate
FROM POSTS p JOIN POST_FEATURES f
    ON f.user_id=p.user_id AND f.external_id=p.external_id AND f.platform=p.platform
    AND f.caption_hash=SHA2(p.caption,256)
WHERE f.engagement_rate IS NOT NULL;
