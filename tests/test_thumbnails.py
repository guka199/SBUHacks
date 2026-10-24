import io
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient
from PIL import Image

from api.main import app
from api.routers.predict import score_with_model
from api.schemas import PredictRequest
from api.services import gemini, model
from ml.data import Split, build_matrices, with_thumbnails
from shared.bundle import ModelBundle
from shared.features import THUMBNAIL_COLUMNS, THUMBNAIL_ENCODER, build_features, thumbnail_features
from shared import thumbnails


def image_bytes(color="red"):
    output = io.BytesIO()
    Image.new("RGB", (320, 180), color).save(output, format="PNG")
    return output.getvalue()


def vector():
    result = np.zeros(512, dtype="float32")
    result[0] = 1
    return result


class ThumbnailTests(unittest.TestCase):
    def test_contract_rejects_wrong_dimensions_and_nan(self):
        for value in [[0] * 511, [float("nan")] * 512]:
            with self.assertRaises(ValueError): thumbnail_features(value)
        self.assertEqual(list(thumbnail_features(vector())), THUMBNAIL_COLUMNS)

    def test_validation_rejects_empty_corrupt_oversize_and_tiny_images(self):
        for content in [b"", b"not an image", b"a" * (thumbnails.MAX_IMAGE_BYTES + 1)]:
            with self.assertRaises(thumbnails.ThumbnailError): thumbnails.validate_image(content)
        self.assertEqual(thumbnails.validate_image(image_bytes()), (320, 180))
        tiny = io.BytesIO()
        Image.new("RGB", (2, 2)).save(tiny, format="PNG")
        with self.assertRaises(thumbnails.ThumbnailError): thumbnails.validate_image(tiny.getvalue())

    def test_url_allowlist_blocks_local_network_redirector_and_extra_parameters(self):
        for url in ["http://127.0.0.1/x", "https://localhost/x", "https://i.ytimg.com.evil.org/vi/abcdefghijk/hqdefault.jpg",
                    "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg?redirect=http://localhost", "file:///etc/passwd"]:
            with self.assertRaises(thumbnails.ThumbnailError): thumbnails.public_thumbnail_url(url)
        self.assertEqual(thumbnails.public_thumbnail_url("https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg"),
                         "https://i.ytimg.com/vi/abcdefghijk/hqdefault.jpg")

    def test_encoder_runs_in_subprocess_with_offline_mode(self):
        def run(command, **kwargs):
            output = Path(command[command.index("--output") + 1])
            np.save(output, vector()[None, :])
            self.assertEqual(kwargs['env']['HF_HUB_OFFLINE'], '1')
            self.assertIn('shared.thumbnail_worker', command)
            return SimpleNamespace(returncode=0)
        with tempfile.TemporaryDirectory() as folder, patch.object(thumbnails, 'CACHE', Path(folder)), \
             patch.object(subprocess, 'run', side_effect=run):
            result = thumbnails.encode_paths([Path('image.png')], offline=True)
        self.assertEqual(result.shape, (1, 512))

    def test_encoder_timeout_has_safe_error(self):
        with patch.object(subprocess, 'run', side_effect=subprocess.TimeoutExpired('secret-command', 1)):
            with self.assertRaises(thumbnails.ThumbnailError) as error:
                thumbnails.encode_paths([Path('image.png')])
        self.assertNotIn('secret-command', str(error.exception))

    def test_identical_image_reuses_embedding_cache(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(thumbnails, 'CACHE', Path(folder)), \
             patch.object(thumbnails, 'encode_paths', return_value=vector()[None, :]) as encode:
            a = thumbnails.encode_image(image_bytes())
            b = thumbnails.encode_image(image_bytes())
        self.assertEqual(a, b)
        encode.assert_called_once()

    def test_cache_rejects_encoder_mismatch(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'cache.parquet'
            pd.DataFrame([{'thumbnail_url': 'url', 'encoder': 'wrong', 'embedding': vector().tolist()}]).to_parquet(path)
            with self.assertRaises(thumbnails.ThumbnailError): thumbnails.load_embedding_cache(path)

    def test_train_and_serve_have_identical_visual_features(self):
        rows = [{'platform': 'youtube', 'creator_id': f'c{i}', 'external_id': str(i), 'thumbnail_url': str(i),
                 'caption': 'A useful example caption', 'posted_at': None, 'extra': '{}',
                 'virality_score': 50., 'account_relative': .1} for i in range(12)]
        split = Split(pd.DataFrame(rows[:6]), pd.DataFrame(rows[6:9]), pd.DataFrame(rows[9:]))
        m = build_matrices('youtube', split, use_text=False)
        images = {str(i): vector().tolist() for i in range(12)}
        visual = with_thumbnails(m, split, images)
        bundle = ModelBundle('youtube', 'catboost', None, visual.feature_columns, thumbnail_encoder=dict(THUMBNAIL_ENCODER))
        inputs = [build_features('youtube', r) for r in rows[9:]]
        served = bundle.frame(inputs, [''] * 3, [vector()] * 3)
        np.testing.assert_allclose(served, visual.X_test, equal_nan=True)
        old = ModelBundle('youtube', 'catboost', None, m.feature_columns)
        self.assertFalse(any(c.startswith('thumbnail_') for c in old.frame(inputs, [''] * 3).columns))

    def test_youtube_only_gets_visual_embedding(self):
        req = PredictRequest(caption='An example', platforms=['youtube', 'instagram'], use_thumbnail_model=True)
        with patch('api.routers.predict.model.thumbnail_bundle', return_value=object()), \
             patch('api.routers.predict.encode_image', return_value=vector().tolist()), \
             patch('api.routers.predict.model.score', return_value=(50., [])) as score, \
             patch('api.routers.predict.model.vs_account', return_value=None):
            result = score_with_model(req, thumbnail_bytes=image_bytes())
        self.assertTrue(result.scores[0].thumbnail_used)
        self.assertFalse(result.scores[1].thumbnail_used)
        self.assertIsNotNone(score.call_args_list[0].kwargs['thumbnail_embedding'])
        self.assertIsNone(score.call_args_list[1].kwargs['thumbnail_embedding'])

    def test_encoder_failure_preserves_standard_prediction(self):
        with patch('api.routers.predict.model.thumbnail_bundle', return_value=object()), \
             patch('api.routers.predict.encode_image', side_effect=thumbnails.ThumbnailError('Encoder unavailable')), \
             patch('api.routers.predict.model.score', return_value=(50., [])), \
             patch('api.routers.predict.model.vs_account', return_value=None):
            result = score_with_model(PredictRequest(caption='Example', platforms=['youtube'], use_thumbnail_model=True), thumbnail_bytes=image_bytes())
        self.assertFalse(result.scores[0].thumbnail_used)
        self.assertEqual(result.scores[0].score, 50)
        self.assertIn('standard prediction', result.thumbnail_warning)

    def test_disabled_candidate_never_downloads_or_encodes(self):
        with patch('api.routers.predict.model.thumbnail_bundle', return_value=None), \
             patch('api.routers.predict.encode_image') as encode, \
             patch('api.routers.predict.download_thumbnail') as download, \
             patch('api.routers.predict.model.score', return_value=(50., [])), \
             patch('api.routers.predict.model.vs_account', return_value=None):
            result = score_with_model(PredictRequest(caption='Example', platforms=['youtube'], thumbnail_url='https://localhost', use_thumbnail_model=True))
        encode.assert_not_called()
        download.assert_not_called()
        self.assertIn('not enabled', result.thumbnail_warning)

    def test_invalid_thumbnail_upload_is_rejected(self):
        response = TestClient(app).post('/score', data={'caption': 'Example', 'platforms': 'youtube'},
                                        files={'thumbnail': ('image.png', b'invalid', 'image/png')})
        self.assertEqual(response.status_code, 422)

    def test_thumbnail_requires_request_opt_in(self):
        with patch('api.routers.predict.model.thumbnail_bundle', return_value=object()), \
             patch('api.routers.predict.encode_image') as encode, \
             patch('api.routers.predict.model.score', return_value=(50., [])), \
             patch('api.routers.predict.model.vs_account', return_value=None):
            result = score_with_model(PredictRequest(caption='Example', platforms=['youtube']), thumbnail_bytes=image_bytes())
        encode.assert_not_called()
        self.assertFalse(result.scores[0].thumbnail_used)
        self.assertIsNone(result.thumbnail_warning)

    def test_video_is_not_treated_as_a_thumbnail(self):
        with patch.dict(os.environ, {'GEMINI_API_KEY': ''}), \
             patch('api.routers.predict.model.score', return_value=(50., [])), \
             patch('api.routers.predict.model.vs_account', return_value=None), \
             patch('api.routers.predict.encode_image') as encode:
            response = TestClient(app).post('/score', data={'caption': 'Example', 'platforms': 'youtube'},
                                            files={'file': ('video.mp4', b'video', 'video/mp4')})
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()['scores'][0]['thumbnail_used'])
        encode.assert_not_called()

    def test_candidate_contract_is_checked_before_use(self):
        candidate = ModelBundle('youtube', 'catboost', None, THUMBNAIL_COLUMNS, thumbnail_encoder={'wrong': True})
        model.thumbnail_bundle.cache_clear()
        try:
            with patch.dict(os.environ, {'YOUTUBE_THUMBNAILS_ENABLED': 'true'}), patch.object(ModelBundle, 'load', return_value=candidate):
                self.assertIsNone(model.thumbnail_bundle())
        finally:
            model.thumbnail_bundle.cache_clear()

    def test_gemini_receives_thumbnail_and_video(self):
        client = MagicMock()
        client.interactions.create.return_value.output_text = json.dumps({
            'summary': 'Example', 'hook': 50, 'visual_quality': 50, 'clarity': 50, 'trend_fit': 50,
            'platform_scores': [], 'strengths': [], 'suggestions': []})
        with patch('google.genai.Client', return_value=client):
            gemini.analyze(['youtube'], 'Example', None, {}, {'youtube': 50}, [], b'video', 'video/mp4',
                           thumbnail=b'image', thumbnail_mime_type='image/png', model_uses_thumbnail=True)
        items = client.interactions.create.call_args.kwargs['input']
        self.assertEqual([i['type'] for i in items if i['type'] in ('image', 'video')], ['video', 'image'])
        self.assertIn('thumbnail features', items[0]['text'])

    def test_api_import_does_not_import_torch(self):
        self.assertNotIn('torch', sys.modules)


if __name__ == '__main__':
    unittest.main()
