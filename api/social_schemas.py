"""Owner-scoped social imports. Public counts are nullable, never imputed."""
import re
from typing import Literal
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field, model_validator

Platform = Literal['youtube', 'instagram', 'tiktok', 'linkedin']


def canonical_url(platform: str, value: str) -> str:
    u = urlsplit(value.strip())
    if u.scheme != 'https' or u.username or u.password or u.port or u.query or u.fragment:
        raise ValueError('Use a public HTTPS profile URL without query parameters')
    host = (u.hostname or '').removeprefix('www.')
    expected = {'youtube': 'youtube.com', 'instagram': 'instagram.com',
                'tiktok': 'tiktok.com', 'linkedin': 'linkedin.com'}[platform]
    path = u.path.strip('/')
    patterns = {'instagram': r'[A-Za-z0-9_.]{1,30}', 'tiktok': r'@[A-Za-z0-9_.]{1,32}',
                'linkedin': r'(?:in|company)/[A-Za-z0-9_%.-]{1,120}',
                'youtube': r'(?:@[A-Za-z0-9_.-]{1,100}|channel/UC[A-Za-z0-9_-]{22})'}
    if host != expected or not re.fullmatch(patterns[platform], path):
        raise ValueError('Use a supported profile URL for the selected platform')
    if platform == 'instagram' and path.lower() in {'p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'direct'}:
        raise ValueError('Use a creator profile, not a content or login URL')
    return f'https://www.{expected}/{path}'


class ImportRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    platform: Platform
    profile_url: str = Field(max_length=300)
    authorized: Literal[True]  # caller attests they have permission to import this profile
    max_posts: int = Field(default=30, ge=1, le=100)

    @model_validator(mode='after')
    def validate_url(self):
        self.profile_url = canonical_url(self.platform, self.profile_url)
        return self


class RefreshRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    acknowledge_uncertain_launch: bool = False


class ScheduleRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')
    interval_hours: int | None = Field(default=None, ge=6, le=720)


class SocialPost(BaseModel):
    post_id: str
    url: str | None = None
    caption: str = ''
    posted_at: str | None = None
    format: str = 'post'
    views: int | None = Field(default=None, ge=0)
    likes: int | None = Field(default=None, ge=0)
    comments: int | None = Field(default=None, ge=0)
    shares: int | None = Field(default=None, ge=0)


class SocialSnapshot(BaseModel):
    platform: Platform
    username: str
    profile_url: str
    external_id: str | None = None
    display_name: str | None = None
    followers: int | None = Field(default=None, ge=0)
    following: int | None = Field(default=None, ge=0)
    total_posts: int | None = Field(default=None, ge=0)
    posts: list[SocialPost]
    data_source: Literal['apify', 'phantombuster', 'youtube_api']
    last_updated: str
    visibility: Literal['public_metrics'] = 'public_metrics'
    warnings: list[str] = Field(default_factory=list)
    metrics: dict = Field(default_factory=dict)


class JobOut(BaseModel):
    id: str
    platform: Platform
    status: str
    phase: str
    progress: int
    created_at: str
    updated_at: str
    error: str | None = None
    snapshot_id: str | None = None


class HistoricalSnapshot(SocialSnapshot):
    snapshot_id: str
