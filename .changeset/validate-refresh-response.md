---
'mcpfold': patch
---

Validate the cloud token-refresh response before persisting the session. `refresh` returned the JSON
body unchecked, so a malformed 200 (missing `access_token` or a non-finite `expires_in`) produced an
undefined access token — which serialized away and silently logged the user out on the next read — or
a `NaN` expiry that made every call re-refresh. `refresh` now validates the shape at the source (like
`pollDevice`): a non-empty `access_token`, a finite `expires_in`, and, if the server rotated it, a
non-empty `refresh_token` — surfacing a clear error instead of corrupting the stored session.
