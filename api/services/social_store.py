"""Durable job state and atomic normalized snapshots in the existing app database."""
import json
import time
import uuid

from api.services import accounts, db
from api.services.errors import ServiceError

ACTIVE = ('queued', 'running', 'retrying')
COOLDOWN_SECONDS = 900


def job_out(row):
    return {**{k: str(row[k]) if k in ('created_at', 'updated_at') else row.get(k)
               for k in ('id', 'platform', 'phase', 'progress', 'created_at', 'updated_at', 'snapshot_id')},
            'status': row['job_status'], 'error': row.get('error_message')}


def get_job(user_id, job_id):
    rows = db.query('SELECT * FROM SOCIAL_JOBS WHERE user_id = %s AND id = %s', (user_id, job_id))
    if not rows:
        raise ServiceError('Social refresh job not found', 404)
    return rows[0]


def link(user_id, platform):
    rows = db.query('SELECT * FROM SOCIAL_LINKS WHERE user_id = %s AND platform = %s', (user_id, platform))
    if not rows:
        raise ServiceError('Import a profile URL for this platform first', 404)
    return rows[0]


def enqueue(user_id, req, *, acknowledge=False):
    now = time.time()
    with db.transaction() as tx:
        if not tx.execute('SELECT id FROM USERS WHERE id = %s', (user_id,)):
            raise ServiceError('Sign in again', 401)
        links = tx.execute('SELECT * FROM SOCIAL_LINKS WHERE user_id = %s AND platform = %s', (user_id, req.platform))
        old = links[0] if links else None
        if old and old['profile_url'] != req.profile_url:
            raise ServiceError('One imported profile per platform: unlink the existing profile before changing URLs', 409)
        previous = tx.execute('SELECT * FROM SOCIAL_JOBS WHERE id = %s', (old['active_job'],)) if old and old['active_job'] else []
        if previous:
            prev = previous[0]
            if prev['job_status'] in ACTIVE:
                if old['profile_url'] != req.profile_url:
                    raise ServiceError('Wait for the current platform import before changing profiles', 409)
                return prev
            if prev['job_status'] == 'needs_attention' and not acknowledge:
                raise ServiceError('An earlier launch is uncertain. Inspect the provider console, then acknowledge_uncertain_launch on refresh', 409)
        if old and old['last_requested'] and now - old['last_requested'] < COOLDOWN_SECONDS:
            raise ServiceError('Refresh cooldown is 15 minutes; use the saved statistics', 429)
        job_id, stamp = uuid.uuid4().hex, db.now()
        tx.execute('INSERT INTO SOCIAL_JOBS (id,user_id,platform,job_status,phase,progress,request_json,state_json,created_at,updated_at,next_poll,deadline) '
                   'VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                   (job_id, user_id, req.platform, 'queued', 'queued', 0, req.model_dump_json(), '{}', stamp, stamp, now, now + 1800))
        if old:
            tx.execute('UPDATE SOCIAL_LINKS SET active_job = %s, last_requested = %s WHERE user_id = %s AND platform = %s',
                       (job_id, now, user_id, req.platform))
        else:
            tx.execute('INSERT INTO SOCIAL_LINKS (user_id,platform,profile_url,max_posts,active_job,last_requested) VALUES (%s,%s,%s,%s,%s,%s)',
                       (user_id, req.platform, req.profile_url, req.max_posts, job_id, now))
        return tx.execute('SELECT * FROM SOCIAL_JOBS WHERE id = %s', (job_id,))[0]


def update(job, *, status='running', phase=None, progress=None, state=None, delay=10, error=None):
    db.execute('UPDATE SOCIAL_JOBS SET job_status = %s, phase = %s, progress = %s, state_json = %s, '
               'updated_at = %s, next_poll = %s, error_message = %s WHERE id = %s AND user_id = %s',
               (status, phase or job['phase'], progress if progress is not None else job['progress'],
                json.dumps(state if state is not None else json.loads(job['state_json'])), db.now(),
                time.time() + delay, error, job['id'], job['user_id']))


def complete(job, result):
    user, platform, jid = job['user_id'], job['platform'], job['id']
    request = json.loads(job['request_json'])
    with db.transaction() as tx:
        links = tx.execute('SELECT * FROM SOCIAL_LINKS WHERE user_id = %s AND platform = %s AND active_job = %s', (user, platform, jid))
        if not links or not tx.execute('SELECT id FROM USERS WHERE id = %s', (user,)):
            return  # unlink/account deletion during collection must never resurrect data
        if tx.execute('SELECT id FROM SOCIAL_SNAPSHOTS WHERE id = %s', (jid,)):
            return
        existing = tx.execute('SELECT * FROM ACCOUNTS WHERE user_id = %s AND platform = %s', (user, platform))
        old = existing[0] if existing else {}
        extra = json.loads(old.get('extra') or '{}')
        extra['social_data'] = {'source': result.data_source, 'as_of': result.last_updated,
                                'metrics': result.metrics, 'warnings': result.warnings,
                                'recent_content': [{'caption': p.caption[:350], 'views': p.views, 'posted_at': p.posted_at}
                                                   for p in result.posts[:5]]}
        values = dict(connection='api', handle=result.username, external_id=result.external_id,
                      display_name=result.display_name, profile_url=result.profile_url, followers=result.followers,
                      following=result.following, total_posts=result.total_posts,
                      **{k: result.metrics.get(k) for k in ('avg_views', 'typical_views', 'avg_likes', 'avg_comments',
                                                           'avg_shares', 'engagement_rate', 'posts_per_week')},
                      audience=old.get('audience') or '{}', extra=json.dumps(extra))
        tx.execute('DELETE FROM ACCOUNTS WHERE user_id = %s AND platform = %s', (user, platform))
        fields = accounts.ACCOUNT_FIELDS
        columns = ['id', 'user_id', 'platform', *[accounts.COLUMNS.get(f, f) for f in fields], 'updated_at']
        tx.execute(f"INSERT INTO ACCOUNTS ({','.join(columns)}) VALUES ({','.join(['%s'] * len(columns))})",
                   (old.get('id') or uuid.uuid4().hex, user, platform, *[values.get(f) for f in fields], db.now()))
        if old.get('profile_url') and old['profile_url'] != result.profile_url:
            tx.execute('DELETE FROM POSTS WHERE user_id = %s AND platform = %s', (user, platform))
        for p in result.posts:
            tx.execute('DELETE FROM POSTS WHERE user_id = %s AND platform = %s AND external_id = %s', (user, platform, p.post_id))
            posted = p.posted_at.replace('T', ' ').removesuffix('Z') if p.posted_at else None
            tx.execute('INSERT INTO POSTS (user_id,platform,format,external_id,caption,posted_at,views,likes,comments,shares,followers,loaded_at) '
                       'VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)',
                       (user, platform, p.format, p.post_id, p.caption, posted, p.views, p.likes, p.comments, p.shares, result.followers, db.now()))
        tx.execute('INSERT INTO SOCIAL_SNAPSHOTS (id,user_id,platform,captured_at,payload) VALUES (%s,%s,%s,%s,%s)',
                   (jid, user, platform, result.last_updated, result.model_dump_json()))
        hours = links[0].get('interval_hours')
        tx.execute('UPDATE SOCIAL_LINKS SET profile_url = %s, max_posts = %s, snapshot_id = %s, next_refresh = %s WHERE user_id = %s AND platform = %s',
                   (result.profile_url, request['max_posts'], jid, time.time() + hours * 3600 if hours else None, user, platform))
        tx.execute('UPDATE SOCIAL_JOBS SET job_status = %s, phase = %s, progress = %s, snapshot_id = %s, updated_at = %s, error_message = NULL WHERE id = %s',
                   ('succeeded', 'complete', 100, jid, db.now(), jid))


def stats(user, platform):
    connection = link(user, platform)
    rows = db.query('SELECT payload FROM SOCIAL_SNAPSHOTS WHERE user_id = %s AND id = %s', (user, connection.get('snapshot_id')))
    if not rows:
        raise ServiceError('No successful snapshot yet; check the refresh job', 404)
    return json.loads(rows[0]['payload'])


def history(user, platform, limit):
    rows = db.query('SELECT id,captured_at,payload FROM SOCIAL_SNAPSHOTS WHERE user_id = %s AND platform = %s ORDER BY captured_at DESC LIMIT %s', (user, platform, limit))
    return [{'snapshot_id': r['id'], **json.loads(r['payload'])} for r in rows]


def schedule(user, platform, hours):
    link(user, platform)
    due = time.time() + hours * 3600 if hours else None
    db.execute('UPDATE SOCIAL_LINKS SET interval_hours = %s, next_refresh = %s WHERE user_id = %s AND platform = %s', (hours, due, user, platform))
    return {'platform': platform, 'interval_hours': hours, 'next_refresh_epoch': due}
