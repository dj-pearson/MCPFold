/**
 * Types for the plain-JS build scripts imported by tests (S15.8). The scripts live in `scripts/`
 * (outside the tsconfig `include`), so tsc has no declaration for them; this ambient wildcard module
 * gives the test real types without pulling the .mjs into the compile.
 */
declare module '*/indexnow.mjs' {
  export function locsFromXml(xml: string): string[];
  export function collectUrls(dist: string): string[];
  export function buildPayload(
    urls: string[],
    key: string,
  ): { host: string; key: string; keyLocation: string; urlList: string[] };
}
