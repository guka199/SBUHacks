"""Apify Instagram details and TikTok profile runs. No synchronous paid-run retries."""
import os
import re

from api.services.errors import ConfigurationError
from api.services.social_http import ProviderError, request

BASE = 'https://api.apify.com/v2'
ACTORS = {'instagram': 'apify~instagram-scraper', 'tiktok': 'clockworks~tiktok-scraper'}


def headers():
    token = os.getenv('APIFY_API_TOKEN')
    if not token:
        raise ConfigurationError('Configure APIFY_API_TOKEN on the backend')
    return {'Authorization': f'Bearer {token}'}


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', value):
        raise ProviderError('Provider returned an invalid resource identifier')
    return value


async def start(client, platform, profile_url, max_posts):
    payload = ({'directUrls': [profile_url], 'resultsType': 'details', 'resultsLimit': 1}
               if platform == 'instagram' else
               {'profiles': [profile_url.split('/')[-1].lstrip('@')], 'resultsPerPage': max_posts,
                'profileScrapeSections': ['videos'], 'profileSorting': 'latest', 'scrapeRelatedVideos': False,
                'shouldDownloadAvatars': False, 'shouldDownloadMusicCovers': False,
                'shouldDownloadSlideshowImages': False,
                'shouldDownloadVideos': False, 'shouldDownloadCovers': False,
                'shouldDownloadSubtitles': False})
    data = await request(client, 'POST', f'{BASE}/acts/{ACTORS[platform]}/runs', headers=headers(),
                         params={'timeout': 600, 'memory': 1024}, body=payload)
    try:
        return identifier(data['data']['id'])
    except (KeyError, TypeError, ProviderError):
        raise ProviderError('Apify launch response omitted a valid run ID; inspect the provider console', uncertain=True) from None


async def poll(client, run_id):
    data = await request(client, 'GET', f'{BASE}/actor-runs/{identifier(run_id)}', headers=headers())
    run = data.get('data', {}) if isinstance(data, dict) else {}
    status = run.get('status')
    if status in ('FAILED', 'TIMED-OUT', 'ABORTED'):
        raise ProviderError('Apify scraper did not complete; inspect its run in the provider console')
    if status in ('READY', 'RUNNING', 'ABORTING', 'TIMING-OUT'):
        return None
    if status != 'SUCCEEDED':
        raise ProviderError('Apify returned an unknown run state')
    return identifier(run.get('defaultDatasetId'))


async def results(client, dataset_id, limit):
    rows = await request(client, 'GET', f'{BASE}/datasets/{identifier(dataset_id)}/items', headers=headers(),
                         params={'format': 'json', 'clean': 'true', 'limit': limit, 'offset': 0})
    if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
        raise ProviderError('Apify returned an invalid dataset')
    return rows[:limit]
