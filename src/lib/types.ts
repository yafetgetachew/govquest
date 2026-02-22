export interface ExternalLink {
  label: string;
  url: string;
}

export interface RequiredDocument {
  name: string;
  processKey?: string;
}

export type AttendanceMode = "in_person" | "online";
export type RequiredDocumentsMode = "one_of" | "all_of";

export interface ProcessNode {
  id: string;
  key: string;
  title: string;
  summary: string;
  explanation?: string;
  output?: string;
  location?: string;
  links: ExternalLink[];
  attendanceModes: AttendanceMode[];
  questStarts: number;
}

export interface TaskNode {
  id: string;
  key: string;
  title: string;
  description: string;
  location?: string;
  links: ExternalLink[];
  requiredDocuments: RequiredDocument[];
  requiredDocumentsMode: RequiredDocumentsMode;
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
  viewerVote: "upvote" | "downvote" | null;
}

export type TipsByTask = Record<string, TipView[]>;
