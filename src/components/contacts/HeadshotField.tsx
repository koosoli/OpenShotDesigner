import React, { useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import type { Person } from '../../domain/people';
import { forgetAssetUrl, storeImageAsset } from '../../utils/assetImages';
import { PersonAvatar } from './PersonAvatar';

interface HeadshotFieldProps {
  draft: Person;
  onChange: (person: Person) => void;
  isLight: boolean;
}

/**
 * Headshot upload for the person editor.
 *
 * The photo goes to the content-addressed asset store and only its id is kept
 * on the person (rule 26). It is downscaled to 512 px on the way in: a headshot
 * is shown at 32–64 px on screen and about 15 mm on paper, so anything larger
 * is bytes nobody ever sees — and unlike a floor-plan background, nobody zooms
 * into a contact sheet.
 *
 * Removing clears the id and forgets the cached object URL. The blob itself is
 * left in the store deliberately: it is content-addressed, so another person
 * may reference the same bytes, and orphan collection is a store-wide job
 * rather than something a form should do on a keystroke.
 */
export const HeadshotField: React.FC<HeadshotFieldProps> = ({ draft, onChange, isLight }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const { assetId } = await storeImageAsset(file, {
        maxSize: 512,
        quality: 0.85,
        source: `headshot:${file.name}`,
      });
      onChange({ ...draft, headshotAssetId: assetId });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That image could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (draft.headshotAssetId) forgetAssetUrl(draft.headshotAssetId);
    onChange({ ...draft, headshotAssetId: undefined });
  };

  const button = `text-[10px] font-semibold px-2 py-1 rounded-lg border ${
    isLight ? 'border-slate-300 hover:bg-slate-100' : 'border-slate-700 hover:bg-slate-800'
  }`;

  return (
    <div className="col-span-2 flex items-center gap-3">
      <PersonAvatar person={draft} size={56} />
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) void pick(file);
        }}
      />
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className={button}>
            <span className="flex items-center gap-1">
              <ImagePlus className="w-3 h-3" />
              {busy ? 'Adding…' : draft.headshotAssetId ? 'Replace headshot' : 'Add headshot'}
            </span>
          </button>
          {draft.headshotAssetId && (
            <button type="button" onClick={remove} className={button} title="Remove this headshot">
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
        <p className={`text-[9px] mt-1 ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
          {error ?? 'Shown on the crew list, contact sheet and call sheet.'}
        </p>
      </div>
    </div>
  );
};
