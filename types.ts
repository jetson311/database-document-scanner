
export enum DocCategory {
  PLANNING_BOARD = 'Planning Board',
  ZONING_BOARD = 'Zoning Board',
  BOARD_OF_TRUSTEES = 'Board of Trustees',
  HISTORIC_DISTRICT_COMMISSION = 'Historic District Commission',
  BOA_STEERING_COMMITTEE = 'BOA Steering Committee',
  COMMITTEE_ON_THE_ARTS = 'Committee on the Arts',
  PARK_AND_TREE = 'Park and Tree',
  ETHICS_BOARD = 'Ethics Board',
  LIBRARY_BOARD = 'Library Board',
  REZONING_PUBLIC_FORUM = 'ReZoning Public Forum',
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
  /** PDF filename only (used as link text) */
  title: string;
  url: string;
  date: string;
  category: DocCategory;
  type: DocType;
  summary?: string;
  /** Meeting/event name from calendar (e.g. "Committee on the Arts Meeting") */
  event?: string;
  /** Event page on village site (from CSV page_url) */
  pageUrl?: string;
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
