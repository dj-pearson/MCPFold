-- 0004_config_signature.sql (S9.2) — per-version integrity signature.
--
-- `push` stores an HMAC signature of the config (signed client-side with the user's per-user
-- key); `pull` returns it so the client can verify the stored version wasn't tampered with. The
-- signature is over the config's canonical form. Nullable: older/unsigned versions are allowed
-- (the client treats a missing signature as unverifiable, not invalid).
alter table public.configs add column if not exists signature text;
