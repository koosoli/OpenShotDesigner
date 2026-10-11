import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MergeConflictDialog } from '../dashboard/MergeConflictDialog';
import type { MergeConflict } from '../../domain/sync/threeWayMerge';

const conflicts: MergeConflict[] = [
  { path: ['title'], label: 'title', base: 'A', mine: 'Mine title', theirs: 'Their title' },
  { path: ['director'], label: 'director', base: 'X', mine: 'Ana', theirs: 'Ben' },
];

describe('MergeConflictDialog', () => {
  afterEach(cleanup);

  it('keeps mine by default and reports the conflicts switched to theirs', () => {
    const onApply = vi.fn();
    render(<MergeConflictDialog fileName="film.osd" theirChanges={3} conflicts={conflicts} onApply={onApply} onCancel={() => {}} />);
    expect(screen.getByText(/3 of their changes merged in/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole('radio')[3]); // second conflict -> theirs
    fireEvent.click(screen.getByRole('button', { name: 'Merge and save' }));
    expect([...onApply.mock.calls[0][0]]).toEqual([1]);
  });

  it('offers all-theirs and cancel', () => {
    const onApply = vi.fn();
    const onCancel = vi.fn();
    render(<MergeConflictDialog fileName="film.osd" theirChanges={0} conflicts={conflicts} onApply={onApply} onCancel={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'All theirs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Merge and save' }));
    expect([...onApply.mock.calls[0][0]].sort()).toEqual([0, 1]);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
