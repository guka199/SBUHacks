"""Authenticated social collection API; /docs is the initial testing interface."""
import os

from fastapi import APIRouter, Depends, Query

from api.social_schemas import HistoricalSnapshot, ImportRequest, JobOut, Platform, RefreshRequest, ScheduleRequest, SocialSnapshot
from api.services import db, social_jobs, social_store as store
from api.services.auth import require_user_id
from api.services.errors import ConfigurationError

router = APIRouter(prefix='/accounts', tags=['social imports'])


def worker_ready():
    if os.getenv('SOCIAL_WORKER_ENABLED', 'false').lower() != 'true':
        raise ConfigurationError('Enable SOCIAL_WORKER_ENABLED=true in one API process to collect social data')


@router.get('/providers/status')
def provider_status(user: str = Depends(require_user_id)):
    keys = ['APIFY_API_TOKEN', 'PHANTOMBUSTER_API_KEY', 'PHANTOMBUSTER_LINKEDIN_PROFILE_AGENT_ID',
            'PHANTOMBUSTER_LINKEDIN_POSTS_AGENT_ID', 'PHANTOMBUSTER_LINKEDIN_COMPANY_AGENT_ID', 'YOUTUBE_API_KEY']
    return {'configured': {k: bool(os.getenv(k)) for k in keys},
            'enabled': {'phantombuster': os.getenv('PHANTOMBUSTER_ENABLED', 'false').lower() == 'true'},
            'worker_enabled': os.getenv('SOCIAL_WORKER_ENABLED', 'false').lower() == 'true',
            'note': 'Configuration presence only, not a live credential/access check.'}


@router.get('/imports')
def imports(user: str = Depends(require_user_id)):
    rows = db.query('SELECT * FROM SOCIAL_LINKS WHERE user_id = %s ORDER BY platform', (user,))
    return [{k: row.get(k) for k in ('platform', 'profile_url', 'max_posts', 'active_job', 'snapshot_id', 'interval_hours', 'next_refresh')} for row in rows]


@router.post('/import', response_model=JobOut, status_code=202)
def import_profile(req: ImportRequest, user: str = Depends(require_user_id)):
    worker_ready()
    social_jobs.require_config(req)
    return store.job_out(store.enqueue(user, req))


@router.get('/jobs/{job_id}', response_model=JobOut)
def get_job(job_id: str, user: str = Depends(require_user_id)):
    return store.job_out(store.get_job(user, job_id))


@router.post('/{platform}/refresh', response_model=JobOut, status_code=202)
def refresh(platform: Platform, req: RefreshRequest, user: str = Depends(require_user_id)):
    worker_ready()
    connection = store.link(user, platform)
    request = ImportRequest(platform=platform, profile_url=connection['profile_url'], max_posts=connection['max_posts'], authorized=True)
    social_jobs.require_config(request)
    return store.job_out(store.enqueue(user, request, acknowledge=req.acknowledge_uncertain_launch))


@router.get('/{platform}/stats', response_model=SocialSnapshot)
def statistics(platform: Platform, user: str = Depends(require_user_id)):
    return store.stats(user, platform)


@router.get('/{platform}/posts')
def posts(platform: Platform, offset: int = Query(0, ge=0), limit: int = Query(30, ge=1, le=100), user: str = Depends(require_user_id)):
    snapshot = store.stats(user, platform)
    return {'platform': platform, 'last_updated': snapshot['last_updated'], 'total': len(snapshot['posts']),
            'offset': offset, 'posts': snapshot['posts'][offset:offset + limit], 'scope': 'latest collected sample'}


@router.get('/{platform}/history', response_model=list[HistoricalSnapshot])
def history(platform: Platform, limit: int = Query(10, ge=1, le=100), user: str = Depends(require_user_id)):
    return store.history(user, platform, limit)


@router.put('/{platform}/schedule')
def schedule(platform: Platform, req: ScheduleRequest, user: str = Depends(require_user_id)):
    if req.interval_hours:
        worker_ready()
        connection = store.link(user, platform)
        social_jobs.require_config(ImportRequest(platform=platform, profile_url=connection['profile_url'],
                                                authorized=True, max_posts=connection['max_posts']))
    return store.schedule(user, platform, req.interval_hours)
