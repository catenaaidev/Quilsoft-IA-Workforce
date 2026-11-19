# BESA Central - extension Ia Workforce

This folder preserves the additive SSO bridge patch for source-control review.

The file `central_sso_routes_REFERENCE.txt` is a **reference**, not a runnable standalone Worker: its helper must be inserted before the `besaCoreWorker` definition, and the route guards inserted after the `HOST` comparison inside `besaCoreWorker.fetch`. The live BESA Worker already received the staged and uploaded code through Cloudflare Workers Version Upload and Deployment APIs; do not blindly upload this reference file as a replacement Worker.

Central D1 migration:

```sql
CREATE TABLE IF NOT EXISTS workforce_sso_tickets (
  token_hash TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  auth_session_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0,1))
);
CREATE INDEX IF NOT EXISTS idx_workforce_sso_expiry ON workforce_sso_tickets(expires_at);
```

Central catalog application `quilsoft-ia-workforce` uses a launch URL under the central SSO Worker `/apps/open/quilsoft-ia-workforce`. Authorizations are stored in existing `grants` and `application_roles`; initially two approved owner accounts were assigned. Do not assign everyone by default. Central prior version available to roll back to: `4a616ec8-93d9-440e-8633-172991c65bfe`.
