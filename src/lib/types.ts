export interface ProcessNode {
  id: string;
  key: string;
  title: string;
  summary: string;
}

export interface TaskNode {
  id: string;
  key: string;
  title: string;
  description: string;
  children: TaskNode[];
}

export interface TipView {
  id: string;
  key: string;
  content: string;
  upvotes: number;
  downvotes: number;
  score: number;
  createdAt: string;
}

export type TipsByTask = Record<string, TipView[]>;
