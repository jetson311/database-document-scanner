
export enum DocCategory {
  PLANNING_BOARD = 'Planning Board',
  ZONING_BOARD = 'Zoning Board',
  BOARD_OF_TRUSTEES = 'Board of Trustees',
  NEWS_NOTICES = 'News & Notices',
  SPECIAL_PROJECTS = 'Special Projects'
}

export enum DocType {
  AGENDA = 'Agenda',
  MINUTES = 'Minutes',
  PROJECT_DOC = 'Project Document',
  NEWS_POST = 'News Post'
}

export interface VillageDocument {
  id: string;
  title: string;
  url: string;
  date: string;
  category: DocCategory;
  type: DocType;
  summary?: string;
}

export type VoteStatus = 'Aye' | 'No' | 'Abstain' | 'Absent' | 'Not Found';

export interface MemberVote {
  memberName: string;
  status: VoteStatus;
}

export interface VoteRecord {
  id: string;
  motion: string;
  description: string;
  category: DocCategory;
  date: string;
  proposer: string;
  seconder: string;
  votes: MemberVote[];
  result: 'Passed' | 'Failed';
  url: string;
}

export interface BoardAnalysis {
  meetingDate: string;
  votes: VoteRecord[];
  summary: string;
}
