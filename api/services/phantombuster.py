"""Launch configured, authorized LinkedIn agents; consume bounded JSON/CSV exports.

The operator connects LinkedIn IN PhantomBuster. ViralPilot never reads an agent's
saved argument (it may contain a session cookie). bonusArgument is single-use.
"""
import csv
import io
import json
import os
from itertools import islice
from urllib.parse import urlsplit

from api.services.errors import ConfigurationError
from api.services.social_http import ProviderError, request
from api.services.apify import identifier

BASE = 'https://api.phantombuster.com/api/v2'


def headers():
    if os.getenv('PHANTOMBUSTER_ENABLED', 'false').lower() != 'true':
        raise ConfigurationError('Automatic LinkedIn collection is disabled. Manual LinkedIn statistics remain available.')
    token = os.getenv('PHANTOMBUSTER_API_KEY')
    if not token:
        raise ConfigurationError('Configure PHANTOMBUSTER_API_KEY on the backend')
    name = os.getenv('PHANTOMBUSTER_KEY_HEADER', 'X-Phantombuster-Key-1')
    if name not in ('X-Phantombuster-Key', 'X-Phantombuster-Key-1'):
        raise ConfigurationError('Unsupported PHANTOMBUSTER_KEY_HEADER')
    return {name: token}


def agent(kind):
    key = f'PHANTOMBUSTER_LINKEDIN_{kind.upper()}_AGENT_ID'
    value = os.getenv(key)
    if not value:
        raise ConfigurationError(f'Configure {key} with an authorized LinkedIn agent')
    return identifier(value)


async def start(client, kind, profile_url, max_posts):
    # Different Phantoms have different input fields. Operator must confirm in
    # the provider UI. Defaults match spreadsheet/profile-URL based Phantoms.
    input_key = os.getenv(f'PHANTOMBUSTER_LINKEDIN_{kind.upper()}_INPUT_KEY', 'spreadsheetUrl')
    limit_key = os.getenv(f'PHANTOMBUSTER_LINKEDIN_{kind.upper()}_LIMIT_KEY', '')
    input_keys = {'spreadsheetUrl', 'profileUrl', 'profileUrls', 'companyUrl'}
    limit_keys = {'numberOfPosts', 'numberOfProfiles', 'numberOfLinesPerLaunch',
                  'numberOfAddsPerLaunch', 'numberMaxOfPosts'}
    if input_key not in input_keys or (limit_key and limit_key not in limit_keys):
        raise ConfigurationError('Unsupported PhantomBuster input/limit field configuration')
    bonus = {input_key: profile_url}
    if limit_key:
        bonus[limit_key] = max_posts if kind == 'posts' else 1
    data = await request(client, 'POST', f'{BASE}/agents/launch', headers=headers(),
                         body={'id': agent(kind), 'bonusArgument': bonus, 'saveArgument': False, 'maxInstanceCount': 1})
    try:
        return identifier(str(data['containerId']))
    except (KeyError, TypeError, ProviderError):
        raise ProviderError('PhantomBuster launch omitted a container ID; inspect provider console', uncertain=True) from None


async def poll(client, container_id):
    data = await request(client, 'GET', f'{BASE}/containers/fetch', headers=headers(), params={'id': identifier(container_id)})
    if not isinstance(data, dict):
        raise ProviderError('PhantomBuster returned invalid container metadata')
    status = str(data.get('status', '')).lower()
    if status in ('starting', 'running', 'launching', 'queued'):
        return False
    if status in ('finished', 'success', 'succeeded'):
        # Actual v2 container metadata exposes endType, while webhooks/other
        # envelopes may include exitCode. A valid result is still required by
        # normalization; a finished process alone is not an imported profile.
        code, reason = data.get('exitCode'), data.get('endType')
        if (code is not None and code != 0) or (reason is not None and reason != 'finished'):
            known = {'agent timeout': 'agent timeout', 'org timeout': 'workspace timeout',
                     'global timeout': 'global timeout', 'killed': 'stopped'}
            detail = known.get(reason, 'unsuccessful execution')
            raise ProviderError(f'PhantomBuster agent ended with {detail}; inspect provider configuration')
        if code == 0 or reason == 'finished':
            return True
        raise ProviderError('PhantomBuster completion metadata is missing; verify container state in provider console')
    if status in ('error', 'failed', 'stopped', 'killed'):
        raise ProviderError('PhantomBuster agent failed; inspect its container in the provider console')
    raise ProviderError('Unknown PhantomBuster container state; verify configured agent API response')


def parse_export(payload, *, csv_format=False):
    try:
        if isinstance(payload, bytes):
            payload = payload.decode('utf-8-sig')
        if isinstance(payload, str):
            payload = list(islice(csv.DictReader(io.StringIO(payload)), 10001)) if csv_format else json.loads(payload)
        if isinstance(payload, dict) and 'resultObject' in payload:
            return parse_export(payload['resultObject'])
        if not isinstance(payload, list) or len(payload) > 10000 or any(not isinstance(r, dict) for r in payload):
            raise ValueError()
        return payload
    except (ValueError, UnicodeError, csv.Error, RecursionError):
        raise ProviderError('Unsupported PhantomBuster export; configure a JSON/CSV row export') from None


async def results(client, container_id, limit, kind):
    data = await request(client, 'GET', f'{BASE}/containers/fetch-result-object', headers=headers(), params={'id': identifier(container_id)})
    if isinstance(data, dict) and 'resultObject' in data:
        data = data['resultObject']
    if isinstance(data, str):
        try:
            data = json.loads(data)
        except ValueError:
            raise ProviderError('Unsupported PhantomBuster result object') from None
    if isinstance(data, dict) and (data.get('jsonUrl') or data.get('csvUrl')):
        url = data.get('jsonUrl') or data['csvUrl']
        try:
            u = urlsplit(url)
            # Exact allowlist, no suffix matching or redirects. Key never goes to S3.
            allowed = {'phantombuster.s3.amazonaws.com'} | set(filter(None, os.getenv('PHANTOMBUSTER_EXPORT_HOSTS', '').split(',')))
            safe = u.scheme == 'https' and u.hostname in allowed and not u.username and not u.password and not u.port
        except (TypeError, ValueError):
            safe = False
        if not safe:
            raise ProviderError('Export host is not in PHANTOMBUSTER_EXPORT_HOSTS')
        payload = await request(client, 'GET', url, raw=True)
        rows = parse_export(payload, csv_format=not bool(data.get('jsonUrl')))
    else:
        rows = parse_export(data)
    # Optional explicit export-column mapping, configured by operator only.
    try:
        mapping = json.loads(os.getenv(f'PHANTOMBUSTER_LINKEDIN_{kind.upper()}_FIELD_MAP', '{}'))
        if not isinstance(mapping, dict) or any(not isinstance(v, str) for v in mapping.values()):
            raise ValueError()
    except ValueError:
        raise ConfigurationError('PhantomBuster field mapping must be a JSON object of column names') from None
    return [{**r, **{target: r.get(source) for target, source in mapping.items()}} for r in rows[:limit]]
