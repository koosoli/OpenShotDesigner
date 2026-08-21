# Collaboration Boundaries — Four State Classes

> Design note per master plan §5.7 + rule 26 (`docs/IMPLEMENTATION_PLAN.md`). Every new piece of state must be assigned to exactly one of these classes. When a property could be either shared or personal (e.g. temporary layer visibility), make the choice explicit — never let it land in React state by accident.

## 1. Shared / persistent project data

Saved with the project, synchronized when collaboration exists, part of project history.

Concrete examples in this codebase:

- Camera positions, actor/prop/light placements, plan geometry and blocking paths
- Script text, script lines/marks, AV script rows, lined-script ranges
- Shots (incl. status, storyboard frame references), camera↔shot links
- Equipment list items, cable plan elements, DMX patch data, power planning data
- Production metadata (title, logo reference), comments (future)

## 2. Persistent local user/device preferences

Survive reloads for this user/device only; **never** collaborative production data.

Concrete examples:

- Theme selection (dark/light)
- `displaySettings` toggles the user prefers (grid visibility, measurement units display, etc.)
- Sidebar/panel widths, personal panel layout
- Recent/favorite assets, last-used tool preferences
- Possibly last personal viewport/zoom restore state

## 3. Ephemeral local session/UI state

Lives only for the current session; neither persisted project data nor presence.

Concrete examples:

- `selectedElementIds` (current selection on canvas)
- `activeRightTab` / which inspector tab is open
- Open/closed modal state, export dialog state, context-menu open state
- In-progress drag gesture, transient text selection
- Current playback cursor for blocking animation

## 4. Ephemeral collaborator presence (future)

Broadcast to collaborators, disappears on disconnect, **never** enters persisted project history (rule 33).

Examples: remote cursors, live viewport of other users, their current selection, "who is typing", current tool, follow-user state.

## Candidate collaboration document partitioning

Do not assume one giant CRDT document (rule 25). Candidate split, refined by the Batch 3A spike:

```text
project-meta        → metadata, workspace preset, permissions summary
people              → contacts/cast assignments
script              → screenplay text, scenes, characters, breakdown
locations           → location/venue entities (+ master plans later)
plans               → one document per PlanDocument/Setup (geometry, elements)
shots               → shots, cameras, storyboard ordering
schedule            → production days, schedule blocks
equipment           → equipment profiles/inventory, day packages
technical           → DMX patch, connections, cable routes, power topology
moodboard           → boards/cards (asset blobs stay OUT of all documents)
comments            → comment threads
```

Goals: moving a chair must not sync unrelated script/media state; departments can work concurrently; offline edits merge at useful boundaries; large assets stay outside CRDT/project JSON (referenced by asset ID only).

## Collaborative undo principle

Undo is scoped to the local user's own operations. Pressing Undo must never revert another collaborator's independent remote edit. This constrains how we structure operation history now — design undo entries as local-operation records, not whole-document snapshots.
