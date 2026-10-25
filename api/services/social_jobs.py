"""Single-process durable poller. Network I/O is async; DB/YouTube work runs in threads.

Launch intent is committed BEFORE a paid POST. If the process stops before its ID
is saved, the next attempt requires operator review rather than duplicating spend.
"""
import asyncio
import json
import logging
import os
import time

import httpx
from starlette.concurrency import run_in_threadpool as thread

from api.social_schemas import ImportRequest, SocialSnapshot
from api.services import apify, db, phantombuster, social_store as store, youtube
from api.services.errors import ConfigurationError, ServiceError
from api.services.social_http import ProviderError
from api.services.social_normalize import normalize, youtube_snapshot

log = logging.getLogger(__name__)


def require_config(req):
    if req.platform in ('instagram', 'tiktok'):
        apify.headers()
    elif req.platform == 'linkedin':
        phantombuster.headers()
        if '/company/' in req.profile_url:
            phantombuster.agent('company')
        else:
            phantombuster.agent('profile')
            phantombuster.agent('posts')
    elif not os.getenv('YOUTUBE_API_KEY'):
        raise ConfigurationError('Configure YOUTUBE_API_KEY on the backend')


async def step(job, client):
    req = ImportRequest.model_validate_json(job['request_json'])
    state, phase = json.loads(job['state_json']), job['phase']
    if phase.endswith('_launching'):
        await thread(store.update, job, status='needs_attention', error='Launch outcome unknown after restart. Inspect provider console before acknowledging a new launch.')
        return
    if time.time() > job['deadline']:
        await thread(store.update, job, status='needs_attention' if state.get('run_id') else 'failed', error='Refresh exceeded 30 minutes. Existing statistics were retained; inspect provider console for remote work.')
        return
    try:
        require_config(req)
        if req.platform == 'youtube':
            result = await thread(youtube.fetch_channel, req.profile_url, req.max_posts)
            await thread(store.complete, job, youtube_snapshot(result, req.profile_url, req.max_posts))
            return
        if phase in ('queued', 'posts_queued'):
            kind = ('company' if '/company/' in req.profile_url else 'profile') if phase == 'queued' else 'posts'
            marker = f'{kind}_launching'
            await thread(store.update, job, phase=marker, progress=10 if kind != 'posts' else 55, state=state)
            try:
                run_id = (await apify.start(client, req.platform, req.profile_url, req.max_posts)
                          if req.platform != 'linkedin' else await phantombuster.start(client, kind, req.profile_url, req.max_posts))
            except ProviderError as exc:
                if exc.uncertain:
                    await thread(store.update, job, status='needs_attention', phase=marker, state=state, error=str(exc))
                    return
                raise
            state.update(run_id=run_id, kind=kind)
            state.setdefault('provider_runs', {})[kind] = run_id
            await thread(store.update, job, phase='polling', progress=20 if kind != 'posts' else 65, state=state)
            return
        if phase == 'polling':
            if req.platform != 'linkedin':
                dataset = await apify.poll(client, state['run_id'])
                if not dataset:
                    await thread(store.update, job, state=state)
                    return
                state['dataset_id'] = dataset
            else:
                if not await phantombuster.poll(client, state['run_id']):
                    await thread(store.update, job, state=state)
                    return
            await thread(store.update, job, phase='results', progress=45 if req.platform == 'linkedin' and state['kind'] != 'posts' else 85, state=state, delay=0)
            return
        if phase == 'results':
            if req.platform != 'linkedin':
                rows = await apify.results(client, state['dataset_id'], 1 if req.platform == 'instagram' else req.max_posts)
                result = normalize(req.platform, req.profile_url, rows, req.max_posts)
            else:
                kind = state['kind']
                rows = await phantombuster.results(client, state['run_id'], req.max_posts if kind == 'posts' else 1, kind)
                if kind in ('profile', 'company'):
                    result = normalize('linkedin', req.profile_url, rows, req.max_posts)
                    if kind == 'profile':
                        # Persist only whitelisted normalized fields between agent runs.
                        state['profile'] = result.model_dump()
                        state.pop('run_id', None)
                        await thread(store.update, job, phase='posts_queued', progress=50, state=state, delay=0)
                        return
                    result.warnings.append('Company profile imported; company activity extraction is not configured by this adapter.')
                else:
                    p = SocialSnapshot.model_validate(state['profile'])
                    result = normalize('linkedin', req.profile_url,
                                       [{'profileUrl': req.profile_url, 'fullName': p.display_name,
                                         'followersCount': p.followers, 'id': p.external_id}], req.max_posts, post_rows=rows)
                    if rows and not result.posts:
                        raise ProviderError('LinkedIn activity schema/author mismatch; verify export mapping. Previous data retained.')
            await thread(store.complete, job, result)
            return
        raise ProviderError('Unrecognized refresh phase')
    except ProviderError as exc:
        attempts = state.get('retries', 0) + 1
        state['retries'] = attempts
        retry = exc.retryable and attempts <= 5
        terminal = 'needs_attention' if state.get('run_id') and exc.retryable else 'failed'
        await thread(store.update, job, status='retrying' if retry else terminal, phase=phase,
                     state=state, delay=max(exc.retry_after, min(900, 15 * 2**attempts)), error=str(exc))
    except ServiceError as exc:
        await thread(store.update, job, status='failed', state=state, error=str(exc))
    except Exception:
        # Do not log provider response/exception text: it can contain private data.
        log.error('Social refresh %s stopped due to an internal processing/storage error', job['id'])
        # A launch marker already saved in DB must remain for safe restart handling.
        current = await thread(store.get_job, job['user_id'], job['id'])
        await thread(store.update, current, status='needs_attention', error='Internal processing/storage error. Inspect server configuration before retrying.')


async def tick(client):
    due = await thread(db.query, 'SELECT * FROM SOCIAL_LINKS WHERE next_refresh <= %s ORDER BY next_refresh LIMIT 5', (time.time(),))
    for connection in due:
        try:
            req = ImportRequest(platform=connection['platform'], profile_url=connection['profile_url'], authorized=True, max_posts=connection['max_posts'])
            require_config(req)
            await thread(store.enqueue, connection['user_id'], req)
        except ServiceError:
            pass  # current job/cooldown/config failure; retry schedule later, never busy loop
        await thread(db.execute, 'UPDATE SOCIAL_LINKS SET next_refresh = %s WHERE user_id = %s AND platform = %s',
                     (time.time() + (connection.get('interval_hours') or 6) * 3600, connection['user_id'], connection['platform']))
    jobs = await thread(db.query, "SELECT * FROM SOCIAL_JOBS WHERE job_status IN ('queued','running','retrying') AND next_poll <= %s ORDER BY created_at LIMIT 5", (time.time(),))
    for job in jobs:
        await step(job, client)


async def run(stop: asyncio.Event):
    async with httpx.AsyncClient() as client:
        while not stop.is_set():
            try:
                await tick(client)
            except Exception:
                log.error('Social refresh poller could not access job storage; retrying next tick')
            try:
                await asyncio.wait_for(stop.wait(), timeout=5)
            except asyncio.TimeoutError:
                pass
