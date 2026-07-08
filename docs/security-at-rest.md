# At-rest & in-transit hardening (self-hosted)

Managed Supabase gives you disk encryption, encrypted backups, and TLS for free. **Self-hosting
means you own them.** This runbook brings the self-hosted stack (Coolify + Supabase on the
Contabo VPS — see [Self-hosting](self-hosting.md)) up to that baseline, and gives you a script
to prove it's actually on.

## Threat statement

mcpfold stores **configuration with secret references only** — never resolved secret values (see
[Security](security.md)). Therefore:

> **A database or backup compromise exposes config metadata — server names, URLs, and
> `${scheme:path}` reference _paths_ — but never a secret value.** The blast radius of an
> at-rest breach is topology, not credentials.

This is a deliberate design property (the chosen server-side-at-rest model): the server can still
read config for the visual editor, directory, and audit-diff, so we harden the disk, backups, and
transport rather than end-to-end-encrypting the config.

## 1. Encrypt the Postgres data volume (LUKS)

Encrypt the block device that holds the Postgres data directory _before_ pointing Coolify's
Supabase volume at it, so nothing is ever written in the clear.

```bash
# On the VPS, for the volume backing Postgres (adjust the device):
cryptsetup luksFormat /dev/sdX                 # set a strong passphrase (store it in your vault)
cryptsetup luksOpen   /dev/sdX pgdata          # → /dev/mapper/pgdata
mkfs.ext4 /dev/mapper/pgdata
mkdir -p /mnt/pgdata && mount /dev/mapper/pgdata /mnt/pgdata
# Point the Coolify Supabase Postgres volume (docker-compose.coolify.yml) at /mnt/pgdata.
```

Unlocking at boot uses a keyfile from your secret store or a manual passphrase — never a keyfile
committed to the repo. Verify with `cryptsetup status pgdata`.

## 2. Encrypted, restore-tested backups

Use the shipped scripts (they stream through OpenSSL AES-256 so a plaintext dump never lands on
disk):

- `supabase/backup/encrypt-backup.sh` — `pg_dump` → gzip → AES-256 (PBKDF2). Writes only the
  encrypted artifact.
- `supabase/backup/restore-backup.sh` — decrypt → restore into a fresh database.
- `supabase/backup/test-backup.sh` — the round-trip proof (also run in CI): it asserts the
  ciphertext reveals no plaintext, the wrong key can't decrypt, and a restore recovers the data.

```bash
DATABASE_URL=postgres://... BACKUP_ENCRYPTION_KEY="$(cat /run/secrets/backup_key)" \
  supabase/backup/encrypt-backup.sh /backups/mcpfold-$(date +%F).sql.gz.enc
```

Operational notes: `BACKUP_ENCRYPTION_KEY` comes from Coolify env / Infisical (never committed);
store artifacts **off-box** (object storage); use a `pg_dump` that matches your server version;
and actually **test restores** on a schedule — an untested backup is a guess.

## 3. Enforce TLS + HSTS end to end

- **Edge / gateway** — terminate TLS at Coolify's reverse proxy (Traefik) with automatic
  certificates for `mcpfold.com` / `api.mcpfold.com`; redirect all HTTP to HTTPS.
- **API responses** — every edge response already sets `Strict-Transport-Security`
  (`max-age=63072000; includeSubDomains; preload`) plus `X-Content-Type-Options`,
  `X-Frame-Options`, and `Referrer-Policy` (see `services/edge/lib/http.ts`); this is asserted by
  a test in CI. Full web-app CSP is covered in a later story.
- **Postgres** — enable `ssl = on` so the edge/side service reaches the DB over TLS.

## 4. Verify it's actually on

Configuration ≠ enforcement. `supabase/verify-hardening.sh` checks the live stack and exits
nonzero on any gap:

```bash
API_URL=https://api.mcpfold.com \
PG_DATA_DEV=/dev/mapper/pgdata \
DATABASE_URL=postgres://... \
  supabase/verify-hardening.sh
```

It asserts: the endpoint is HTTPS, sends HSTS, and redirects HTTP→HTTPS; the Postgres data volume
is an active dm-crypt mapping; and Postgres has `ssl = on`. Each input is optional, so it's useful
for a quick header check or a full on-box audit.

### Checklist

- [ ] Postgres data volume is LUKS-encrypted (`cryptsetup status` shows it active).
- [ ] Backups run on a schedule, are AES-256 encrypted, stored off-box, and a restore has been
      tested this quarter.
- [ ] TLS terminates at the edge with valid certs; HTTP redirects to HTTPS; HSTS is served.
- [ ] Postgres `ssl = on`.
- [ ] `supabase/verify-hardening.sh` exits 0 against production.
