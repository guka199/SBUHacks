"""Research-inspired opening review: grounding, compatibility and failure isolation."""
import copy
import json
import os
import unittest
from unittest.mock import MagicMock, patch

from fastapi.testclient import TestClient

from api.main import app
from api.analysis_schemas import AnalysisReport
from api.routers import score as score_router
from api.schemas import PlatformScore, PredictResponse
from api.services import gemini
from api.services.hooks import GeminiHookReview, clean_hook_review


def hook_payload():
    return {'summary': 'The pause delays the visible payoff.',
            'opening': 'A static title appears before the finished dish.',
            'suggested_opening': 'Show the finished dish first, then add the recipe title.',
            'criteria': [{'id': key, 'score': value, 'evidence': explanation} for key, value, explanation in [
                ('attention', 60, 'The title is readable but static.'),
                ('clarity', 80, 'The dish and recipe title explain the topic.'),
                ('pacing', 40, 'A pause delays the first change.'),
                ('audio_text', None, 'No usable audio is available to assess.')]],
            'evidence': [{'start': '00:00', 'end': '00:02', 'observation': 'The title stays static.',
                          'edit': 'Cut this pause and lead with the dish.'}]}


def analysis_payload():
    return {'summary': 'A recipe demonstration.', 'hook': 55, 'visual_quality': 70, 'clarity': 70,
            'trend_fit': 50, 'platform_scores': [{'platform': 'tiktok', 'score': 70, 'reason': 'Clear topic.'}],
            'strengths': ['Readable title'], 'suggestions': ['Lead with the dish.', 'Trim the pause.', 'Keep the title short.'],
            'moments': [], 'hook_analysis': hook_payload()}


class HookNormalizationTests(unittest.TestCase):
    def test_rubric_averages_known_scores_without_inventing_missing_values(self):
        review = clean_hook_review(GeminiHookReview(**hook_payload()), 24, True)
        self.assertEqual(review.score, 60)
        self.assertIsNone(review.criteria[3].score)
        self.assertEqual(review.windowSeconds, 5)
        self.assertEqual(review.method, 'ai_review')

    def test_short_clip_drops_out_of_window_evidence_instead_of_faking_a_time(self):
        raw = hook_payload()
        raw['evidence'] += [{'start': '00:02', 'end': '00:05', 'observation': 'Later content', 'edit': 'Edit later'}]
        review = clean_hook_review(GeminiHookReview(**raw), 2, True)
        self.assertEqual(review.windowSeconds, 2)
        self.assertEqual([(e.start, e.end) for e in review.evidence], [(0, 2)])

    def test_invalid_reversed_and_duplicate_spans_do_not_become_clips(self):
        raw = hook_payload()
        raw['evidence'] = [raw['evidence'][0], copy.deepcopy(raw['evidence'][0]),
                           {'start': 'later', 'end': '00:05', 'observation': 'Unusable', 'edit': 'Unusable'}]
        review = clean_hook_review(GeminiHookReview(**raw), 24, True)
        self.assertEqual(len(review.evidence), 1)
        raw['evidence'] = [{'start': '00:04', 'end': '00:02', 'observation': 'Reversed', 'edit': 'Reversed'}]
        self.assertEqual(clean_hook_review(GeminiHookReview(**raw), 24, True).evidence, [])

    def test_missing_duplicate_criteria_and_non_video_are_not_valid_reviews(self):
        raw = hook_payload()
        raw['criteria'][1] = raw['criteria'][0]
        self.assertIsNone(clean_hook_review(GeminiHookReview(**raw), 24, True))
        self.assertIsNone(clean_hook_review(GeminiHookReview(**hook_payload()), 24, False))
        self.assertIsNone(clean_hook_review(None, 24, True))

    def test_all_unobservable_criteria_have_no_numeric_score(self):
        raw = hook_payload()
        for c in raw['criteria']:
            c['score'] = None
        self.assertIsNone(clean_hook_review(GeminiHookReview(**raw), None, True).score)


class HookGeminiTests(unittest.TestCase):
    def call(self, payload):
        with patch('google.genai.Client') as constructor:
            client = MagicMock()
            constructor.return_value = client
            client.interactions.create.return_value.output_text = json.dumps(payload)
            result = gemini.analyze(['tiktok'], 'A recipe', None, {'duration_sec': 2}, {}, [], b'video', 'video/mp4')
            kwargs = client.interactions.create.call_args.kwargs
            return result, kwargs

    def test_same_video_request_contains_grounding_rubric_and_structured_schema(self):
        review, kwargs = self.call(analysis_payload())
        self.assertIsNotNone(review.hook_analysis)
        prompt = kwargs['input'][0]['text']
        self.assertIn('NOT an ECR', prompt)
        self.assertIn('earlier of 00:05', prompt)
        self.assertIn('audio_text', prompt)
        self.assertEqual(len(kwargs['input']), 2)
        self.assertIn('hook_analysis', kwargs['response_format']['schema']['properties'])

    def test_malformed_optional_hook_does_not_discard_valid_whole_video_review(self):
        payload = analysis_payload()
        payload['hook_analysis']['criteria'][0]['score'] = 500
        result, _ = self.call(payload)
        self.assertEqual(result.summary, 'A recipe demonstration.')
        self.assertIsNone(result.hook_analysis)
        self.assertEqual(result.hook, 55)

    def test_other_invalid_fields_still_fail_validation(self):
        payload = analysis_payload()
        payload.pop('platform_scores')
        with self.assertRaises(ValueError):
            self.call(payload)


class HookScoreTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {'SNOWFLAKE_ACCOUNT': '', 'SCORE_MODEL_WEIGHT': '0.6'}, clear=True)
        self.env.start()
        self.addCleanup(self.env.stop)
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        for name, kwargs in [
            ('score_with_model', {'return_value': PredictResponse(scores=[PlatformScore(platform='tiktok', score=40, top_factors=[])], suggestions=[])}),
            ('persist', {'side_effect': lambda _user, _caption, result, _context: result}),
        ]:
            p = patch.object(score_router, name, **kwargs)
            p.start(); self.addCleanup(p.stop)
        p = patch.object(score_router.accounts, 'audience_summary', return_value=None)
        p.start(); self.addCleanup(p.stop)
        p = patch.object(gemini, 'is_configured', return_value=True)
        p.start(); self.addCleanup(p.stop)
        p = patch.object(gemini, 'analyze', return_value=gemini.GeminiAnalysis(**analysis_payload()))
        self.analyze = p.start(); self.addCleanup(p.stop)

    def post(self, mime='video/mp4', duration=24):
        return self.client.post('/score', data={'caption': 'Recipe', 'platforms': 'tiktok', 'context': json.dumps({'duration_sec': duration})},
                                files={'file': ('draft.mp4' if mime.startswith('video/') else 'image.png', b'fixture-content', mime)})

    def test_video_hook_is_returned_without_changing_platform_blend(self):
        response = self.post()
        self.assertEqual(response.status_code, 200, response.text)
        result = response.json()
        self.assertEqual(result['content']['hook_analysis']['score'], 60)
        self.assertEqual(result['scores'][0]['score'], 52)
        self.assertEqual(result['content']['hook'], 55)
        self.assertIsNone(result['warning'])
        self.assertEqual(self.analyze.call_count, 1)

    def test_image_has_no_video_hook_even_if_model_supplies_one(self):
        self.assertIsNone(self.post('image/png').json()['content']['hook_analysis'])

    def test_missing_review_warns_without_discarding_content_scores(self):
        payload = analysis_payload(); payload['hook_analysis'] = None
        self.analyze.return_value = gemini.GeminiAnalysis(**payload)
        result = self.post().json()
        self.assertEqual(result['scores'][0]['score'], 52)
        self.assertIsNone(result['content']['hook_analysis'])
        self.assertIn('focused opening review', result['warning'])

    def test_disabled_gemini_keeps_model_only_fallback(self):
        with patch.object(gemini, 'is_configured', return_value=False):
            result = self.post().json()
        self.assertIsNone(result['content'])
        self.assertEqual(result['scores'][0]['score'], 40)
        self.analyze.assert_not_called()


class HookAdapterTests(unittest.TestCase):
    def test_report_persists_opening_once_and_loads_older_reports(self):
        from tests.test_frontend_adapter import AdapterTests
        from api.schemas import ContentAnalysis, CombinedScore, ScoreResponse
        base = AdapterTests('test_live_model_fallback_is_honest_and_saved_to_signed_owner')
        base.setUp(); self.addCleanup(base.doCleanups)
        review = clean_hook_review(GeminiHookReview(**hook_payload()), 24, True)
        async def score(**kwargs):
            return ScoreResponse(scores=[CombinedScore(platform='youtube', score=52, model_score=40, content_score=70, top_factors=[])],
                                 suggestions=['Lead with the dish.'], model_weight=.6, gemini_used=True,
                                 content=ContentAnalysis(summary='Recipe', hook=55, visual_quality=70, clarity=70, trend_fit=50,
                                                         platform_scores=[], strengths=[], hook_analysis=review))
        base.scorer.side_effect = score
        response = base.create(['shorts', 'youtube'])
        self.assertEqual(response.status_code, 200, response.text)
        report = response.json()['result']
        self.assertEqual(report['hookAnalysis']['score'], 60)
        saved = json.loads(base.execute.call_args.args[1][3])
        self.assertEqual(saved['hookAnalysis'], report['hookAnalysis'])
        report.pop('hookAnalysis')
        self.assertIsNone(AnalysisReport.model_validate(report).hookAnalysis)
