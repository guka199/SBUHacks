"""Offline contracts, real SQLite persistence and HTTP job flows; no paid calls."""
import asyncio
import copy
import json
import os
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch

import httpx
from fastapi.testclient import TestClient
from pydantic import ValidationError

from api.main import app
from api.social_schemas import ImportRequest
from api.services import accounts, apify, db, phantombuster as pb, social_jobs as jobs, social_store as store
from api.services.auth import COOKIE_NAME, create_session
from api.services.errors import ServiceError
from api.services.social_http import ProviderError
from api.services.social_normalize import count, normalize, timestamp, youtube_snapshot
from api.services.youtube import ChannelImport

FIXTURES = Path(__file__).parent / 'fixtures' / 'social'


def fixture(name):
    return json.loads((FIXTURES / f'{name}.json').read_text())


def request(platform='tiktok'):
    paths = {'tiktok': '@viralpilot_fixture', 'instagram': 'viralpilot_fixture',
             'linkedin': 'in/viralpilot-fixture', 'youtube': '@viralpilot_fixture'}
    domains = {'tiktok': 'tiktok.com', 'instagram': 'instagram.com', 'linkedin': 'linkedin.com', 'youtube': 'youtube.com'}
    return ImportRequest(platform=platform, profile_url=f'https://www.{domains[platform]}/{paths[platform]}', authorized=True)


def normalized(platform='tiktok'):
    req = request(platform)
    rows = fixture('linkedin_profile' if platform == 'linkedin' else platform)
    posts = pb.parse_export((FIXTURES / 'linkedin_posts.csv').read_bytes(), csv_format=True) if platform == 'linkedin' else None
    return normalize(platform, req.profile_url, rows, post_rows=posts)


class NormalizationTests(unittest.TestCase):
    def test_instagram_missing_counters_not_zero_and_profile_separate_from_sample(self):
        result = normalized('instagram')
        self.assertEqual(result.followers, 12500)
        self.assertEqual(result.total_posts, 84)
        self.assertEqual(len(result.posts), 2)
        self.assertIsNone(result.posts[0].shares)
        self.assertIsNone(result.posts[1].views)
        self.assertEqual(result.posts[1].likes, 0)
        self.assertEqual(result.metrics['likes_sample_size'], 2)
        self.assertIsNone(result.metrics['engagement_rate'])

    def test_tiktok_nested_and_dotted_fields_and_complete_engagement_denominator(self):
        result = normalized()
        self.assertEqual(result.followers, 18000)
        self.assertEqual(result.metrics['avg_views'], 15000)
        self.assertAlmostEqual(result.metrics['engagement_rate'], 2340 / 30000)
        self.assertEqual(result.metrics['engagement_sample_size'], 1)
        self.assertEqual(result.metrics['engagement_basis'], 'views')
        self.assertEqual(result.posts[1].views, 0)

    def test_private_foreign_and_error_rows_rejected(self):
        rows = fixture('instagram')
        rows[0]['private'] = True
        for platform, payload in [('instagram', rows), ('tiktok', [{'error': 'private'}]), ('linkedin', [{'fullName': 'Unscoped'}])]:
            with self.subTest(platform=platform), self.assertRaises(ServiceError):
                normalize(platform, request(platform).profile_url, payload)

    def test_scoped_provider_error_row_is_not_an_empty_success(self):
        rows = fixture('instagram')
        rows[0]['error'] = 'provider internal failure with sensitive details'
        with self.assertRaises(ServiceError) as exc:
            normalize('instagram', request('instagram').profile_url, rows)
        self.assertNotIn('sensitive details', str(exc.exception))

    def test_post_dedup_and_foreign_creator_filtered(self):
        rows = fixture('tiktok')
        rows.append(copy.deepcopy(rows[0]))
        foreign = copy.deepcopy(rows[0])
        foreign['id'], foreign['authorMeta']['name'] = 'foreign', 'someone_else'
        rows.append(foreign)
        result = normalize('tiktok', request().profile_url, rows)
        self.assertEqual(len(result.posts), 2)

    def test_linkedin_csv_missing_shares_and_no_private_views(self):
        result = normalized('linkedin')
        self.assertEqual(result.followers, 2500)
        self.assertEqual(len(result.posts), 2)
        self.assertIsNone(result.posts[1].shares)
        self.assertIsNone(result.posts[0].views)
        self.assertEqual(result.metrics['engagement_basis'], 'followers')
        self.assertAlmostEqual(result.metrics['engagement_rate'], 87 / 2500)

    def test_linkedin_company_employees_are_not_followers(self):
        url = 'https://www.linkedin.com/company/fixture'
        result = normalize('linkedin', url, [{'companyUrl': url, 'companyName': 'Synthetic', 'employeeCount': 100}])
        self.assertIsNone(result.followers)
        self.assertIsNone(result.total_posts)

    def test_official_linkedin_export_columns_and_activity_media(self):
        url = request('linkedin').profile_url
        result = normalize('linkedin', url,
                           [{'profileUrl': url, 'firstName': 'Synthetic', 'lastName': 'Creator',
                             'linkedinFollowersCount': '2,500', 'linkedinConnectionsCount': '500',
                             'linkedinProfileId': 'fixture-profile'}],
                           post_rows=[{'profileUrl': url, 'postUrl': 'https://www.linkedin.com/feed/update/urn:li:activity:1000000000000000001/',
                                       'action': 'Post', 'type': 'Image', 'postContent': 'Synthetic',
                                       'postTimestamp': '1788264000000', 'likeCount': 5, 'commentCount': 1},
                                      {'profileUrl': url, 'postUrl': 'https://www.linkedin.com/feed/update/urn:li:activity:1000000000000000002/',
                                       'action': 'Reaction', 'type': 'Image'}])
        self.assertEqual(result.followers, 2500)
        self.assertEqual(result.external_id, 'fixture-profile')
        self.assertEqual(result.display_name, 'Synthetic Creator')
        self.assertEqual(len(result.posts), 1)
        self.assertEqual(result.posts[0].format, 'image')
        self.assertIsNotNone(result.posts[0].posted_at)
        self.assertIsNone(result.posts[0].shares)

    def test_invalid_counts_and_timestamps(self):
        for value in (-1, True, '1.5K', 'NaN', {}, 1.1):
            self.assertIsNone(count(value))
        self.assertEqual(count('1,234'), 1234)
        self.assertEqual(timestamp('2026-01-01T12:00:00-05:00'), '2026-01-01T17:00:00Z')
        self.assertIsNone(timestamp('a week ago'))

    def test_profile_url_allowlist_and_authorization(self):
        for url in ('http://instagram.com/a', 'https://instagram.com.evil/a', 'https://user:secret@instagram.com/a',
                    'https://instagram.com/p/a', 'https://instagram.com/a?token=secret', 'https://instagram.com:443/a'):
            with self.subTest(url=url), self.assertRaises(ValidationError):
                ImportRequest(platform='instagram', profile_url=url, authorized=True)
        with self.assertRaises(ValidationError):
            ImportRequest(platform='instagram', profile_url='https://instagram.com/a', authorized=False)

    def test_youtube_reads_raw_presence_not_legacy_zero_defaults(self):
        result = youtube_snapshot(ChannelImport({'external_id': 'channel', 'followers': None}, [
            {'external_id': 'v', 'views': 0, 'shares': 0, '_raw_payload': {'statistics': {'viewCount': '0'}}}]), request('youtube').profile_url, 30)
        self.assertEqual(result.posts[0].views, 0)
        self.assertIsNone(result.posts[0].shares)
        self.assertIsNone(result.posts[0].likes)


class ProviderTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'APIFY_API_TOKEN': 'fixture-secret', 'PHANTOMBUSTER_API_KEY': 'pb-secret',
                                         'PHANTOMBUSTER_ENABLED': 'true',
                                         'PHANTOMBUSTER_LINKEDIN_PROFILE_AGENT_ID': '123', 'PHANTOMBUSTER_EXPORT_HOSTS': '',
                                         'PHANTOMBUSTER_KEY_HEADER': 'X-Phantombuster-Key-1'}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)

    async def test_apify_launch_poll_dataset(self):
        calls = []
        def handler(req):
            calls.append(req)
            self.assertEqual(req.headers['Authorization'], 'Bearer fixture-secret')
            self.assertNotIn('fixture-secret', str(req.url))
            if req.method == 'POST':
                body = json.loads(req.content)
                self.assertEqual(body['profiles'], ['viralpilot_fixture'])
                self.assertFalse(body['shouldDownloadVideos'])
                return httpx.Response(201, json={'data': {'id': 'run1'}})
            if '/actor-runs/' in req.url.path:
                return httpx.Response(200, json={'data': {'status': 'SUCCEEDED', 'defaultDatasetId': 'dataset1'}})
            return httpx.Response(200, json=fixture('tiktok'))
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            run = await apify.start(client, 'tiktok', request().profile_url, 30)
            dataset = await apify.poll(client, run)
            result = await apify.results(client, dataset, 30)
        self.assertEqual(len(result), 2)
        self.assertEqual(len(calls), 3)

    async def test_rate_limit_safe_error_and_no_automatic_post_retry(self):
        for status in (429, 401, 503):
            seen = []
            def handler(req):
                seen.append(req)
                return httpx.Response(status, headers={'Retry-After': '120'}, json={'error': 'fixture-secret and private data'})
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                with self.assertRaises(ProviderError) as exc:
                    await apify.start(client, 'instagram', request('instagram').profile_url, 30)
            self.assertEqual(len(seen), 1)
            self.assertNotIn('fixture-secret', str(exc.exception))
            self.assertEqual(exc.exception.retryable, status == 429)
            self.assertEqual(exc.exception.uncertain, status == 503)

    async def test_post_timeout_and_malformed_launch_are_uncertain(self):
        for mode in ('timeout', 'missing_id', 'invalid_json'):
            def handler(req):
                if mode == 'timeout':
                    raise httpx.ReadTimeout('secret', request=req)
                return httpx.Response(200, json={} ) if mode == 'missing_id' else httpx.Response(200, text='not json')
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                with self.assertRaises(ProviderError) as exc:
                    await apify.start(client, 'tiktok', request().profile_url, 30)
                self.assertTrue(exc.exception.uncertain)

    async def test_phantom_bonus_arguments_poll_csv_download_without_credentials(self):
        def handler(req):
            if req.url.host == 'phantombuster.s3.amazonaws.com':
                self.assertNotIn('X-Phantombuster-Key-1', req.headers)
                return httpx.Response(200, content=(FIXTURES / 'linkedin_posts.csv').read_bytes())
            self.assertEqual(req.headers['X-Phantombuster-Key-1'], 'pb-secret')
            if req.method == 'POST':
                payload = json.loads(req.content)
                self.assertEqual(payload['bonusArgument']['spreadsheetUrl'], request('linkedin').profile_url)
                self.assertNotIn('argument', payload)
                self.assertFalse(payload['saveArgument'])
                return httpx.Response(200, json={'containerId': 'container1'})
            if req.url.path.endswith('fetch'):
                return httpx.Response(200, json={'status': 'finished', 'exitCode': 0})
            return httpx.Response(200, json={'resultObject': {'csvUrl': 'https://phantombuster.s3.amazonaws.com/fixture.csv'}})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            cid = await pb.start(client, 'profile', request('linkedin').profile_url, 30)
            self.assertTrue(await pb.poll(client, cid))
            rows = await pb.results(client, cid, 30, 'posts')
            self.assertEqual(len(rows), 2)

    async def test_export_ssrf_redirect_and_invalid_dataset_rejected(self):
        for url in ('http://127.0.0.1/private', 'https://phantombuster.s3.amazonaws.com.evil/data', 'https://user:password@phantombuster.s3.amazonaws.com/data'):
            calls = []
            def handler(req):
                calls.append(req)
                return httpx.Response(200, json={'jsonUrl': url})
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                with self.assertRaises(ProviderError):
                    await pb.results(client, 'container', 30, 'profile')
            self.assertEqual(len(calls), 1)

    async def test_failed_runs_and_unrecognized_states_are_not_success(self):
        for status in ('FAILED', 'UNEXPECTED'):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, json={'data': {'status': status}}))) as client:
                with self.assertRaises(ProviderError):
                    await apify.poll(client, 'run')
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, json={'status': 'finished', 'exitCode': 1}))) as client:
            with self.assertRaises(ProviderError):
                await pb.poll(client, 'container')

    async def test_export_redirect_oversize_and_invalid_rows_are_bounded(self):
        for mode in ('redirect', 'oversize', 'invalid_rows'):
            seen = []
            def handler(req):
                seen.append(req)
                if len(seen) == 1:
                    return httpx.Response(200, json={'jsonUrl': 'https://phantombuster.s3.amazonaws.com/data.json'})
                if mode == 'redirect':
                    return httpx.Response(302, headers={'Location': 'http://127.0.0.1/internal'})
                if mode == 'oversize':
                    return httpx.Response(200, content=b'x' * (8 * 1024 * 1024 + 1))
                return httpx.Response(200, json=['not a row'])
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                with self.assertRaises(ProviderError):
                    await pb.results(client, 'container', 30, 'profile')
            self.assertEqual(len(seen), 2)

    async def test_operator_field_map_and_current_header_option(self):
        with patch.dict(os.environ, {'PHANTOMBUSTER_LINKEDIN_PROFILE_FIELD_MAP': '{"profileUrl":"linkedinProfile","followersCount":"numberOfFollowers"}',
                                     'PHANTOMBUSTER_KEY_HEADER': 'X-Phantombuster-Key'}):
            def handler(req):
                self.assertEqual(req.headers['X-Phantombuster-Key'], 'pb-secret')
                return httpx.Response(200, json=[{'linkedinProfile': request('linkedin').profile_url, 'numberOfFollowers': 123}])
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                rows = await pb.results(client, 'container', 30, 'profile')
                result = normalize('linkedin', request('linkedin').profile_url, rows)
                self.assertEqual(result.followers, 123)

    async def test_verified_linkedin_script_limit_fields(self):
        for kind, key, expected in [('profile', 'numberOfAddsPerLaunch', 1), ('posts', 'numberMaxOfPosts', 3)]:
            with self.subTest(kind=kind), patch.dict(os.environ, {
                f'PHANTOMBUSTER_LINKEDIN_{kind.upper()}_AGENT_ID': '123',
                f'PHANTOMBUSTER_LINKEDIN_{kind.upper()}_LIMIT_KEY': key,
            }):
                def handler(req):
                    body = json.loads(req.content)
                    self.assertEqual(body['bonusArgument'][key], expected)
                    self.assertNotIn('sessionCookie', body['bonusArgument'])
                    return httpx.Response(200, json={'containerId': 'container'})
                async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                    await pb.start(client, kind, request('linkedin').profile_url, 3)

    async def test_live_v2_container_end_type_without_exit_code(self):
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, json={
            'status': 'finished', 'endType': 'finished',
        }))) as client:
            self.assertTrue(await pb.poll(client, 'container'))
        for meta in [
            {'status': 'finished', 'endType': 'agent timeout'},
            {'status': 'finished', 'endType': 'finished', 'exitCode': 1},
            {'status': 'finished'},
        ]:
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(200, json=meta))) as client:
                with self.assertRaises(ProviderError):
                    await pb.poll(client, 'container')

    async def test_disabled_provider_never_sends_a_request_even_with_saved_keys(self):
        with patch.dict(os.environ, {'PHANTOMBUSTER_ENABLED': 'false'}):
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: self.fail('Disabled provider must not be contacted'))) as client:
                with self.assertRaises(ServiceError):
                    await pb.start(client, 'profile', request('linkedin').profile_url, 3)
                with self.assertRaises(ServiceError):
                    await pb.poll(client, 'container')


class StorageAndApiTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'SNOWFLAKE_ACCOUNT': '', 'SESSION_SECRET': 'offline-session-secret',
                                         'SOCIAL_WORKER_ENABLED': 'true', 'APIFY_API_TOKEN': 'fixture-secret',
                                         'PHANTOMBUSTER_API_KEY': 'fixture-pb', 'PHANTOMBUSTER_ENABLED': 'true', 'PHANTOMBUSTER_LINKEDIN_PROFILE_AGENT_ID': '123',
                                         'PHANTOMBUSTER_LINKEDIN_POSTS_AGENT_ID': '456'}, clear=True)
        self.env.start()
        db.close()
        self.tmp = tempfile.TemporaryDirectory()
        self.dbpath = patch.object(db, 'LOCAL_DB', Path(self.tmp.name) / 'isolated.db')
        self.dbpath.start()
        db.init()
        self.user = accounts.create_user('fixture@example.test', 'not-a-real-hash', 'Synthetic', 'creator', 'filmmaking')['id']
        self.other = accounts.create_user('other@example.test', 'not-a-real-hash', 'Other', 'creator', None)['id']
        self.client = TestClient(app)  # no lifespan/background worker; tests advance durable steps explicitly
        self.client.cookies.set(COOKIE_NAME, create_session(self.user))
        self.addCleanup(self.cleanup)

    def cleanup(self):
        self.client.close()
        db.close()
        self.dbpath.stop()
        self.tmp.cleanup()
        self.env.stop()

    def launch(self, platform='tiktok'):
        return store.enqueue(self.user, request(platform))

    def next_job(self, job):
        return store.get_job(self.user, job['id'])

    def test_concurrent_duplicate_requests_share_one_job(self):
        with ThreadPoolExecutor(max_workers=4) as pool:
            rows = list(pool.map(lambda _: self.launch(), range(8)))
        self.assertEqual(len({r['id'] for r in rows}), 1)
        self.assertEqual(len(db.query('SELECT * FROM SOCIAL_JOBS')), 1)

    def test_snapshots_idempotent_preserve_audience_and_feed_model_and_gemini(self):
        accounts.save_account(self.user, 'tiktok', {'audience': {'language': 'en'}, 'extra': {'team_key': 'preserved'}})
        job = self.launch()
        result = normalized()
        store.complete(job, result)
        store.complete(job, result)
        self.assertEqual(len(db.query('SELECT * FROM SOCIAL_SNAPSHOTS')), 1)
        self.assertEqual(len(db.query('SELECT * FROM POSTS')), 2)
        account = accounts.get_account(self.user, 'tiktok')
        self.assertEqual(account['audience']['language'], 'en')
        self.assertEqual(account['extra']['team_key'], 'preserved')
        self.assertEqual(accounts.model_context(self.user)['tiktok']['followers'], 18000)
        self.assertEqual(accounts.model_context(self.user)['tiktok']['creator_typical_views'], 15000)
        self.assertIn('public history', accounts.audience_summary(self.user))
        self.assertIn('not a prediction', accounts.audience_summary(self.user))
        self.assertEqual(store.get_job(self.user, job['id'])['job_status'], 'succeeded')

    def test_second_snapshot_upserts_and_failure_keeps_last_success(self):
        job = self.launch()
        store.complete(job, normalized())
        db.execute('UPDATE SOCIAL_LINKS SET last_requested = 0')
        new_job = self.launch()
        result = normalized()
        result.posts[0].views = 99999
        store.complete(new_job, result)
        self.assertEqual(len(db.query('SELECT * FROM POSTS')), 2)
        self.assertEqual(len(store.history(self.user, 'tiktok', 10)), 2)
        db.execute('UPDATE SOCIAL_LINKS SET last_requested = 0')
        failed = self.launch()
        store.update(failed, status='failed', error='fixture failure')
        self.assertEqual(store.stats(self.user, 'tiktok')['posts'][0]['views'], 99999)

    def test_transaction_rolls_back_snapshot_and_account_on_post_write_failure(self):
        job = self.launch()
        accounts.save_account(self.user, 'tiktok', {'followers': 10})
        original = db.Transaction.execute
        def failing(tx, sql, params=()):
            if sql.startswith('INSERT INTO POSTS'):
                raise RuntimeError('simulated storage failure')
            return original(tx, sql, params)
        with patch.object(db.Transaction, 'execute', new=failing), self.assertRaises(RuntimeError):
            store.complete(job, normalized())
        self.assertEqual(accounts.get_account(self.user, 'tiktok')['followers'], 10)
        self.assertEqual(db.query('SELECT * FROM SOCIAL_SNAPSHOTS'), [])

    def test_unlink_prevents_inflight_job_resurrection(self):
        job = self.launch()
        accounts.delete_account(self.user, 'tiktok')
        store.complete(job, normalized())
        self.assertIsNone(accounts.get_account(self.user, 'tiktok'))
        self.assertEqual(db.query('SELECT * FROM SOCIAL_SNAPSHOTS'), [])
        self.assertEqual(db.query('SELECT * FROM SOCIAL_JOBS'), [])

    def test_delete_user_removes_all_social_history(self):
        job = self.launch()
        store.complete(job, normalized())
        # Both features must be removed together without touching another creator.
        for owner in (self.user, self.other):
            db.execute('INSERT INTO CONTENT_IDEAS (id,user_id,payload) VALUES (%s,%s,%s)',
                       (owner + '-idea', owner, '{}'))
            for table in ('IDEA_PREFERENCES', 'CHANNEL_MEMORIES'):
                db.execute(f'INSERT INTO {table} (user_id,payload) VALUES (%s,%s)', (owner, '{}'))
        accounts.delete_user(self.user)
        store.complete(job, normalized())
        self.assertEqual(db.query('SELECT * FROM SOCIAL_SNAPSHOTS'), [])
        self.assertIsNone(accounts.get_user(self.user))
        for table in ('CONTENT_IDEAS', 'IDEA_PREFERENCES', 'CHANNEL_MEMORIES'):
            self.assertEqual(db.query(f'SELECT user_id FROM {table}'), [{'user_id': self.other}])

    def test_authenticated_endpoints_ownership_pagination_and_cooldown(self):
        response = self.client.post('/accounts/import', json=request().model_dump())
        self.assertEqual(response.status_code, 202, response.text)
        job_id = response.json()['id']
        job = store.get_job(self.user, job_id)
        store.complete(job, normalized())
        self.assertEqual(self.client.get('/accounts/tiktok/stats').json()['followers'], 18000)
        self.assertEqual(len(self.client.get('/accounts/tiktok/posts?limit=1&offset=1').json()['posts']), 1)
        self.assertEqual(self.client.get('/accounts/tiktok/history').json()[0]['snapshot_id'], job_id)
        self.assertEqual(len(self.client.get('/accounts/imports').json()), 1)
        self.assertEqual(self.client.post('/accounts/tiktok/refresh', json={}).status_code, 429)
        self.client.cookies.set(COOKIE_NAME, create_session(self.other))
        self.assertEqual(self.client.get(f'/accounts/jobs/{job_id}').status_code, 404)
        self.assertEqual(self.client.get('/accounts/tiktok/stats').status_code, 404)
        self.assertEqual(self.client.get('/accounts/tiktok/history').json(), [])
        self.client.cookies.clear()
        self.assertEqual(self.client.get('/accounts/imports').status_code, 401)

    def test_missing_keys_reject_before_creating_job_and_no_secrets_in_status(self):
        with patch.dict(os.environ, {'APIFY_API_TOKEN': ''}):
            response = self.client.post('/accounts/import', json=request().model_dump())
            self.assertEqual(response.status_code, 503)
        self.assertEqual(db.query('SELECT * FROM SOCIAL_JOBS'), [])
        response = self.client.get('/accounts/providers/status')
        self.assertNotIn('fixture-secret', response.text)
        self.assertTrue(response.json()['configured']['APIFY_API_TOKEN'])

    def test_disabled_linkedin_blocks_import_schedule_and_queued_work(self):
        job = self.launch('linkedin')
        with patch.dict(os.environ, {'PHANTOMBUSTER_ENABLED': 'false'}):
            self.assertEqual(self.client.post('/accounts/import', json=request('linkedin').model_dump()).status_code, 503)
            self.assertEqual(self.client.put('/accounts/linkedin/schedule', json={'interval_hours': 24}).status_code, 503)
            status = self.client.get('/accounts/providers/status').json()
            self.assertFalse(status['enabled']['phantombuster'])
            async def run():
                async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: self.fail('Disabled provider must not be contacted'))) as client:
                    await jobs.step(self.next_job(job), client)
            asyncio.run(run())
        self.assertEqual(self.next_job(job)['job_status'], 'failed')
        self.assertEqual(self.client.post('/accounts/import', json=request('tiktok').model_dump()).status_code, 202)

    def test_uncertain_launch_requires_acknowledgement_and_restart_does_not_relaunch(self):
        job = self.launch()
        store.update(job, phase='profile_launching')
        async def run():
            def forbidden(req):
                self.fail('Restart must not issue another paid launch')
            async with httpx.AsyncClient(transport=httpx.MockTransport(forbidden)) as client:
                await jobs.step(self.next_job(job), client)
        asyncio.run(run())
        self.assertEqual(self.next_job(job)['job_status'], 'needs_attention')
        db.execute('UPDATE SOCIAL_LINKS SET last_requested = 0')
        self.assertEqual(self.client.post('/accounts/tiktok/refresh', json={}).status_code, 409)
        self.assertEqual(self.client.post('/accounts/tiktok/refresh', json={'acknowledge_uncertain_launch': True}).status_code, 202)

    def test_worker_full_tiktok_flow_survives_connection_restart(self):
        job = self.launch()
        def handler(req):
            if req.method == 'POST':
                return httpx.Response(201, json={'data': {'id': 'run1'}})
            if '/actor-runs/' in req.url.path:
                return httpx.Response(200, json={'data': {'status': 'SUCCEEDED', 'defaultDatasetId': 'dataset1'}})
            return httpx.Response(200, json=fixture('tiktok'))
        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                await jobs.step(self.next_job(job), client)
                db.close()  # durable provider ID is recovered from SQLite
                await jobs.step(self.next_job(job), client)
                await jobs.step(self.next_job(job), client)
        asyncio.run(run())
        self.assertEqual(self.next_job(job)['job_status'], 'succeeded')
        self.assertEqual(store.stats(self.user, 'tiktok')['followers'], 18000)

    def test_worker_linkedin_two_agents_to_normalized_snapshot(self):
        job = self.launch('linkedin')
        launches = []
        def handler(req):
            if req.method == 'POST':
                launches.append(json.loads(req.content)['id'])
                return httpx.Response(200, json={'containerId': 'profile-run' if len(launches) == 1 else 'posts-run'})
            if req.url.path.endswith('/fetch'):
                return httpx.Response(200, json={'status': 'finished', 'exitCode': 0})
            if req.url.params['id'] == 'profile-run':
                return httpx.Response(200, json={'resultObject': fixture('linkedin_profile')})
            return httpx.Response(200, json=pb.parse_export((FIXTURES / 'linkedin_posts.csv').read_bytes(), csv_format=True))
        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                for _ in range(6):
                    await jobs.step(self.next_job(job), client)
        asyncio.run(run())
        self.assertEqual(self.next_job(job)['job_status'], 'succeeded')
        self.assertEqual(launches, ['123', '456'])
        self.assertEqual(len(store.stats(self.user, 'linkedin')['posts']), 2)
        state = self.next_job(job)['state_json']
        self.assertNotIn('connectionsCount', state)

    def test_worker_rate_limit_backoff_and_schedule(self):
        job = self.launch()
        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: httpx.Response(429, headers={'Retry-After': '120'}))) as client:
                await jobs.step(self.next_job(job), client)
        asyncio.run(run())
        saved = self.next_job(job)
        self.assertEqual(saved['job_status'], 'retrying')
        self.assertEqual(saved['phase'], 'queued')
        self.assertGreater(saved['next_poll'], time.time() + 100)
        self.assertEqual(self.client.put('/accounts/tiktok/schedule', json={'interval_hours': 2}).status_code, 422)
        response = self.client.put('/accounts/tiktok/schedule', json={'interval_hours': 24})
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.json()['next_refresh_epoch'])
        self.assertIsNone(self.client.put('/accounts/tiktok/schedule', json={'interval_hours': None}).json()['next_refresh_epoch'])

    def test_due_schedule_creates_one_job_and_advances_next_refresh(self):
        old = self.launch()
        store.complete(old, normalized())
        store.schedule(self.user, 'tiktok', 24)
        db.execute('UPDATE SOCIAL_LINKS SET last_requested = 0, next_refresh = 0')
        seen = []
        def handler(req):
            seen.append(req)
            return httpx.Response(201, json={'data': {'id': 'scheduled-run'}})
        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                await jobs.tick(client)
        asyncio.run(run())
        self.assertEqual(len(db.query('SELECT * FROM SOCIAL_JOBS')), 2)
        self.assertEqual(len(seen), 1)
        self.assertGreater(store.link(self.user, 'tiktok')['next_refresh'], time.time() + 23 * 3600)

    def test_worker_ambiguous_launch_never_reposts_without_user_review(self):
        job = self.launch()
        calls = []
        def handler(req):
            calls.append(req)
            raise httpx.ReadTimeout('simulated secret that must not escape', request=req)
        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                await jobs.tick(client)
                await jobs.tick(client)
        asyncio.run(run())
        self.assertEqual(len(calls), 1)
        saved = self.next_job(job)
        self.assertEqual(saved['job_status'], 'needs_attention')
        self.assertNotIn('simulated secret', saved['error_message'])

    def test_deadline_retains_snapshot_and_requires_remote_run_review(self):
        old = self.launch()
        store.complete(old, normalized())
        db.execute('UPDATE SOCIAL_LINKS SET last_requested = 0')
        job = self.launch()
        store.update(job, phase='polling', state={'run_id': 'still-running'})
        db.execute('UPDATE SOCIAL_JOBS SET deadline = 0 WHERE id = %s', (job['id'],))
        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: self.fail('Expired jobs must not request results'))) as client:
                await jobs.step(self.next_job(job), client)
        asyncio.run(run())
        self.assertEqual(self.next_job(job)['job_status'], 'needs_attention')
        self.assertEqual(store.stats(self.user, 'tiktok')['followers'], 18000)

    def test_worker_instagram_fixture_and_profile_change_guard(self):
        job = self.launch('instagram')
        def handler(req):
            if req.method == 'POST':
                self.assertEqual(json.loads(req.content), {'directUrls': [request('instagram').profile_url], 'resultsType': 'details', 'resultsLimit': 1})
                return httpx.Response(201, json={'data': {'id': 'run1'}})
            if '/actor-runs/' in req.url.path:
                return httpx.Response(200, json={'data': {'status': 'SUCCEEDED', 'defaultDatasetId': 'dataset1'}})
            return httpx.Response(200, json=fixture('instagram'))
        async def run():
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
                for _ in range(3):
                    await jobs.step(self.next_job(job), client)
        asyncio.run(run())
        self.assertEqual(self.next_job(job)['job_status'], 'succeeded')
        changed = request('instagram').model_copy(update={'profile_url': 'https://www.instagram.com/someone_else'})
        self.assertEqual(self.client.post('/accounts/import', json=changed.model_dump()).status_code, 409)

    def test_worker_youtube_reuses_existing_fetcher(self):
        with patch.dict(os.environ, {'YOUTUBE_API_KEY': 'fixture-youtube'}):
            job = self.launch('youtube')
            result = ChannelImport({'external_id': 'UCfixture', 'followers': 20}, [
                {'external_id': 'video1', 'caption': 'Synthetic', '_raw_payload': {'statistics': {'viewCount': '100', 'likeCount': '5'}}}])
            async def run():
                async with httpx.AsyncClient(transport=httpx.MockTransport(lambda req: self.fail('YouTube uses its existing transport'))) as client:
                    with patch.object(jobs.youtube, 'fetch_channel', return_value=result) as fetch:
                        await jobs.step(self.next_job(job), client)
                        fetch.assert_called_once_with(request('youtube').profile_url, 30)
            asyncio.run(run())
        self.assertEqual(self.next_job(job)['job_status'], 'succeeded')
        self.assertIsNone(store.stats(self.user, 'youtube')['posts'][0]['shares'])

    def test_openapi_docs_and_worker_lifecycle(self):
        started, cancelled = [], []
        async def idle_worker(stop):
            started.append(True)
            try:
                await stop.wait()
            finally:
                cancelled.append(True)
        with patch.object(jobs, 'run', side_effect=idle_worker):
            with TestClient(app) as client:
                self.assertEqual(client.get('/health').status_code, 200)
                self.assertEqual(client.get('/docs').status_code, 200)
                schema = client.get('/openapi.json').json()
                self.assertIn('/accounts/{platform}/stats', schema['paths'])
        self.assertTrue(started)
        self.assertTrue(cancelled)


if __name__ == '__main__':
    unittest.main()
