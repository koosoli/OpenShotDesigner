export type ReviewTargetKind = 'project' | 'shot' | 'scene' | 'person' | 'location' | 'production_day' | 'plan_element';

export interface ReviewCommentReply {
  id: string;
  body: string;
  createdAt: string;
}

export interface ReviewComment {
  id: string;
  targetKind: ReviewTargetKind;
  targetId: string;
  targetLabel: string;
  body: string;
  priority?: 'normal' | 'important' | 'urgent';
  createdAt: string;
  resolvedAt?: string;
  replies: ReviewCommentReply[];
}
