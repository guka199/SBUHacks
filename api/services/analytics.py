"""User-scoped datasets for the dashboard; no frontend presentation logic."""

from api.schemas import DashboardResponse
from api.services import snowflake
from api.services.posts import validate_user_id

ENGAGEMENT = """(COALESCE(likes,0)+COALESCE(comments,0)+COALESCE(shares,0)) /
    NULLIF(COALESCE(NULLIF(views,0),followers),0)"""
STATS = f"""COUNT(*) AS posts, COALESCE(AVG({ENGAGEMENT}),0)::FLOAT AS avg_engagement_rate,
    COALESCE(SUM(views),0) AS total_views"""


def records(cur, sql: str, params: tuple) -> list[dict]:
    cur.execute(sql, params)
    names = [c[0].lower() for c in cur.description]
    return [dict(zip(names, row)) for row in cur.fetchall()]


def dashboard(user_id: str, days: int | None = None) -> DashboardResponse:
    user_id = validate_user_id(user_id)
    selected = """WITH selected AS (SELECT * FROM POSTS WHERE user_id=%s
        AND (%s IS NULL OR posted_at >= DATEADD(day,-%s,CURRENT_TIMESTAMP()))) """
    params = (user_id, days, days)
    with snowflake.get_connection() as conn, conn.cursor() as cur:
        platforms = records(cur, selected + f"SELECT platform,{STATS} FROM selected GROUP BY platform ORDER BY platform", params)
        by_format = records(cur, selected + f"""SELECT platform,COALESCE(format,'unknown') AS format,{STATS}
            FROM selected GROUP BY platform,COALESCE(format,'unknown') ORDER BY platform,format""", params)
        weekly = records(cur, selected + f"""SELECT platform,DATE_TRUNC('week',posted_at)::DATE AS week,{STATS}
            FROM selected WHERE posted_at IS NOT NULL GROUP BY platform,week ORDER BY week,platform""", params)
        recent = records(cur, selected + """SELECT p.platform,p.format,p.external_id,COALESCE(p.caption,'') AS caption,p.posted_at,
            p.thumbnail_url,COALESCE(p.views,0) AS views,COALESCE(p.likes,0) AS likes,
            COALESCE(p.comments,0) AS comments,COALESCE(p.shares,0) AS shares,p.followers,
            f.sentiment_label AS sentiment FROM selected p LEFT JOIN POST_FEATURES f
                ON f.user_id=p.user_id AND f.platform=p.platform AND f.external_id=p.external_id
                AND f.caption_hash=SHA2(p.caption,256)
            ORDER BY p.posted_at DESC NULLS LAST,p.external_id LIMIT 20""", params)
        totals = records(cur, selected + "SELECT COUNT(*) AS total_posts,MAX(loaded_at) AS last_import_at FROM selected", params)[0]
        accounts = records(cur, "SELECT platform,handle,followers FROM ACCOUNTS WHERE user_id=%s ORDER BY platform,handle", (user_id,))
    return DashboardResponse(user_id=user_id, platforms=platforms, by_format=by_format, weekly=weekly,
                             recent_posts=recent, accounts=accounts, **totals)
