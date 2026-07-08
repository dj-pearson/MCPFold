import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { serialize, type Config } from '@mcpfold/core';
import type { KeychainBackend } from '../cloud/token-store.js';

/**
 * Version-integrity signing (S9.2). Each pushed config version is signed with a per-user HMAC
 * key held in the OS keychain; `pull` verifies the signature before trusting the payload. A
 * tampered version row in the cloud (someone editing the stored JSON) can't produce a valid
 * signature without the key, so the client rejects it. The signature is over the deterministic
 * serialization of the config, so formatting/key-order can't change it.
 *
 * Key distribution: the HMAC key is per-user and must be present on each machine that verifies
 * (copy it via `mcpfold`'s key export, or a future sync). Absent the key, pull warns rather
 * than hard-failing (documented), so a first-time machine isn't locked out.
 */

const KEY_ACCOUNT = 'signing-key';

/** Return the user's signing key, generating + storing one on first use. */
export async function getOrCreateSigningKey(backend: KeychainBackend): Promise<string> {
  const existing = await backend.get(KEY_ACCOUNT);
  if (existing) return existing;
  const key = randomBytes(32).toString('hex');
  await backend.set(KEY_ACCOUNT, key);
  return key;
}

/** Return the signing key if one exists, else null (no generation). */
export function loadSigningKey(backend: KeychainBackend): Promise<string | null> {
  return backend.get(KEY_ACCOUNT);
}

/** HMAC-SHA256 over the canonical serialization of the config. */
export function signConfig(config: Config, key: string): string {
  return createHmac('sha256', key).update(serialize(config)).digest('hex');
}

/** Constant-time verification that `signature` matches `config` under `key`. */
export function verifyConfig(config: Config, signature: string, key: string): boolean {
  const expected = signConfig(config, key);
  if (expected.length !== signature.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}
