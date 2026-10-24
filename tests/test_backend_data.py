"""Backend contracts without paid services. Live steps are in docs/backend-data.md."""

import io
import json
import os
import unittest
from contextlib import nullcontext
from datetime import datetime
from pathlib import Path
from unittest.mock import MagicMock, patch

import httpx
import pandas as pd
from fastapi.testclient import TestClient

from api.main import app
from api.schemas import DashboardResponse, PlatformScore, PredictResponse, SimilarPostsRequest
from api.services import analytics, cortex, posts, predictions, snowflake, youtube
from api.services.errors import ConfigurationError, InvalidImport, ServiceError

ROOT = Path(__file__).resolve().parents[1]


class ImportValidationTests(unittest.TestCase):
    def test_demo_supports_all_platforms_and_preserves_original_payload(self):
        batch = posts.read_csv((ROOT / "data/samples/demo_posts.csv").read_bytes(), "demo")
        self.assertEqual(len(batch.frame), 10)
        self.assertEqual(set(batch.frame.platform), {"youtube", "tiktok", "instagram", "linkedin"})
        self.assertEqual(set(batch.frame.user_id), {"demo"})
        self.assertEqual(json.loads(batch.frame.iloc[0].raw_payload)["external_id"], "demo-yt-1")

    def test_generated_identity_survives_metric_refresh_and_normalizes_timezones(self):
        csv = b'caption,posted_at,views,likes\nHello,2026-01-01T12:00:00-05:00,"1,234",10\n'
        first = posts.read_csv(csv, "demo", "tiktok").frame.iloc[0]
        second = posts.read_csv(csv.replace(b'1,234', b'4,567'), "demo", "tiktok").frame.iloc[0]
        self.assertEqual(first.external_id, second.external_id)
        self.assertEqual(first.views, 1234)
        self.assertEqual(second.views, 4567)
        self.assertEqual(first.posted_at, pd.Timestamp("2026-01-01T17:00:00"))

    def test_deduplication_uses_platform_and_keeps_latest_row(self):
        batch = posts.read_csv(b'platform,external_id,views\nyoutube,a,1\nyoutube,a,2\ntiktok,a,3', "demo")
        self.assertEqual(len(batch.frame), 2)
        self.assertEqual(batch.duplicates_skipped, 1)
        self.assertEqual(batch.frame[batch.frame.platform == "youtube"].iloc[0].views, 2)

    def test_export_headers_and_unix_milliseconds(self):
        batch = posts.read_csv(b'Video title,Post time,Total views\nHello,1767225600000,10', "demo", "tiktok")
        self.assertEqual(batch.frame.iloc[0].caption, "Hello")
        self.assertEqual(batch.frame.iloc[0].posted_at, pd.Timestamp("2026-01-01"))

    def test_bad_counts_dates_platforms_and_ambiguous_headers_are_rejected(self):
        invalid = [
            b'external_id,views\na,-1', b'external_id,views\na,NaN',
            b'external_id,views\na,1.5', b'external_id,views\na,9999999999999999999999',
            b'caption,posted_at\nHello,not-a-date', b'caption\nHello',
            b'platform,external_id\nunknown,a', b'platform,external_id\nyoutube,a',
            b'external_id,caption,Description\na,Hello,World', b'',
        ]
        for content in invalid:
            with self.subTest(content=content), self.assertRaises(InvalidImport):
                posts.read_csv(content, "demo", "tiktok")

    def test_upload_and_row_limits(self):
        with patch.object(posts, "MAX_CSV_BYTES", 10), self.assertRaises(InvalidImport):
            posts.read_csv(b'external_id\naaaa', "demo", "tiktok")
        with patch.object(posts, "MAX_IMPORT_ROWS", 1), self.assertRaises(InvalidImport):
            posts.read_csv(b'external_id\na\nb', "demo", "tiktok")

    def test_nullable_fields_are_compatible_with_parquet_staging(self):
        batch = posts.read_csv(b'external_id,posted_at\na,2026-01-01T00:00:00Z', 'demo', 'youtube')
        buffer = io.BytesIO()
        batch.frame.rename(columns=str.upper).to_parquet(buffer)
        restored = pd.read_parquet(buffer)
        self.assertTrue(pd.isna(restored.iloc[0].FOLLOWERS))
        self.assertEqual(restored.iloc[0].POSTED_AT, pd.Timestamp('2026-01-01'))


class YouTubeTests(unittest.TestCase):
    def test_channel_inputs(self):
        channel_id = 'UC' + 'x' * 22
        for value in [channel_id, 'https://www.youtube.com/channel/' + channel_id]:
            self.assertEqual(youtube.channel_filter(value), {'id': channel_id})
        self.assertEqual(youtube.channel_filter('https://youtube.com/@sample/videos'), {'forHandle': '@sample'})
        self.assertEqual(youtube.channel_filter('@sample'), {'forHandle': '@sample'})
        with self.assertRaises(InvalidImport):
            youtube.channel_filter('https://example.com/@sample')

    def test_pagination_missing_stats_and_hidden_subscribers(self):
        calls = []
        def handle(request):
            calls.append(request)
            endpoint = request.url.path.rsplit('/', 1)[-1]
            if endpoint == 'channels':
                data = {'items': [{'id': 'channel', 'snippet': {'title': 'Sample'},
                                   'statistics': {'hiddenSubscriberCount': True},
                                   'contentDetails': {'relatedPlaylists': {'uploads': 'uploads'}}}]}
            elif endpoint == 'playlistItems':
                second = request.url.params.get('pageToken') == 'page2'
                data = {'items': [{'contentDetails': {'videoId': 'b' if second else 'a'}}]}
                if not second:
                    self.assertNotIn('pageToken', request.url.params)
                    data['nextPageToken'] = 'page2'
            else:
                data = {'items': [{'id': v, 'snippet': {'title': v, 'publishedAt': '2026-01-01T00:00:00Z'},
                                   'statistics': {'viewCount': '10'}} for v in ('a', 'b')]}
            return httpx.Response(200, json=data)
        client = httpx.Client(transport=httpx.MockTransport(handle))
        with patch.dict(os.environ, {'YOUTUBE_API_KEY': 'private-test-key'}), patch.object(youtube.httpx, 'Client', return_value=client):
            result = youtube.fetch_channel('@sample', 2)
        self.assertEqual(len(result.posts), 2)
        self.assertIsNone(result.account['followers'])
        self.assertEqual(result.posts[0]['comments'], 0)
        self.assertEqual(len(calls), 4)

    def test_errors_do_not_echo_the_key(self):
        key = 'private-test-key'
        client = httpx.Client(transport=httpx.MockTransport(lambda req: httpx.Response(
            403, json={'error': {'message': key, 'errors': [{'reason': 'quotaExceeded'}]}})))
        with patch.dict(os.environ, {'YOUTUBE_API_KEY': key}), patch.object(youtube.httpx, 'Client', return_value=client):
            with self.assertRaises(ServiceError) as failure:
                youtube.fetch_channel('@sample')
        self.assertNotIn(key, str(failure.exception))
        self.assertIn('quota', str(failure.exception))


class StorageTests(unittest.TestCase):
    def connection(self, fail_audit=False):
        conn, cur = MagicMock(), MagicMock()
        conn.cursor.return_value.__enter__.return_value = cur
        events = []
        def execute(sql, params=None):
            events.append((sql, params))
            if sql.startswith('MERGE INTO POSTS'):
                cur.description = [('number of rows inserted',), ('number of rows updated',)]
                cur.fetchone.return_value = (1, 0)
            if 'INSERT INTO RAW_POSTS' in sql and fail_audit:
                raise RuntimeError('audit failed')
        cur.execute.side_effect = execute
        return conn, cur, events

    def test_import_stages_before_transaction_and_scopes_merge_to_user(self):
        batch = posts.read_csv(b'external_id,views\na,10', "demo' OR 1=1", "youtube")
        conn, cur, events = self.connection()
        def write(*args, **kwargs):
            events.append(('WRITE_PANDAS', None))
            self.assertIn('RAW_PAYLOAD', args[1].columns)
            return True, 1, 1, []
        with patch.object(snowflake, 'get_connection', return_value=nullcontext(conn)), patch.object(snowflake, 'write_pandas', side_effect=write):
            result = snowflake.upsert_posts("demo' OR 1=1", batch, 'csv')
        statements = [event[0] for event in events]
        self.assertLess(statements.index('WRITE_PANDAS'), statements.index('BEGIN'))
        merge = next(s for s in statements if s.startswith('MERGE INTO POSTS'))
        self.assertIn('t.user_id=s.user_id', merge)
        self.assertNotIn("demo'", ' '.join(statements))
        self.assertEqual(result['inserted'], 1)
        conn.commit.assert_called_once()
        conn.rollback.assert_not_called()

    def test_failed_audit_rolls_back_posts_and_user_changes(self):
        batch = posts.read_csv(b'external_id\na', 'demo', 'youtube')
        conn, cur, events = self.connection(fail_audit=True)
        with patch.object(snowflake, 'get_connection', return_value=nullcontext(conn)), patch.object(snowflake, 'write_pandas', return_value=(True, 1, 1, [])):
            with self.assertRaises(RuntimeError):
                snowflake.upsert_posts('demo', batch, 'csv')
        conn.rollback.assert_called_once()
        conn.commit.assert_not_called()
        self.assertTrue(any(s.startswith('DROP TABLE') for s, _ in events))

    def test_token_authentication_and_bootstrap_omit_missing_namespace(self):
        values = {'SNOWFLAKE_ACCOUNT': 'test', 'SNOWFLAKE_USER': 'test', 'SNOWFLAKE_TOKEN': 'private-token'}
        with patch.dict(os.environ, values, clear=True), patch.object(snowflake.snowflake.connector, 'connect', return_value=MagicMock()) as connect:
            with snowflake.get_connection(bootstrap=True):
                pass
        self.assertEqual(connect.call_args.kwargs['password'], 'private-token')
        self.assertNotIn('database', connect.call_args.kwargs)
        self.assertEqual(connect.call_args.kwargs['login_timeout'], 15)

    def test_prediction_failure_does_not_break_scoring(self):
        result = PredictResponse(scores=[], suggestions=[])
        with patch.dict(os.environ, {}, clear=True):
            result = predictions.persist('demo', 'hello', result, {})
        self.assertIsNone(result.prediction_id)
        self.assertIn('not saved', result.storage_warning)

    def test_invalid_sql_identifiers_are_rejected(self):
        with self.assertRaises(ConfigurationError):
            snowflake.identifier('PUBLIC; DROP DATABASE POSTPILOT')

    def test_network_policy_error_explains_required_setup_without_provider_details(self):
        error = snowflake.snowflake.connector.errors.ProgrammingError(msg='private provider details', errno=390432)
        values = {'SNOWFLAKE_ACCOUNT': 'test', 'SNOWFLAKE_USER': 'test', 'SNOWFLAKE_PASSWORD': 'private-token'}
        with patch.dict(os.environ, values, clear=True), patch.object(snowflake.snowflake.connector, 'connect', side_effect=error):
            with self.assertRaises(ConfigurationError) as failure:
                with snowflake.get_connection():
                    pass
        self.assertIn('network policy', str(failure.exception))
        self.assertNotIn('private', str(failure.exception))

    def test_prediction_save_is_atomic_and_encodes_context(self):
        conn, cur, _ = self.connection()
        result = PredictResponse(scores=[PlatformScore(platform=p, score=50, top_factors=[]) for p in ('youtube', 'tiktok')],
                                 suggestions=['Try an experiment'])
        with patch.object(snowflake, 'get_connection', return_value=nullcontext(conn)):
            request_id = snowflake.save_prediction('demo', "A caption with 'quotes'", result,
                                                   {'planned_time': datetime(2026, 1, 1)})
        inserts = [call.args for call in cur.execute.call_args_list if call.args[0].startswith('INSERT INTO PREDICTIONS')]
        rows = [args[1] for args in inserts]
        sql = inserts[0][0]
        self.assertEqual(len(rows), 2)
        self.assertEqual(len(rows[0]), 14)
        self.assertEqual({r[7] for r in rows}, {request_id})
        self.assertEqual(json.loads(rows[0][11])['planned_time'], '2026-01-01 00:00:00')
        self.assertNotIn('A caption', sql)
        conn.commit.assert_called_once()

    def test_prediction_save_rolls_back_on_insert_failure(self):
        conn, cur, _ = self.connection()
        def fail_insert(sql, *args):
            if sql.startswith('INSERT INTO PREDICTIONS'):
                raise RuntimeError('insert failed')
        cur.execute.side_effect = fail_insert
        result = PredictResponse(scores=[PlatformScore(platform='youtube', score=50, top_factors=[])], suggestions=[])
        with patch.object(snowflake, 'get_connection', return_value=nullcontext(conn)), self.assertRaises(RuntimeError):
            snowflake.save_prediction('demo', 'Hello', result, {})
        conn.rollback.assert_called_once()
        conn.commit.assert_not_called()


class AnalyticsTests(unittest.TestCase):
    def test_dashboard_serializes_nulls_and_scopes_every_query(self):
        conn, cur = MagicMock(), MagicMock()
        conn.cursor.return_value.__enter__.return_value = cur
        output = [
            [{'platform': 'youtube', 'posts': 1, 'avg_engagement_rate': 0.1, 'total_views': 100}],
            [{'platform': 'youtube', 'format': 'video', 'posts': 1, 'avg_engagement_rate': 0.1, 'total_views': 100}],
            [{'platform': 'youtube', 'week': datetime(2026, 1, 5).date(), 'posts': 1, 'avg_engagement_rate': 0.1, 'total_views': 100}],
            [{'platform': 'youtube', 'external_id': 'a', 'caption': 'A', 'followers': None}],
            [{'total_posts': 1, 'last_import_at': None}],
            [{'platform': 'youtube', 'handle': '@sample', 'followers': None}],
        ]
        with patch.object(snowflake, 'get_connection', return_value=nullcontext(conn)), \
             patch.object(analytics, 'records', side_effect=output) as read:
            result = analytics.dashboard("demo'", 30)
        self.assertEqual(result.total_posts, 1)
        self.assertIsNone(result.recent_posts[0].followers)
        self.assertEqual(result.weekly[0].week.isoformat(), '2026-01-05')
        for call in read.call_args_list:
            _, sql, params = call.args
            self.assertNotIn("demo'", sql)
            self.assertEqual(params[0], "demo'")

    def test_cortex_only_receives_current_users_dashboard_facts(self):
        dashboard = DashboardResponse(user_id='demo', platforms=[], total_posts=1)
        with patch.object(snowflake, 'query_df', return_value=pd.DataFrame([{'summary': 'Try two experiments.'}])) as query:
            result = cortex.insights(dashboard)
        self.assertEqual(result.provider, 'snowflake-cortex')
        self.assertNotIn('demo', query.call_args.args[1][1])
        self.assertIn('untrusted data', query.call_args.args[1][1])

    def test_cortex_decodes_json_string_briefing(self):
        dashboard = DashboardResponse(user_id='demo', platforms=[], total_posts=1)
        with patch.object(snowflake, 'query_df', return_value=pd.DataFrame([{'summary': json.dumps('First pattern.\nSecond pattern.')}])):
            result = cortex.insights(dashboard)
        self.assertEqual(result.summary, 'First pattern.\nSecond pattern.')


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_missing_database_returns_actionable_503(self):
        with patch.dict(os.environ, {}, clear=True):
            response = self.client.get('/dashboard/demo')
        self.assertEqual(response.status_code, 503)
        self.assertIn('SNOWFLAKE_ACCOUNT', response.json()['detail'])

    def test_bad_csv_returns_422_without_connecting(self):
        with patch.object(snowflake, 'get_connection') as connect:
            response = self.client.post('/ingest/csv', data={'user_id': 'demo', 'platform': 'tiktok'},
                                        files={'file': ('posts.csv', b'external_id,views\na,-1', 'text/csv')})
        self.assertEqual(response.status_code, 422)
        connect.assert_not_called()

    def test_import_preserves_success_when_cortex_unavailable(self):
        saved = {'posts_loaded': 1, 'inserted': 1, 'updated': 0}
        with patch.dict(os.environ, {'CORTEX_ENRICH_ON_INGEST': 'true'}), \
             patch.object(snowflake, 'upsert_posts', return_value=saved), \
             patch.object(cortex, 'enrich_posts', side_effect=ServiceError('Cortex unavailable')):
            response = self.client.post('/ingest/csv', data={'user_id': 'demo', 'platform': 'tiktok'},
                                        files={'file': ('posts.csv', b'external_id,views\na,10', 'text/csv')})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['posts_loaded'], 1)
        self.assertTrue(response.json()['warnings'])

    def test_score_returns_model_result_when_storage_is_unconfigured(self):
        with patch.dict(os.environ, {}, clear=True), \
             patch('api.routers.predict.model.score', return_value=(50.0, [])), \
             patch('api.routers.predict.model.vs_account', return_value=None):
            response = self.client.post('/score', data={'user_id': 'demo', 'caption': 'Hello', 'platforms': 'youtube'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['scores'][0]['score'], 50.0)
        self.assertTrue(response.json()['storage_warning'])

    def test_status_only_exposes_variable_names_and_booleans(self):
        with patch.dict(os.environ, {'YOUTUBE_API_KEY': 'private-key'}, clear=True):
            response = self.client.get('/data/status')
        self.assertNotIn('private-key', response.text)
        self.assertTrue(response.json()['youtube_configured'])
        self.assertFalse(response.json()['connection_checked'])

    def test_limits_validated_before_external_requests(self):
        response = self.client.post('/ingest/youtube', json={'user_id': 'demo', 'channel_id': '@sample', 'max_videos': 201})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.post('/data/enrich', json={'user_id': 'demo', 'limit': 101}).status_code, 422)

    def test_empty_dashboard_does_not_invoke_cortex(self):
        with patch.object(analytics, 'dashboard', return_value=DashboardResponse(user_id='demo', platforms=[])), \
             patch.object(snowflake, 'query_df') as query:
            response = self.client.post('/dashboard/demo/insights')
        self.assertEqual(response.status_code, 404)
        query.assert_not_called()

    def test_null_subscriber_counts_survive_semantic_search_serialization(self):
        row = {'platform': 'youtube', 'external_id': 'a', 'caption': 'A', 'followers': float('nan'),
               'posted_at': datetime(2026, 1, 1), 'similarity': 0.8}
        with patch.object(snowflake, 'query_df', return_value=pd.DataFrame([row])) as query:
            result = cortex.similar_posts("demo'", SimilarPostsRequest(caption='A'))
        self.assertIsNone(result.posts[0].followers)
        self.assertNotIn("demo'", query.call_args.args[0])
        self.assertIn("demo'", query.call_args.args[1])


if __name__ == '__main__':
    unittest.main()
