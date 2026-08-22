/**
 * Mood-board domain types (plan §25).
 *
 * A mood board is a collection of reference cards grouped into ordered
 * sections. Cards reference assets by ID (never embedded base64 — plan
 * rule 26) and may carry provenance for external sources (plan rule 29).
 * Mood boards are optional and never require a screenplay (plan rule 1).
 */

export interface MoodBoardCard {
  id: string;
  /** Asset store reference (asset-sha256-...) — NEVER a base64 data URL in project state. */
  assetId?: string;
  /** Provenance/attribution for external references. */
  sourceUrl?: string;
  caption?: string;
  tags: string[];
  colorNotes?: string;
  lensNotes?: string;
  lightingNotes?: string;
  notes?: string;
  /** Optional links to production entities. */
  linkedEntity?: {
    kind: 'project' | 'character' | 'location' | 'script_scene' | 'setup' | 'shot';
    id: string;
  };
  sectionId: string;
  order: number;
}

export interface MoodBoardSection {
  id: string;
  title: string;
  order: number;
}

export interface MoodBoard {
  id: string;
  title: string;
  sections: MoodBoardSection[];
  cards: MoodBoardCard[];
  /**
   * Collage presentation shared by the panel preview and the printed/exported
   * collage document. Optional and absent-safe.
   */
  collage?: {
    columns?: number;
    gap?: number;
    background?: string;
    showCaptions?: boolean;
    title?: string;
  };
  /** Dominant color palette extracted from the board's images (hex strings). */
  palette?: string[];
}
