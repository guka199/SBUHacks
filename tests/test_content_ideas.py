"""Channel context and grounded idea contracts without external services."""

import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi.testclient import TestClient

from api.main import app
from api.idea_schemas import GeneratedIdea, GeneratedIdeas
from api.routers import ideas as router
from api.services import channel_context as context, ideas
from api.services.auth import require_user_id

NOW = datetime(2026, 10, 24, tzinfo=timezone.utc)
OWNER = "a" * 32


def post(index, views=100, days=20, platform="youtube", format="video", caption=None):
    return {"platform": platform, "external_id": f"abcdefghij{index}", "caption": caption or f"Piano practice lesson {index}",
            "format": format, "posted_at": NOW-timedelta(days=days), "loaded_at": NOW,
            "views": views, "likes": 10, "comments": 2, "shares": None}


def report(index="b", caption="Piano left-hand exercises", gemini=True):
    return {"id": index * 32, "caption": caption, "created_at": NOW, "report": json.dumps({
        "summary": "A visual demonstration of left-hand piano exercises.",
        "platforms": [{"id":"youtube", "geminiUsed":gemini, "strengths":["Clear demonstration"],
                       "opportunities":["Explain the finger placement"], "score":99}],
        "media_path":"PRIVATE-MEDIA-PATH", "private_token":"DO-NOT-SEND",})}


def generated(channel, count=3):
    return GeneratedIdeas(channel_summary="Piano tutorials for beginner musicians, based on saved history.", ideas=[
        GeneratedIdea(title=f"Practice plan for skill {index}", hook=f"Try this specific piano exercise {index}.",
                      outline=[f"Demonstrate skill {index}", "Explain one fingering choice", "Offer a short practice challenge"],
                      platform="youtube", approach="sequel" if index == 0 else "new_angle",
                      rationale="Extends the piano lessons with a focused practical exercise.",
                      source_ids=[channel.sources[index % len(channel.sources)].id]) for index in range(count)
    ])


class ContextFixture(unittest.TestCase):
    def setUp(self):
        self.profile = self.mock(context.accounts, "get_user", return_value={
            "id": OWNER, "display_name":"Piano teacher", "niche":"Beginner piano", "account_type":"creator",
            "email":"private@example.invalid", "password_hash":"SECRET-HASH", "wallet_address":"PRIVATE-WALLET",
        })
        self.linked = self.mock(context.accounts, "list_accounts", return_value=[{
            "platform":"youtube", "followers":1000, "typical_views":500, "updated_at":NOW,
            "audience":{"language":"English", "interests":"piano", "secret":"PRIVATE-AUDIENCE"},
            "extra":{"private_token":"PRIVATE-ACCOUNT"},
        }])
        self.posts = [post(0, 100), post(1, 200), post(2, 300)]
        self.reports = [report()]
        self.drafts = []
        def query(sql, params):
            if "FROM POSTS" in sql: return self.posts
            if "FROM ANALYSES" in sql: return self.reports
            if "FROM DRAFTS" in sql: return self.drafts
            raise AssertionError(sql)
        self.query = self.mock(context.db, "query", side_effect=query)

    def mock(self, target, name, **kwargs):
        item = patch.object(target, name, **kwargs)
        self.addCleanup(item.stop)
        return item.start()

    def build(self, platform="youtube"):
        return context.build_context(OWNER, platform, now=NOW)


class ContextTests(ContextFixture):
    def test_queries_are_owner_scoped_and_only_needed_fields_reach_context(self):
        result = self.build()
        for call in self.query.call_args_list:
            self.assertIn("WHERE user_id = %s", call.args[0])
            self.assertEqual(call.args[1][0], OWNER)
        payload = result.model_dump_json()
        for secret in ["private@example.invalid", "SECRET-HASH", "PRIVATE-WALLET", "PRIVATE-AUDIENCE", "PRIVATE-ACCOUNT", "DO-NOT-SEND", "PRIVATE-MEDIA-PATH"]:
            self.assertNotIn(secret, payload)
        self.assertEqual(result.published_posts, 3)
        self.assertEqual(result.draft_reviews, 1)
        self.assertTrue(result.can_generate)

    def test_view_comparisons_do_not_mix_ages_formats_or_platforms(self):
        self.posts += [post(3, 99999, days=1), post(4, 99999, days=200), post(5, 99999, format="short"), post(6, 99999, platform="tiktok")]
        result = self.build()
        by_id = {source.id:source for source in result.sources}
        self.assertEqual(by_id["post:youtube:abcdefghij0"].relative_views, .5)
        self.assertEqual(by_id["post:youtube:abcdefghij2"].relative_views, 1.5)
        self.assertEqual(by_id["post:youtube:abcdefghij2"].comparison_count, 3)
        for key in ["post:youtube:abcdefghij3", "post:youtube:abcdefghij4", "post:youtube:abcdefghij5", "post:tiktok:abcdefghij6"]:
            self.assertIsNone(by_id[key].relative_views)

    def test_draft_scores_never_become_performance(self):
        self.posts = []
        self.reports += [report("c", "Piano rhythm practice", gemini=False)]
        result = self.build()
        self.assertTrue(result.can_generate)
        self.assertEqual(result.published_posts, 0)
        self.assertTrue(any("cannot identify successful" in warning for warning in result.warnings))
        for source in result.sources:
            self.assertIsNone(source.views)
            self.assertIsNone(source.relative_views)
        self.assertEqual(result.sources[1].review_kind, "model_only")
        self.assertNotIn("99", result.sources[1].model_dump_json())

    def test_duplicate_saved_drafts_do_not_inflate_history(self):
        self.posts = []
        self.reports.append(report("c"))
        self.drafts = [{"id":"d"*32, "caption":"Piano left-hand exercises", "platforms":"youtube", "created_at":NOW}]
        result = self.build()
        self.assertEqual(len(result.sources), 1)
        self.assertFalse(result.can_generate)

    def test_empty_history_is_explicit(self):
        self.posts = []; self.reports = []
        result = self.build()
        self.assertFalse(result.can_generate)
        self.assertEqual(result.history_status, "insufficient")

    def test_bad_reports_are_skipped_and_text_is_bounded(self):
        self.reports = [{"id":"b"*32, "caption":"A caption", "report":"broken", "created_at":NOW}]
        self.posts[0]["caption"] = "x" * 10000
        result = self.build()
        self.assertTrue(any("could not be read" in warning for warning in result.warnings))
        self.assertLessEqual(len(result.sources[0].text), 700)
        self.assertLessEqual(len(result.sources), 40)

    def test_no_untrusted_links_or_future_posts(self):
        self.posts = [post(0), post(1, days=-1)]
        self.posts[0]["external_id"] = "https://attacker.invalid/"
        result = self.build()
        published = [s for s in result.sources if s.kind == "published_post"]
        self.assertEqual(len(published), 1)
        self.assertIsNone(published[0].url)

    def test_small_zero_and_unknown_view_cohorts_have_no_ratio(self):
        for values in [[0,0,0], [100, None]]:
            self.posts = [post(index, value) for index,value in enumerate(values)]
            self.assertTrue(all(source.relative_views is None for source in self.build().sources))

    def test_age_comparison_uses_capture_date_instead_of_today(self):
        for row in self.posts:
            row["loaded_at"] = NOW - timedelta(days=18)
        self.assertTrue(all(source.relative_views is None for source in self.build().sources))
        for row in self.posts:
            row["posted_at"] = NOW - timedelta(days=50)
            row["loaded_at"] = NOW - timedelta(days=30)
        source = self.build().sources[0]
        self.assertEqual(source.age_days, 50)
        self.assertEqual(source.age_days_at_snapshot, 20)
        self.assertEqual(source.relative_views, .5)
        self.assertIn("at statistics snapshot", source.comparison_label)

    def test_missing_capture_or_format_is_not_a_comparable_cohort(self):
        self.posts[0]["loaded_at"] = None
        self.assertTrue(all(source.relative_views is None for source in self.build().sources))
        self.posts[0]["loaded_at"] = NOW
        self.posts[0]["format"] = None
        self.assertTrue(all(source.relative_views is None for source in self.build().sources))


class IdeaTests(ContextFixture):
    def test_valid_grounding_and_invalid_source_platform_count_and_duplicates(self):
        channel = self.build()
        valid = generated(channel)
        ideas.validate_generated(valid, channel, 3, [])
        invalid = valid.model_copy(deep=True)
        invalid.ideas[0].source_ids = ["another-user-source"]
        with self.assertRaises(ideas.InvalidIdeas): ideas.validate_generated(invalid, channel, 3, [])
        invalid = valid.model_copy(deep=True); invalid.ideas[0].platform = "tiktok"
        with self.assertRaises(ideas.InvalidIdeas): ideas.validate_generated(invalid, channel, 3, [])
        with self.assertRaises(ideas.InvalidIdeas): ideas.validate_generated(valid, channel, 5, [])
        with self.assertRaises(ideas.InvalidIdeas): ideas.validate_generated(valid, channel, 3, [valid.ideas[0].title])
        invalid = valid.model_copy(deep=True); invalid.ideas[1].title = invalid.ideas[0].title.upper()
        with self.assertRaises(ideas.InvalidIdeas): ideas.validate_generated(invalid, channel, 3, [])

    def test_generation_attaches_server_sources_and_writes_only_current_owner(self):
        channel = self.build()
        with patch.object(ideas.db, "query", return_value=[]), patch.object(ideas, "_generate", return_value=generated(channel)), patch.object(ideas.db, "execute_many") as execute:
            result = ideas.generate_ideas(OWNER, channel, 3)
        self.assertEqual(len(result), 3)
        self.assertEqual(result[0].sources[0], channel.sources[0])
        self.assertTrue(all(row[1] == OWNER for row in execute.call_args.args[1]))
        self.assertTrue(all(idea.status == "suggested" for idea in result))

    def test_invalid_provider_citations_are_not_saved(self):
        channel = self.build(); output = generated(channel)
        output.ideas[0].source_ids = ["fabricated"]
        with patch.object(ideas.db, "query", return_value=[]), patch.object(ideas, "_generate", return_value=output), patch.object(ideas.db, "execute_many") as execute:
            with self.assertRaises(ideas.InvalidIdeas): ideas.generate_ideas(OWNER, channel, 3)
            execute.assert_not_called()

    def test_save_status_is_owner_scoped(self):
        with patch.object(ideas.db, "query", return_value=[]) as query, patch.object(ideas.db, "execute") as execute:
            self.assertIsNone(ideas.change_status(OWNER, "b"*32, "saved"))
            self.assertEqual(query.call_args.args[1], ("b"*32, OWNER))
            execute.assert_not_called()


class RouteTests(ContextFixture):
    def setUp(self):
        super().setUp()
        old = app.dependency_overrides.copy()
        app.dependency_overrides[require_user_id] = lambda: OWNER
        self.addCleanup(lambda: (app.dependency_overrides.clear(), app.dependency_overrides.update(old)))
        self.client = TestClient(app)
        self.addCleanup(self.client.close)

    def test_context_auth_cache_and_client_cannot_select_other_user(self):
        response = self.client.get("/ideas/context?platform=youtube&user_id=someone-else")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["cache-control"], "private, no-store")
        self.profile.assert_called_with(OWNER)
        app.dependency_overrides.pop(require_user_id)
        self.assertEqual(self.client.get("/ideas/context").status_code, 401)
        self.assertEqual(self.client.post("/ideas/generate", json={}).status_code, 401)

    def test_empty_history_does_not_invoke_gemini(self):
        self.posts=[]; self.reports=[]
        with patch.object(router.ideas, "generate_ideas") as generate:
            self.assertEqual(self.client.post("/ideas/generate", json={}).status_code, 422)
            generate.assert_not_called()

    def test_unknown_platform_count_and_user_fields_are_rejected(self):
        for body in [{"platform":"unknown"}, {"count":100}, {"user_id":"someone-else"}]:
            self.assertEqual(self.client.post("/ideas/generate", json=body).status_code, 422)


if __name__ == "__main__":
    unittest.main()
