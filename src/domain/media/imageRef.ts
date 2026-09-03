/**
 * Image references in project state (plan §5.2, rule 26).
 *
 * An image field holds one of two things:
 *
 *  - an **asset id** (`asset-sha256-…` or `asset-local-…`) — the bytes live
 *    once in the asset store and the project carries fifty bytes;
 *  - an **inline data URL** — the bytes live in the project itself.
 *
 * Only the first is acceptable for anything new. The second is what every
 * storyboard frame, background plate and AV row has held since the beginning,
 * and it is the reason a project with forty boarded shots grows to tens of
 * megabytes: project state is snapshotted for undo and copied wholesale on
 * duplicate, so those bytes are re-copied on every edit and every clone. The
 * floor-plan background plates are the worst of them — they were never
 * downscaled at all, so a phone photo goes in at full resolution.
 *
 * Both forms have to be readable, because existing projects are full of the
 * second and losing someone's storyboards to a cleanup is not an option. So
 * this module names the distinction, `projectMedia` moves the old form to the
 * new one when a project loads, and every reader goes through one resolver
 * that accepts either.
 *
 * Two asset id flavours, because honesty matters here: `asset-sha256-…` means
 * the suffix IS the SHA-256 of the bytes (deduplication, checksum
 * verification), while `asset-local-…` carries a random id minted where
 * `crypto.subtle` was unavailable (plain-http LAN, old browser) and makes no
 * hash claim. Readers must accept both; verifiers may only verify the first.
 */

/** Prefix for content-hashed asset ids. The suffix is the SHA-256 hex. */
export const ASSET_SHA_PREFIX = 'asset-sha256-';
/** Prefix for random asset ids minted without `crypto.subtle`. No hash claim. */
export const ASSET_LOCAL_PREFIX = 'asset-local-';

/** Ids minted by the content-addressed asset store, either flavour. */
export const ASSET_REF_PATTERN = /^asset-(sha256|local)-[A-Za-z0-9-]+$/;

/** True when the reference points at the asset store. */
export const isAssetRef = (ref: string | undefined): ref is string =>
  !!ref && ASSET_REF_PATTERN.test(ref);

/** True when the id carries a verifiable SHA-256 content hash. */
export const isSha256AssetRef = (ref: string | undefined): ref is string =>
  !!ref && ref.startsWith(ASSET_SHA_PREFIX) && ASSET_REF_PATTERN.test(ref);

/**
 * The content hash when the id carries one, otherwise undefined.
 * Use this instead of stripping the prefix by hand — `asset-local-…` ids
 * have no hash to strip.
 */
export const assetContentHash = (id: string): string | undefined =>
  isSha256AssetRef(id) ? id.slice(ASSET_SHA_PREFIX.length) : undefined;

/** True when the reference carries the bytes inline — the form being retired. */
export const isInlineImage = (ref: string | undefined): ref is string =>
  !!ref && ref.startsWith('data:');

/**
 * Roughly how many bytes an inline image costs the project.
 *
 * Base64 is 4 characters per 3 bytes, and the string is stored as characters,
 * so the project pays the encoded length — which is what this returns, since
 * the point is what the project weighs, not what the picture would.
 */
export const inlineImageBytes = (ref: string | undefined): number =>
  isInlineImage(ref) ? ref.length : 0;
