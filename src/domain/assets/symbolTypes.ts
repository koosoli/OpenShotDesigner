export interface PlanPortAnchor {
  id: string;
  x: number;
  y: number;
  label?: string;
}

export interface PlanSymbolDefinition {
  id: string;
  /** e.g. 'architecture', 'audio', 'video', 'lighting', 'grip', 'staging', 'backline', 'broadcast', 'annotation' */
  category: string;
  subCategory: string;
  name: string;
  /** Search terms including synonyms. */
  keywords: string[];
  /** SVG path/markup fragment (viewBox 0 0 100 100). Keep top-down plan readable at 25% zoom. */
  svg: string;
  defaultWidth: number;
  defaultHeight: number;
  defaultPhysicalSize?: { widthMm?: number; depthMm?: number };
  rotationAnchor?: { x: number; y: number };
  portAnchors?: PlanPortAnchor[];
}
