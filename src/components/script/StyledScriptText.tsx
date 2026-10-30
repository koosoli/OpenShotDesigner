import React from 'react';
import type { ScriptTextStyle } from '../../types';
import { styleRuns } from '../../domain/script/editing';

export function StyledScriptText({ text, styles }: { text: string; styles?: ScriptTextStyle[] }) {
  if (!styles?.length) return <>{text}</>;
  return <>{styleRuns(text, styles).map((r) => <span key={r.start} style={{ ...(r.bold ? { fontWeight: 700 } : {}), ...(r.italic ? { fontStyle: 'italic' } : {}), ...(r.underline ? { textDecoration: 'underline' } : {}) }}>{r.text}</span>)}</>;
}
