/** OS detection for the install page (S13.3). A `?os=` query param overrides detection (handy for
 * sharing a platform-specific link and for deterministic tests). */
export type OS = 'mac' | 'windows' | 'linux';

export function detectOS(search = typeof location !== 'undefined' ? location.search : ''): OS {
  const override = new URLSearchParams(search).get('os');
  if (override === 'mac' || override === 'windows' || override === 'linux') return override;

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/Mac|iPhone|iPad/i.test(ua)) return 'mac';
  if (/Win/i.test(ua)) return 'windows';
  return 'linux';
}

export const OS_LABEL: Record<OS, string> = {
  mac: 'macOS',
  windows: 'Windows',
  linux: 'Linux',
};
