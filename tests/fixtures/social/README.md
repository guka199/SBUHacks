# Synthetic social fixtures

All names, IDs, captions, timestamps and numbers here are invented for offline
tests. No real creator was scraped; these are not successful live API captures.

Instagram and TikTok field shapes are based on the official actors' documented
output examples (reviewed October 24, 2026):

- https://apify.com/apify/instagram-scraper
- https://apify.com/clockworks/tiktok-scraper

TikTok covers nested and dotted author fields. Instagram uses profile details
with embedded `latestPosts`, and intentionally has no shares. An actual zero is
included in each fixture to distinguish it from unavailable metrics.

LinkedIn files are the explicit **adapter contract**, not a claim that all
PhantomBuster agents export these columns. Public API documentation specifies
launch/container/export transport, but not one stable schema for every LinkedIn
Phantom. The configured agent's export must be verified and mapped using the
server-only FIELD_MAP settings described in docs/social-data-integration.md.
Company employee counts and personal connection counts must never map to followers.

CSV and JSON exports are supported. No contact details or session data is needed
or retained by the normalizer. The mock HTTP tests wrap these fixtures in provider
launch/status/result responses; they never contact paid providers.
