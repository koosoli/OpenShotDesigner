import React from 'react';
import { useAssetImageSrc } from '../../utils/assetImages';

interface CallSheetMapProps {
  assetId: string;
  /** Which place this picture shows; also burned into the image itself. */
  locationName: string;
  address?: string;
}

/**
 * One captured location map on a printed sheet, captioned with its place.
 *
 * Renders nothing at all when the asset is missing — a project shared without
 * its assets, or one opened on another device before the package arrived. An
 * empty grey box on a call sheet reads as a printing fault; no box reads as
 * "this sheet has no map", which is the truth (rule 30).
 *
 * No attribution caption here on purpose: it is drawn into the image itself,
 * so it cannot be separated from the tiles it credits.
 */
export const CallSheetMap: React.FC<CallSheetMapProps> = ({ assetId, locationName, address }) => {
  const src = useAssetImageSrc(assetId);
  if (!src) return null;
  return (
    <figure style={{ margin: '2mm 0 0', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
      <figcaption style={{ fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.6px', margin: '0 0 1mm' }}>
        Map · {locationName}
        {address && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: '#475569' }}> — {address}</span>}
      </figcaption>
      <img
        src={src}
        alt={`Map of ${locationName}`}
        style={{ width: '100%', maxWidth: '120mm', borderRadius: '1mm', display: 'block' }}
      />
    </figure>
  );
};
