"""Caption topic features: what a caption is ABOUT (words + hashtags), compressed to a few numbers.

TF-IDF over words, bigrams and hashtags -> TruncatedSVD (LSA) -> up to TEXT_DIMS numbers per caption.
Fit once per platform on the TRAINING captions only, then stored inside the saved model bundle,
so training and the API encode captions identically.
"""

import pandas as pd
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer

TEXT_DIMS = 32


class TextEncoder:
    def __init__(self, dims: int = TEXT_DIMS):
        self.dims = dims
        self.vectorizer = TfidfVectorizer(
            max_features=50_000,
            min_df=5,
            ngram_range=(1, 2),
            token_pattern=r"#?\w\w+",  # keeps hashtags as their own tokens
            sublinear_tf=True,
        )
        self.svd: TruncatedSVD | None = None
        self.columns: list[str] = []

    def fit(self, captions: pd.Series, max_rows: int = 300_000) -> "TextEncoder":
        captions = pd.Series(captions).fillna("")
        sample = captions.sample(min(len(captions), max_rows), random_state=42)
        tfidf = self.vectorizer.fit_transform(sample)
        # Small datasets may have fewer distinct words than TEXT_DIMS
        n_components = max(1, min(self.dims, tfidf.shape[1] - 1))
        self.svd = TruncatedSVD(n_components=n_components, random_state=42).fit(tfidf)
        self.columns = [f"text_{i}" for i in range(n_components)]
        return self

    def transform(self, captions: pd.Series | list[str]) -> pd.DataFrame:
        captions = pd.Series(captions).fillna("")
        values = self.svd.transform(self.vectorizer.transform(captions))
        return pd.DataFrame(values, columns=self.columns, index=captions.index)
