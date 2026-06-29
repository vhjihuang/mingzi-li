export interface Candidate {
  id: string;
  name: string;
  meaning: string;
  origin: string;
}

export interface RefinedCandidate extends Candidate {
  coreMeaning: string;
  fitReason: string;
  tip: string;
}

export type FeedbackType = 'like' | 'neutral' | 'dislike' | null;

export interface FeedbackRecord {
  type: FeedbackType;
  reason: string | null;
}

export type AppState = 
  | 'input' 
  | 'generating_batch1' 
  | 'batch1_ready' 
  | 'generating_shortlist' 
  | 'shortlist_ready';
