"""Explicit provider field mappings; retain only bounded public data, not raw credentials/PII.

Apify mappings follow the two actors' documented output examples. PhantomBuster
exports vary by agent: see docs/social-data-integration.md for the accepted adapter
contract and configuration. Unknown fields are ignored, missing fields stay null.
"""
import re
from datetime import datetime, timezone
from statistics import mean, median
from urllib.parse import urlsplit

from api.social_schemas import SocialPost, SocialSnapshot
from api.services.errors import InvalidImport


def count(value):
    if isinstance(value, bool) or value is None:
        return None
    text = str(value).strip().replace(',', '')
    return int(text) if re.fullmatch(r'\d{1,16}', text) else None


def timestamp(value):
    try:
        if isinstance(value, (int, float)) and not isinstance(value, bool):
            date = datetime.fromtimestamp(value / 1000 if value > 10**12 else value, timezone.utc)
        elif isinstance(value, str) and value.strip():
            if re.fullmatch(r'\d{10}|\d{13}', value.strip()):
                return timestamp(int(value.strip()))
            date = datetime.fromisoformat(value.replace('Z', '+00:00'))
            if date.tzinfo is None:
                date = date.replace(tzinfo=timezone.utc)
        else:
            return None
        return date.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')
    except (ValueError, OverflowError, OSError):
        return None


def text(value, limit=6000):
    return value[:limit] if isinstance(value, str) else ''


def field(row, path):
    if path in row:
        return row[path]
    value = row
    for part in path.split('.'):
        if not isinstance(value, dict):
            return None
        value = value.get(part)
    return value


def public_url(value):
    if not isinstance(value, str) or len(value) > 1000:
        return None
    try:
        u = urlsplit(value)
        return value if u.scheme == 'https' and u.hostname and not u.username and not u.password else None
    except ValueError:
        return None


def aggregate(posts, followers):
    """Sample statistics, with denominators/coverage explicitly reported."""
    metrics = {'sample_size': len(posts)}
    for key in ('views', 'likes', 'comments', 'shares'):
        known = [getattr(p, key) for p in posts if getattr(p, key) is not None]
        metrics[f'avg_{key}'] = mean(known) if known else None
        metrics[f'{key}_sample_size'] = len(known)
    mature = [p.views for p in posts if p.views is not None and p.posted_at and
              (datetime.now(timezone.utc) - datetime.fromisoformat(p.posted_at.replace('Z', '+00:00'))).days >= 7]
    views = mature or [p.views for p in posts if p.views is not None]
    metrics['typical_views'] = median(views) if views else None
    # Use only posts with ALL three engagement counters. A missing share is not zero.
    complete = [p for p in posts if all(getattr(p, k) is not None for k in ('likes', 'comments', 'shares'))]
    by_view = [p for p in complete if p.views is not None and p.views > 0]
    if by_view:
        numerator = sum(p.likes + p.comments + p.shares for p in by_view)
        denominator = sum(p.views for p in by_view)
        basis, sample = 'views', len(by_view)
    elif complete and followers:
        numerator = sum(p.likes + p.comments + p.shares for p in complete)
        denominator, basis, sample = followers * len(complete), 'followers', len(complete)
    else:
        numerator, denominator, basis, sample = 0, 0, None, 0
    metrics.update(engagement_rate=numerator / denominator if denominator else None,
                   engagement_basis=basis, engagement_sample_size=sample,
                   engagement_components=['likes', 'comments', 'shares'])
    dates = [datetime.fromisoformat(p.posted_at.replace('Z', '+00:00')) for p in posts if p.posted_at]
    span = (max(dates) - min(dates)).total_seconds() / 86400 if len(dates) > 1 else 0
    metrics['posts_per_week'] = (len(dates) - 1) * 7 / span if span > 0 else None
    metrics['posting_hours_utc'] = {str(h): sum(d.hour == h for d in dates) for h in sorted({d.hour for d in dates})}
    metrics['posting_time_note'] = 'Observed sample distribution; not a prediction of optimal posting time.'
    return metrics


def normalize(platform, profile_url, rows, max_posts=30, *, post_rows=None):
    if not isinstance(rows, list) or any(not isinstance(r, dict) for r in rows):
        raise InvalidImport('Provider dataset must contain JSON objects')
    handle = profile_url.rstrip('/').split('/')[-1].lstrip('@')
    profile, candidates = {}, []
    warnings = []
    if platform == 'instagram':
        profiles = [r for r in rows if str(r.get('username', '')).casefold() == handle.casefold()]
        if not profiles or profiles[0].get('private') or profiles[0].get('isPrivate'):
            raise InvalidImport('No matching public Instagram profile in the results')
        p = profiles[0]
        if p.get('error') or p.get('errorMessage'):
            raise InvalidImport('Instagram profile extraction failed; previous statistics were retained')
        profile = dict(external_id=str(p['id']) if p.get('id') else None, display_name=text(p.get('fullName'), 200),
                       followers=count(p.get('followersCount')), following=count(p.get('followsCount')),
                       total_posts=count(p.get('postsCount')))
        for r in (p.get('latestPosts') or [])[:max_posts]:
            if not isinstance(r, dict) or (r.get('ownerUsername') and r['ownerUsername'].casefold() != handle.casefold()):
                continue
            candidates.append(dict(post_id=r.get('id') or r.get('shortCode'), url=public_url(r.get('url')),
                                   caption=text(r.get('caption')), posted_at=timestamp(r.get('timestamp')),
                                   format='video' if r.get('type') == 'Video' else 'post',
                                   views=count(r.get('videoViewCount')), likes=count(r.get('likesCount')),
                                   comments=count(r.get('commentsCount')), shares=None))
        warnings.append('Instagram profile details include only embedded recent posts; requested limit is a ceiling. Shares and private analytics are unavailable.')
    elif platform == 'tiktok':
        matching = [r for r in rows if str(field(r, 'authorMeta.name') or '').casefold() == handle.casefold()]
        if not matching or any(field(r, 'authorMeta.privateAccount') is True for r in matching):
            raise InvalidImport('No matching public TikTok creator in the results')
        if any(r.get('error') or r.get('errorMessage') for r in matching):
            raise InvalidImport('TikTok profile extraction failed; previous statistics were retained')
        p = matching[0]
        if p.get('error') or p.get('errorMessage'):
            raise InvalidImport('LinkedIn profile extraction failed; previous statistics were retained')
        profile = dict(external_id=str(field(p, 'authorMeta.id') or '') or None,
                       display_name=text(field(p, 'authorMeta.nickName'), 200),
                       followers=count(field(p, 'authorMeta.fans')), following=count(field(p, 'authorMeta.following')),
                       total_posts=count(field(p, 'authorMeta.video')))
        for r in matching[:max_posts]:
            candidates.append(dict(post_id=r.get('id') or public_url(r.get('webVideoUrl')), url=public_url(r.get('webVideoUrl')),
                                   caption=text(r.get('text')), posted_at=timestamp(r.get('createTimeISO') or r.get('createTime')),
                                   format='video', views=count(r.get('playCount')), likes=count(r.get('diggCount')),
                                   comments=count(r.get('commentCount')), shares=count(r.get('shareCount'))))
    elif platform == 'linkedin':
        # Profiles/company records and activity records must be scoped to the requested URL.
        def same(value):
            return isinstance(value, str) and value.lower().replace('://www.', '://').rstrip('/') == profile_url.lower().replace('://www.', '://').rstrip('/')
        matching = [r for r in rows if same(r.get('profileUrl') or r.get('linkedinProfileUrl') or r.get('companyUrl') or r.get('linkedinCompanyUrl'))]
        if not matching:
            raise InvalidImport('LinkedIn result schema/profile mismatch; verify configured agent export mapping')
        p = matching[0]
        public_name = p.get('fullName') or p.get('companyName') or p.get('name') or ' '.join(
            text(p.get(k), 100) for k in ('firstName', 'lastName')).strip()
        follower_value = next((p[k] for k in ('followersCount', 'linkedinFollowersCount', 'followers') if k in p), None)
        profile = dict(external_id=str(p.get('id') or p.get('linkedinProfileId') or '') or None,
                       display_name=text(public_name, 200),
                       followers=count(follower_value),
                       following=None, total_posts=None)
        for r in (post_rows or [])[:max_posts]:
            if not isinstance(r, dict) or not same(r.get('profileUrl') or r.get('authorProfileUrl') or r.get('companyUrl')):
                continue
            # Exclude likes/comments on other people's posts; only authored posts are history.
            # Current Activity Extractor uses action for activity and type for
            # media (e.g. Image/Video), so filtering on media loses valid posts.
            activity = r.get('action') if 'action' in r else r.get('type')
            if activity not in (None, 'post', 'Post', 'article', 'Article'):
                continue
            candidates.append(dict(post_id=r.get('postId') or r.get('postUrl'), url=public_url(r.get('postUrl')),
                                   caption=text(r.get('postContent') or r.get('text')),
                                   posted_at=timestamp(r.get('postTimestamp')) or timestamp(r.get('postDate') or r.get('publishedAt')),
                                   format=text(r.get('type'), 30).lower() if r.get('action') else 'post',
                                   likes=count(r.get('likeCount')), comments=count(r.get('commentCount')),
                                   shares=count(r.get('repostCount')), views=None))
        warnings.append('LinkedIn fields depend on configured Phantoms. No private impressions; employee/connection counts are not followers. Unscoped/non-authored activity is excluded.')
    else:
        raise InvalidImport('Unsupported normalization platform')
    return snapshot(platform, handle, profile_url, profile, candidates, warnings, max_posts)


def snapshot(platform, handle, url, profile, candidates, warnings, max_posts):
    posts, seen = [], set()
    for r in candidates:
        pid = str(r.get('post_id') or '')[:1000]
        if not pid or pid in seen:
            continue
        seen.add(pid)
        posts.append(SocialPost(**{**r, 'post_id': pid}))
    posts = posts[:max_posts]
    return SocialSnapshot(platform=platform, username=handle, profile_url=url, **profile,
                          posts=posts, data_source='youtube_api' if platform == 'youtube' else
                          'phantombuster' if platform == 'linkedin' else 'apify',
                          last_updated=datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
                          warnings=warnings, metrics=aggregate(posts, profile.get('followers')))


def youtube_snapshot(result, profile_url, max_posts):
    a, candidates = result.account, []
    for r in result.posts:
        raw = r.get('_raw_payload', {})
        st = raw.get('statistics', {})
        candidates.append(dict(post_id=r['external_id'], caption=text(r.get('caption')),
                               posted_at=timestamp(r.get('posted_at')), format='video',
                               url=f"https://www.youtube.com/watch?v={r['external_id']}",
                               views=count(st.get('viewCount')), likes=count(st.get('likeCount')),
                               comments=count(st.get('commentCount')), shares=None))
    return snapshot('youtube', a.get('handle') or a['external_id'], profile_url,
                    dict(external_id=a.get('external_id'), followers=a.get('followers'),
                         display_name=a.get('display_name'), total_posts=a.get('total_posts')),
                    candidates, ['Public YouTube API does not expose shares or private watch-time analytics.'], max_posts)
