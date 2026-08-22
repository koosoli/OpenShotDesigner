import React from 'react';
import { useAssetImageSrc } from '../../utils/assetImages';

interface CallSheetMapProps {
  assetId: string;
}

/**
 * The captured location map on a printed sheet.
 *
 * Renders nothing at all when the asset is missing — a project shared without
 * its assets, or one opened on another device before the package arrived. An
 * empty grey box on a call sheet reads as a printing fault; no box reads as
 * "this sheet has no map", which is the truth (rule 30).
 *
 * No attribution caption here on purpose: it is drawn into the image itself,
 * so it cannot be separated from the tiles it credits.
 */
export const CallSheetMap: React.FC<CallSheetMapProps> = ({ assetId }) => {
  const src = useAssetImageSrc(assetId);
  if (!src) return null;
  return (
    <img
      src={src}
      alt="Location map"
      style={{ marginTop: '2mm', width: '100%', maxWidth: '120mm', borderRadius: '1mm' }}
    />
  );
};
