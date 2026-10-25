"""Bounded provider transport. Never surface provider error bodies, URLs or credentials."""
import json
import httpx

from api.services.errors import ServiceError

MAX_BYTES = 8 * 1024 * 1024


class ProviderError(ServiceError):
    def __init__(self, message, *, retryable=False, retry_after=60, uncertain=False):
        super().__init__(message, 502)
        self.retryable, self.retry_after, self.uncertain = retryable, retry_after, uncertain


async def request(client, method, url, *, headers=None, params=None, body=None, raw=False):
    try:
        async with client.stream(method, url, headers=headers, params=params, json=body,
                                 timeout=30, follow_redirects=False) as response:
            if response.status_code == 429:
                delay = response.headers.get('Retry-After', '60')
                raise ProviderError('Provider rate limit; collection will retry later', retryable=True,
                                    retry_after=min(3600, max(15, int(delay))) if delay.isdigit() else 60)
            if response.status_code >= 500:
                raise ProviderError('Provider temporarily unavailable', retryable=method == 'GET', uncertain=method == 'POST')
            if not 200 <= response.status_code < 300:
                raise ProviderError('Provider rejected the request; check credentials, agent configuration and access')
            chunks, size = [], 0
            async for chunk in response.aiter_bytes():
                size += len(chunk)
                if size > MAX_BYTES:
                    raise ProviderError('Provider export exceeds the 8 MiB import limit', uncertain=method == 'POST')
                chunks.append(chunk)
            content = b''.join(chunks)
            if raw:
                return content
            try:
                return json.loads(content)
            except (ValueError, UnicodeError):
                raise ProviderError('Provider returned invalid JSON', uncertain=method == 'POST') from None
    except httpx.RequestError:
        raise ProviderError('Provider request could not be completed', retryable=method == 'GET', uncertain=method == 'POST') from None
