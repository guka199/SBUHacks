"""Adapter contracts without provider calls or database writes."""

import json
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from api.main import app
from api.analysis_schemas import PublishingCopy
from api.routers import analyses
from api.schemas import CombinedScore, ScoreResponse
from api.services.auth import require_user_id


OWNER = "a" * 32


class AdapterTests(unittest.TestCase):
    def setUp(self):
        old = app.dependency_overrides.copy()
        app.dependency_overrides[require_user_id] = lambda: OWNER
        self.addCleanup(lambda: (app.dependency_overrides.clear(), app.dependency_overrides.update(old)))
        self.client = TestClient(app)
        self.addCleanup(self.client.close)
        self.execute = self.mock(analyses.db, "execute")
        self.store = self.mock(analyses.db, "store_file", return_value=f"data/uploads/{OWNER}/video.webm")
        self.query = self.mock(analyses.db, "query", return_value=[])
        self.bundle = self.mock(analyses.model, "load_bundle", return_value=object())

        async def score(**kwargs):
            return ScoreResponse(
                scores=[CombinedScore(platform=p, score=41, model_score=41, content_score=None, top_factors=[])
                        for p in kwargs["platforms"].split(",")],
                suggestions=["Make the caption clearer."], warning="Gemini unavailable - model score only.",
                content=None, model_weight=0.6, gemini_used=False,
            )
        self.scorer = self.mock(analyses, "score_post", new=AsyncMock(side_effect=score))

    def mock(self, target, name, **kwargs):
        item = patch.object(target, name, **kwargs)
        self.addCleanup(item.stop)
        return item.start()

    def create(self, selected=None, media=b"\x1aE\xdf\xa3payload", metadata=None):
        return self.client.post("/api/analyses", data={
            "platforms": json.dumps(selected if selected is not None else ["youtube"]),
            "metadata": json.dumps(metadata or {"name": "clip.webm", "durationSeconds": 24, "width": 720, "height": 1280}),
            "caption": "A real draft caption",
            "user_id": "not-the-owner",  # ignored; only the signed session selects ownership
        }, files={"video": ("clip.webm", media, "video/webm")})

    def test_live_model_fallback_is_honest_and_saved_to_signed_owner(self):
        response = self.create()
        self.assertEqual(response.status_code, 200)
        report = response.json()["result"]
        platform = report["platforms"][0]
        self.assertEqual(report["mode"], "live")
        self.assertFalse(platform["geminiUsed"])
        self.assertIsNone(platform["hook"])
        self.assertIsNone(platform["pacing"])
        self.assertIsNone(platform["format"])
        self.assertEqual(report["observations"], [])
        self.assertTrue(report["warnings"])
        self.assertEqual(platform["suggestions"]["hook"], "")
        self.assertEqual(platform["suggestions"]["caption"], "A real draft caption")
        self.assertEqual(self.scorer.call_args.kwargs["user_id"], OWNER)
        self.assertEqual(self.execute.call_args.args[1][1], OWNER)
        self.assertEqual(response.headers["cache-control"], "private, no-store")

    def test_short_and_long_formats_reuse_youtube_but_review_separately(self):
        response = self.create(["shorts", "youtube"])
        self.assertEqual(response.status_code, 200)
        self.assertEqual([p["id"] for p in response.json()["result"]["platforms"]], ["shorts", "youtube"])
        self.assertEqual(self.scorer.await_count, 2)
        calls = [c.kwargs for c in self.scorer.call_args_list]
        self.assertEqual([c["platforms"] for c in calls], ["youtube", "youtube"])
        self.assertEqual([json.loads(c["context"])["format"] for c in calls], ["video", "short"])
        self.assertEqual([json.loads(c["context"])["duration_sec"] for c in calls], [24, 24])

    def test_invalid_platforms_and_metadata_are_rejected_before_scoring(self):
        for selected in [[], ["youtube", "youtube"], ["unknown"], {"youtube": True}]:
            self.assertEqual(self.create(selected).status_code, 422)
        self.assertEqual(self.create(metadata={"name":"clip", "durationSeconds":-1, "width":720,"height":1280}).status_code, 422)
        self.scorer.assert_not_called()

    def test_wrong_container_and_upload_limit_are_rejected(self):
        self.assertEqual(self.create(media=b"not a video").status_code, 415)
        with patch.object(analyses, "MAX_UPLOAD_BYTES", 4):
            self.assertEqual(self.create().status_code, 413)
        self.scorer.assert_not_called()

    def test_missing_model_never_uses_fake_live_scores(self):
        self.bundle.return_value = None
        self.assertEqual(self.create().status_code, 503)
        self.scorer.assert_not_called()
        self.store.assert_not_called()

    def test_missing_owner_report_is_404_and_query_is_owner_scoped(self):
        report_id = "b" * 32
        self.assertEqual(self.client.get(f"/api/analyses/{report_id}").status_code, 404)
        self.assertEqual(self.query.call_args.args[1], (report_id, OWNER))
        self.assertIn("user_id = %s", self.query.call_args.args[0])

    def test_video_cannot_escape_owner_upload_folder(self):
        self.query.return_value = [{"media_path": "../../etc/passwd", "media_type": "video/webm"}]
        with patch.object(analyses.db, "backend", return_value="sqlite"):
            self.assertEqual(self.client.get(f"/api/analyses/{'b' * 32}/video").status_code, 404)

    def test_anonymous_access_is_rejected(self):
        app.dependency_overrides.pop(require_user_id)
        self.assertEqual(self.client.get("/api/analyses").status_code, 401)
        self.assertEqual(self.client.get(f"/api/analyses/{'b' * 32}/video").status_code, 401)
        self.query.assert_not_called()

    def test_rewrite_is_real_provider_output_and_persists(self):
        report = self.create().json()["result"]
        self.query.return_value = [{"id": report["id"], "report": json.dumps(report), "caption": "Original caption"}]
        self.mock(analyses.gemini, "is_configured", return_value=True)
        generated = PublishingCopy(hook="A generated hook", title="Specific title", caption="Specific caption")
        provider = self.mock(analyses.gemini, "rewrite_copy", return_value=generated)
        response = self.client.post(f"/api/analyses/{report['id']}/rewrite", json={"platform":"youtube", "tone":"playful"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["suggestions"]["hook"], generated.hook)
        provider.assert_called_once()
        params = self.execute.call_args.args[1]
        self.assertEqual(params[1:], (report["id"], OWNER))
        self.assertEqual(json.loads(params[0])["platforms"][0]["suggestions"]["hook"], generated.hook)

    def test_rewrite_failure_is_not_demo_copy(self):
        report = self.create().json()["result"]
        self.query.return_value = [{"id": report["id"], "report": json.dumps(report), "caption": "Original"}]
        self.mock(analyses.gemini, "is_configured", return_value=False)
        response = self.client.post(f"/api/analyses/{report['id']}/rewrite", json={"platform":"youtube", "tone":"direct"})
        self.assertEqual(response.status_code, 503)

    def test_rewrite_requests_bounded_complete_structured_output(self):
        with patch("google.genai.Client") as constructor:
            client = constructor.return_value.__enter__.return_value
            client.interactions.create.return_value.output_text = PublishingCopy(hook="A specific hook").model_dump_json()
            result = analyses.gemini.rewrite_copy("Original", "youtube", "direct", "A review", ["An edit"])
            self.assertEqual(result.hook, "A specific hook")
            request = client.interactions.create.call_args.kwargs
            self.assertEqual(request["generation_config"]["max_output_tokens"], 2048)
            schema = request["response_format"]["schema"]
            self.assertEqual(set(schema["required"]), set(schema["properties"]))
            self.assertEqual(schema["properties"]["caption"]["maxLength"], 700)


if __name__ == "__main__":
    unittest.main()
