"""Destructive report operations against disposable SQLite files, never shared Snowflake."""

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from api.main import app
from api.services import accounts, db
from api.services.auth import COOKIE_NAME, create_session


class ReportDeletionTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"SNOWFLAKE_ACCOUNT": "", "SESSION_SECRET": "report-deletion-test-only"}, clear=True)
        self.env.start()
        db.close()
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.paths = [patch.object(db, "LOCAL_DB", root / "test.db"), patch.object(db, "LOCAL_UPLOADS", root / "uploads")]
        for item in self.paths:
            item.start()
        db.init()
        self.owner = accounts.create_user("owner@example.test", "fixture-hash", "Owner", "creator", None)["id"]
        self.other = accounts.create_user("other@example.test", "fixture-hash", "Other", "creator", None)["id"]
        self.client = TestClient(app)  # no lifespan or provider worker
        self.client.cookies.set(COOKIE_NAME, create_session(self.owner))
        self.addCleanup(self.cleanup)

    def cleanup(self):
        self.client.close()
        db.close()
        for item in reversed(self.paths):
            item.stop()
        self.tmp.cleanup()
        self.env.stop()

    def seed(self, report_id, owner=None, kind="video"):
        owner = owner or self.owner
        payload = {"kind": kind, "video": {"name": "Synthetic test video", "durationSeconds": 5, "width": 720, "height": 1280},
                   "variants": [{"caption": "Synthetic post", "images": [{}]}]}
        db.execute("INSERT INTO ANALYSES (id, user_id, caption, report, media_path, media_type, created_at) VALUES (%s,%s,%s,%s,%s,%s,%s)",
                   (report_id, owner, "Synthetic report", json.dumps(payload), "unused-test-path", "video/webm", db.now()))
        folder = db.LOCAL_UPLOADS / owner
        folder.mkdir(parents=True, exist_ok=True)
        paths = [folder / f"{report_id}{suffix}" for suffix in (".webm", "_thumb0.png", "_v0_0.png", "_v1_0.jpg")]
        for path in paths:
            path.write_bytes(b"disposable fixture")
        return paths

    def test_video_and_post_deletion_remove_only_the_target_and_its_media(self):
        for kind, report_id in (("video", "a" * 32), ("post", "b" * 32)):
            with self.subTest(kind=kind):
                paths = self.seed(report_id, kind=kind)
                peer_id = ("c" if kind == "video" else "d") * 32
                peer = self.seed(peer_id)
                foreign_id = ("e" if kind == "video" else "f") * 32
                foreign = self.seed(foreign_id, self.other, kind)
                same_prefix = db.LOCAL_UPLOADS / self.other / f"{report_id}.webm"
                same_prefix.write_bytes(b"other owner's fixture")
                foreign.append(same_prefix)
                result = self.client.delete(f"/api/analyses/{report_id}")
                self.assertEqual(result.status_code, 200)
                self.assertEqual(result.json(), {"ok": True})
                self.assertEqual(result.headers["cache-control"], "private, no-store")
                self.assertFalse(any(path.exists() for path in paths))
                self.assertTrue(all(path.exists() for path in peer + foreign))
                self.assertEqual(db.query("SELECT id FROM ANALYSES WHERE id = %s AND user_id = %s", (report_id, self.owner)), [])
                self.assertEqual(len(db.query("SELECT id FROM ANALYSES WHERE id = %s AND user_id = %s", (foreign_id, self.other))), 1)
                self.assertNotIn(report_id, [r["id"] for r in self.client.get("/api/analyses").json()])
                self.assertEqual(self.client.get(f"/api/analyses/{report_id}").status_code, 404)
                self.assertEqual(self.client.get(f"/api/analyses/{report_id}/video").status_code, 404)
                self.assertEqual(self.client.get(f"/api/post-analyses/{report_id}/images/0/0").status_code, 404)

    def test_foreign_missing_and_invalid_ids_are_404_without_removing_files(self):
        paths = self.seed("e" * 32, self.other)
        with patch.object(db, "remove_report_media") as remove:
            for report_id in ("e" * 32, "f" * 32, "not-an-id", "../escape"):
                self.assertEqual(self.client.delete(f"/api/analyses/{report_id}").status_code, 404)
            remove.assert_not_called()
        self.assertTrue(all(path.exists() for path in paths))

    def test_anonymous_requests_cannot_delete(self):
        paths = self.seed("a" * 32)
        self.client.cookies.clear()
        self.assertEqual(self.client.delete(f"/api/analyses/{'a' * 32}").status_code, 401)
        self.assertTrue(all(path.exists() for path in paths))

    def test_cache_invalidation_is_owner_scoped_and_transaction_rolls_back_on_failure(self):
        report_id = "a" * 32
        paths = self.seed(report_id)
        for owner in (self.owner, self.other):
            db.execute("INSERT INTO CHANNEL_MEMORIES (user_id,payload,updated_at) VALUES (%s,%s,%s)", (owner, "{}", db.now()))
        original = db.Transaction.execute
        def fail(tx, sql, params=()):
            if sql.startswith("DELETE FROM CHANNEL_MEMORIES"):
                raise RuntimeError("private database diagnostic")
            return original(tx, sql, params)
        with patch.object(db.Transaction, "execute", fail):
            response = self.client.delete(f"/api/analyses/{report_id}")
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("private", response.text)
        self.assertEqual(len(db.query("SELECT id FROM ANALYSES WHERE id = %s", (report_id,))), 1)
        self.assertTrue(all(path.exists() for path in paths))
        self.assertEqual(self.client.delete(f"/api/analyses/{report_id}").status_code, 200)
        self.assertEqual([r["user_id"] for r in db.query("SELECT user_id FROM CHANNEL_MEMORIES")], [self.other])

    def test_cleanup_failure_reports_the_completed_deletion_honestly(self):
        self.seed("a" * 32)
        with patch.object(db, "remove_report_media", side_effect=OSError("private storage failure")):
            response = self.client.delete(f"/api/analyses/{'a' * 32}")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])
        self.assertIn("cleanup", response.json()["warning"])
        self.assertNotIn("private storage", response.text)
        self.assertEqual(self.client.get(f"/api/analyses/{'a' * 32}/video").status_code, 404)

    def test_snowflake_cleanup_is_limited_to_the_validated_owner_report_prefix(self):
        with patch.object(db, "backend", return_value="snowflake"), patch.object(db, "execute") as execute:
            db.remove_report_media(self.owner, "a" * 32)
            self.assertEqual([c.args[0] for c in execute.call_args_list], [f"REMOVE @ANALYSIS_MEDIA/{self.owner}/{'a' * 32}", f"REMOVE @MEDIA/{self.owner}/{'a' * 32}"])
            execute.reset_mock()
            for owner, report_id in (("../escape", "a" * 32), (self.owner, "a' OR 1=1")):
                with self.assertRaises(ValueError):
                    db.remove_report_media(owner, report_id)
            execute.assert_not_called()


if __name__ == "__main__":
    unittest.main()
