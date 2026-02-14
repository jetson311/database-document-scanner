
import { VillageDocument, DocCategory, DocType, VoteRecord } from './types';

export const BOARD_MEMBERS: Record<DocCategory, string[]> = {
  [DocCategory.BOARD_OF_TRUSTEES]: ['Mayor Rossi', 'Baskin', 'Fitzpatrick', 'Kormos', 'VanHall'],
  [DocCategory.PLANNING_BOARD]: ['Chair Orzell', 'Sgambati', 'Hren', 'Robinson', 'Duffy'],
  [DocCategory.ZONING_BOARD]: ['Chairperson', 'Member A', 'Member B', 'Member C', 'Member D'],
  [DocCategory.NEWS_NOTICES]: [],
  [DocCategory.SPECIAL_PROJECTS]: []
};

export const MOCK_DOCUMENTS: VillageDocument[] = [
  // Board of Trustees 2025
  {
    id: 'bot-25-1',
    title: 'Board of Trustees Meeting Minutes - Jan 6, 2025',
    url: 'https://www.ballstonspa.gov/sites/g/files/vyhlif6186/f/minutes/bot_minutes_1.6.25_approved.pdf',
    date: '2025-01-06',
    category: DocCategory.BOARD_OF_TRUSTEES,
    type: DocType.MINUTES,
    summary: 'Approval of annual budget adjustment and DPW equipment lease.'
  },
  {
    id: 'bot-25-2',
    title: 'Board of Trustees Meeting Minutes - Jan 20, 2025',
    url: 'https://www.ballstonspa.gov/sites/g/files/vyhlif6186/f/minutes/bot_minutes_1.20.25_approved.pdf',
    date: '2025-01-20',
    category: DocCategory.BOARD_OF_TRUSTEES,
    type: DocType.MINUTES
  },
  {
    id: 'bot-26-1',
    title: 'Board of Trustees Meeting Minutes - Jan 5, 2026',
    url: 'https://www.ballstonspa.gov/node/516/minutes/2026',
    date: '2026-01-05',
    category: DocCategory.BOARD_OF_TRUSTEES,
    type: DocType.MINUTES,
    summary: 'Inaugural meeting of the 2026 legislative session.'
  },
  // Planning Board 2025
  {
    id: 'pb-25-1',
    title: 'Planning Board Meeting Minutes - Jan 8, 2025',
    url: 'https://www.ballstonspa.gov/sites/g/files/vyhlif6186/f/minutes/planning_board_minutes_1.8.25_approved.pdf',
    date: '2025-01-08',
    category: DocCategory.PLANNING_BOARD,
    type: DocType.MINUTES,
    summary: 'Public hearing for Tannery Project subdivision.'
  },
  {
    id: 'pb-25-2',
    title: 'Planning Board Meeting Minutes - Feb 12, 2025',
    url: 'https://www.ballstonspa.gov/sites/g/files/vyhlif6186/f/minutes/planning_board_minutes_2.12.25_-_approved.pdf',
    date: '2025-02-12',
    category: DocCategory.PLANNING_BOARD,
    type: DocType.MINUTES,
    summary: 'Site plan review for 123 Front Street redevelopment.'
  },
  {
    id: 'pb-26-1',
    title: 'Planning Board Meeting Minutes - Feb 11, 2026',
    url: 'https://www.ballstonspa.gov/node/526/minutes/2026',
    date: '2026-02-11',
    category: DocCategory.PLANNING_BOARD,
    type: DocType.MINUTES
  },
  // Zoning
  {
    id: 'zb-25-1',
    title: 'Zoning Board of Appeals Minutes - Jan 15, 2025',
    url: 'https://www.ballstonspa.gov/sites/g/files/vyhlif6186/f/minutes/zba_minutes_1.15.25.pdf',
    date: '2025-01-15',
    category: DocCategory.ZONING_BOARD,
    type: DocType.MINUTES
  },
  // Projects
  {
    id: 'proj-tannery-1',
    title: 'Tannery Project Phase II Site Plan',
    url: 'https://www.ballstonspa.gov/planning-board/pages/tannery-project',
    date: '2025-02-01',
    category: DocCategory.SPECIAL_PROJECTS,
    type: DocType.PROJECT_DOC,
    summary: 'Full engineering drawings for the Tannery site including drainage and parking.'
  },
  // News
  {
    id: 'news-1',
    title: 'Village News: Water Main Maintenance Schedule',
    url: 'https://www.ballstonspa.gov/news/1',
    date: '2025-02-10',
    category: DocCategory.NEWS_NOTICES,
    type: DocType.NEWS_POST
  }
];

export const MOCK_VOTES: VoteRecord[] = [
  {
    id: 'v1',
    motion: 'Approve 2025 Budget Adjustment',
    description: 'Reallocating $50,000 from general reserves to DPW for emergency pump repairs.',
    category: DocCategory.BOARD_OF_TRUSTEES,
    date: '2025-01-06',
    url: 'https://www.ballstonspa.gov/sites/g/files/vyhlif6186/f/minutes/bot_minutes_1.6.25_approved.pdf',
    proposer: 'Kormos',
    seconder: 'VanHall',
    result: 'Passed',
    votes: [
      { memberName: 'Mayor Rossi', status: 'Aye' },
      { memberName: 'Baskin', status: 'Aye' },
      { memberName: 'Fitzpatrick', status: 'Aye' },
      { memberName: 'Kormos', status: 'Aye' },
      { memberName: 'VanHall', status: 'Aye' },
    ]
  },
  {
    id: 'v2',
    motion: 'Authorize Tannery Project Site Clearing',
    description: 'Granting temporary access for site preparation pending final SEQRA review.',
    category: DocCategory.PLANNING_BOARD,
    date: '2025-01-08',
    url: 'https://www.ballstonspa.gov/sites/g/files/vyhlif6186/f/minutes/planning_board_minutes_1.8.25_approved.pdf',
    proposer: 'Sgambati',
    seconder: 'Hren',
    result: 'Passed',
    votes: [
      { memberName: 'Chair Orzell', status: 'Aye' },
      { memberName: 'Sgambati', status: 'Aye' },
      { memberName: 'Hren', status: 'Aye' },
      { memberName: 'Robinson', status: 'No' },
      { memberName: 'Duffy', status: 'Aye' },
    ]
  }
];

export const CATEGORY_COLORS: Record<DocCategory, string> = {
  [DocCategory.PLANNING_BOARD]: 'bg-blue-100 text-blue-700 border-blue-200',
  [DocCategory.ZONING_BOARD]: 'bg-purple-100 text-purple-700 border-purple-200',
  [DocCategory.BOARD_OF_TRUSTEES]: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  [DocCategory.NEWS_NOTICES]: 'bg-amber-100 text-amber-700 border-amber-200',
  [DocCategory.SPECIAL_PROJECTS]: 'bg-rose-100 text-rose-700 border-rose-200',
};
