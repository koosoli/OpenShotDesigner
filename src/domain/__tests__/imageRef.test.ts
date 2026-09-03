import { describe, expect, it } from 'vitest';
import {
  ASSET_LOCAL_PREFIX,
  ASSET_REF_PATTERN,
  ASSET_SHA_PREFIX,
  assetContentHash,
  isAssetRef,
  isSha256AssetRef,
} from '../media/imageRef';

describe('asset id flavours', () => {
  it('accepts both hashed and local ids as asset references', () => {
    expect(isAssetRef('asset-sha256-abc123')).toBe(true);
    expect(isAssetRef('asset-local-550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(ASSET_REF_PATTERN.test('asset-sha256-abc123')).toBe(true);
    expect(ASSET_REF_PATTERN.test('asset-local-abc123')).toBe(true);
  });

  it('rejects inline images, empties and other schemes', () => {
    expect(isAssetRef('data:image/png;base64,AA==')).toBe(false);
    expect(isAssetRef(undefined)).toBe(false);
    expect(isAssetRef('')).toBe(false);
    expect(isAssetRef('asset-sha256-')).toBe(false);
    expect(isAssetRef('asset-md5-abc123')).toBe(false);
    expect(isAssetRef('asset-sha256-not-a-real-reference')).toBe(true);
  });

  it('only treats sha256 ids as verifiable', () => {
    expect(isSha256AssetRef('asset-sha256-abc123')).toBe(true);
    expect(isSha256AssetRef('asset-local-abc123')).toBe(false);
    expect(isSha256AssetRef(undefined)).toBe(false);
  });

  it('extracts the hash only where one is claimed', () => {
    expect(assetContentHash('asset-sha256-abc123')).toBe('abc123');
    expect(assetContentHash('asset-local-abc123')).toBeUndefined();
  });

  it('keeps the two prefixes distinct', () => {
    expect(ASSET_SHA_PREFIX).toBe('asset-sha256-');
    expect(ASSET_LOCAL_PREFIX).toBe('asset-local-');
  });
});
