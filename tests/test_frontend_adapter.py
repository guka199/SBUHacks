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


class VideoMomentTests(unittest.TestCase):
    def test_gemini_moments_are_parsed_clamped_and_sorted(self):
        from api.services.gemini import GeminiMoment, clean_moments
        def moment(start, end, issue="pacing"):
            return GeminiMoment(start=start, end=end, issue=issue, title="Slow intro", problem="p", fix="f")
        kept = clean_moments([moment("00:12", "00:30"), moment("0:03", "0:01", "unclear"),
                              moment("01:00", "01:05"), moment("soon", "later"), moment("00:12.2", "00:14")], 24)
        self.assertEqual([(k["start"], k["end"], k["issue"]) for k in kept],
                         [(3.0, 6.0, "unclear"), (12.0, 24.0, "pacing")])

    def test_report_carries_moments_and_overall_suggestions(self):
        from api.schemas import ContentAnalysis, VideoMoment
        tests = AdapterTests("test_live_model_fallback_is_honest_and_saved_to_signed_owner")
        tests.setUp()
        self.addCleanup(tests.doCleanups)

        async def score(**kwargs):
            return ScoreResponse(
                scores=[CombinedScore(platform="youtube", score=60, model_score=50, content_score=75, top_factors=[])],
                suggestions=["Open on the result.", "Cut the pause at 0:08."], model_weight=0.6, gemini_used=True,
                content=ContentAnalysis(summary="A recipe video.", hook=60, visual_quality=70, clarity=55, trend_fit=50,
                                        platform_scores=[], strengths=["Bright lighting"],
                                        moments=[VideoMoment(start=8, end=11, issue="pacing", title="Dead air",
                                                             problem="Nothing happens.", fix="Cut 3 s.")]),
            )
        tests.scorer.side_effect = score
        report = tests.create(["shorts", "youtube"]).json()["result"]
        self.assertEqual(report["overallSuggestions"], ["Open on the result.", "Cut the pause at 0:08."])
        self.assertEqual(len(report["observations"]), 1)  # the Shorts review of the same video doesn't duplicate it
        self.assertEqual(report["observations"][0] | {}, {"id": "m0", "time": 8.0, "end": 11.0, "kind": "pacing",
                         "title": "Dead air", "detail": "Nothing happens.", "fix": "Cut 3 s."})


def _image(fmt="PNG", size=(64, 36)):
    import io as _io
    from PIL import Image
    buffer = _io.BytesIO()
    Image.new("RGB", size, "#336699").save(buffer, fmt)
    return buffer.getvalue()


class ThumbnailTests(unittest.TestCase):
    def setUp(self):
        self.base = AdapterTests("test_live_model_fallback_is_honest_and_saved_to_signed_owner")
        self.base.setUp()
        self.addCleanup(self.base.doCleanups)
        self.configured = self.base.mock(analyses.gemini, "is_configured", return_value=True)

    def post(self, thumbs, selected=("youtube", "tiktok")):
        return self.base.client.post("/api/analyses", data={
            "platforms": json.dumps(list(selected)), "caption": "A real draft caption",
            "metadata": json.dumps({"name": "clip.webm", "durationSeconds": 24, "width": 720, "height": 1280}),
        }, files=[("video", ("clip.webm", b"\x1aE\xdf\xa3payload", "video/webm"))]
                 + [("thumbnails", t) for t in thumbs])

    def comparison(self):
        from api.services.gemini import GeminiThumbnail, GeminiThumbnailComparison, GeminiThumbnailScore
        def thumb(number, youtube, tiktok):
            return GeminiThumbnail(number=number, strengths=["Bold text"], improvements=["Crop tighter"], scores=[
                GeminiThumbnailScore(platform="YouTube", score=youtube, reason=f"yt {number}"),
                GeminiThumbnailScore(platform="tiktok", score=tiktok, reason=f"tt {number}")])
        return GeminiThumbnailComparison(summary="Use 1 on YouTube, 2 on TikTok.",
                                         thumbnails=[thumb(1, 80, 30), thumb(2, 40, 70)])

    def test_best_thumbnail_is_picked_per_platform_and_files_are_saved(self):
        compare = self.base.mock(analyses.gemini, "compare_thumbnails", return_value=self.comparison())
        response = self.post([("wide.png", _image(), "image/png"), ("tall.jpg", _image("JPEG", (36, 64)), "image/jpeg")])
        self.assertEqual(response.status_code, 200, response.text)
        review = response.json()["result"]["thumbnails"]
        self.assertEqual({p["platform"]: (p["index"], p["reason"]) for p in review["picks"]},
                         {"youtube": (0, "yt 1"), "tiktok": (1, "tt 2")})
        self.assertEqual([(t["name"], t["width"], t["height"]) for t in review["items"]],
                         [("wide.png", 64, 36), ("tall.jpg", 36, 64)])
        self.assertEqual(compare.call_args.args[0], ["youtube", "tiktok"])
        saved = [c.args[2] for c in self.base.store.call_args_list]
        report_id = response.json()["id"]
        self.assertEqual(saved[1:], [f"{report_id}_thumb0.png", f"{report_id}_thumb1.jpg"])

    def test_thumbnail_failure_is_a_warning_not_an_error(self):
        self.base.mock(analyses.gemini, "compare_thumbnails", side_effect=RuntimeError("boom"))
        response = self.post([("wide.png", _image(), "image/png")])
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.json()["result"]["thumbnails"])
        self.assertTrue(any("thumbnails" in w for w in response.json()["result"]["warnings"]))
        self.assertEqual(self.base.store.call_count, 1)  # only the video

    def test_invalid_thumbnails_are_rejected_before_scoring(self):
        png = ("t.png", _image(), "image/png")
        self.assertEqual(self.post([png] * 4).status_code, 422)
        self.assertEqual(self.post([("t.gif", b"GIF89a", "image/gif")]).status_code, 415)
        self.assertEqual(self.post([("t.jpg", _image(), "image/jpeg")]).status_code, 415)  # PNG bytes labelled JPEG
        self.base.scorer.assert_not_awaited()

    def test_thumbnail_download_is_owner_scoped(self):
        self.assertEqual(self.base.client.get(f"/api/analyses/{'a' * 32}/thumbnails/0").status_code, 404)
        self.assertIn(OWNER, self.base.query.call_args.args[1])
