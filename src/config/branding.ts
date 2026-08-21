/**
 * Presentation-level branding configuration (plan §3.7).
 *
 * Branding is a display concern only: it must never leak into domain logic,
 * persisted schemas, or storage namespaces. Changing the product name later
 * means changing this file — nothing else.
 */

export interface BrandingConfig {
  productName: string;
  shortName: string;
  logoAsset?: string;
  website?: string;
}

export const BRANDING: BrandingConfig = {
  productName: 'Open Shot Designer',
  shortName: 'OSD',
  website: 'https://koosoli.github.io/OpenShotDesigner/',
};
