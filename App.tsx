
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MOCK_DOCUMENTS } from './constants';
import { DocCategory, VillageDocument, DocType } from './types';
import type { MeetingMinutes } from './types/meeting';
import { getMeetingDisplayDate } from './types/meeting';
import { ChatPanel } from './components/ChatPanel';
import { MeetingDetail } from './components/MeetingDetail';
import { highlightSearchPhrase } from './utils/highlight';

/** Format ISO date (YYYY-MM-DD) as local calendar date; avoids UTC-midnight showing previous day in western timezones. */
function formatMeetingDate(iso: string): string {
  if (!iso || !iso.trim()) return '';
  const s = iso.trim();
  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, y, m, d] = match;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    }
  }
  try {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return s;
  }
}

/** Parse CSV line and return pdf_url (last URL in line). */
function parseCsvLineForPdfUrl(line: string): string | null {
  const urls = line.match(/https:\/\/[^\s,]+/g);
  if (!urls || urls.length === 0) return null;
  return urls[urls.length - 1].trim();
}

/** Build map: meeting filename -> pdf_url from bspa-event-pdfs-2025-2026.csv */
async function loadMeetingPdfUrlMap(): Promise<Record<string, string>> {
  try {
    const res = await fetch('/bspa-event-pdfs-2025-2026.csv');
    if (!res.ok) return {};
    const text = await res.text();
    const lines = text.split('\n').filter((l) => l.trim());
    const map: Record<string, string> = {};
    for (let i = 1; i < lines.length; i++) {
      const pdfUrl = parseCsvLineForPdfUrl(lines[i]);
      if (!pdfUrl) continue;
      const filename = pdfUrl.split('/').pop() || '';
      if (!filename) continue;
      map[filename] = pdfUrl;
      const withoutZero = filename.replace(/_0\.pdf$/i, '.pdf');
      if (withoutZero !== filename) map[withoutZero] = pdfUrl;
    }
    return map;
  } catch {
    return {};
  }
}

/** Load documents from CSV-generated JSON; fallback to mock data */
async function loadDocuments(): Promise<VillageDocument[]> {
  try {
    const res = await fetch('/documents.json');
    if (!res.ok) return MOCK_DOCUMENTS;
    const raw = await res.json();
    return (raw || []).map((d: Record<string, unknown>) => ({
      id: String(d.id),
      title: String(d.title),
      url: String(d.url),
      date: String(d.date),
      category: (d.category as DocCategory) ?? DocCategory.SPECIAL_PROJECTS,
      type: (d.type as DocType) ?? DocType.PROJECT_DOC,
      summary: d.summary as string | undefined,
      event: d.event as string | undefined,
      pageUrl: d.pageUrl as string | undefined,
    }));
  } catch {
    return MOCK_DOCUMENTS;
  }
}

type TabView = 'Documents' | 'Voting History';
type ViewMode = 'category' | 'type' | 'date';

const SparkleIcon = ({ className = "w-4 h-4", strokeWidth = 2.5 }: { className?: string; strokeWidth?: number }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" />
  </svg>
);

const CloseIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const ExternalLinkIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor">
    <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 372-372H560v-80h240v240h-80v-144L388-332Z"/>
  </svg>
);

const ChevronDownIcon = ({ className = "" }) => (
  <svg className={`${className} dropdown-arrow`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M19 9l-7 7-7-7" />
  </svg>
);

const MultiSelectDropdown: React.FC<{
  label: string;
  options: string[];
  selected: string[];
  onToggle: (item: string) => void;
  allOptionLabel?: string;
}> = ({ label, options, selected, onToggle, allOptionLabel = "All" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const buttonText = useMemo(() => {
    const isAll = selected.includes("All");
    if (isAll) return "All";
    if (selected.length === 0) return "Select";
    return `Selected (${selected.length})`;
  }, [selected]);

  return (
    <div className="dropdown-wrap dropdown-wrap--meeting" ref={dropdownRef}>
      <label className="dropdown-label">{label}</label>
      <div className="relative flex-1 min-w-0">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="dropdown-trigger"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className="dropdown-trigger-text">{buttonText}</span>
          <ChevronDownIcon className={isOpen ? 'dropdown-chevron dropdown-chevron--open' : 'dropdown-chevron'} />
        </button>
        {isOpen && (
          <div className="dropdown-panel dropdown-panel--meeting">
            <div className="dropdown-panel-inner">
              <label className="dropdown-option">
                <input
                  type="checkbox"
                  checked={selected.includes("All")}
                  onChange={() => onToggle("All")}
                  className="dropdown-checkbox"
                />
                <span>{allOptionLabel}</span>
              </label>
              <div className="dropdown-divider" />
              {options.map(opt => (
                <label key={opt} className="dropdown-option">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => onToggle(opt)}
                    className="dropdown-checkbox"
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

type CategoryTypeGroup = { groupLabel: string; groupValue: string; children: { label: string; value: string }[] };

const HierarchicalMultiSelect: React.FC<{
  label: string;
  groups: CategoryTypeGroup[];
  selected: string[];
  onToggle: (value: string) => void;
}> = ({ label, groups, selected, onToggle }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const buttonText = useMemo(() => {
    if (selected.includes("All")) return "All";
    if (selected.length === 0) return "Select";
    return `Selected (${selected.length})`;
  }, [selected]);

  return (
    <div className="dropdown-wrap dropdown-wrap--meeting" ref={dropdownRef}>
      <label className="dropdown-label">{label}</label>
      <div className="relative flex-1 min-w-0">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="dropdown-trigger"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className="dropdown-trigger-text">{buttonText}</span>
          <ChevronDownIcon className={isOpen ? 'dropdown-chevron dropdown-chevron--open' : 'dropdown-chevron'} />
        </button>
        {isOpen && (
          <div className="dropdown-panel dropdown-panel--meeting">
            <div className="dropdown-panel-inner dropdown-panel-inner--tall">
              <label className="dropdown-option">
                <input
                  type="checkbox"
                  checked={selected.includes("All")}
                  onChange={() => onToggle("All")}
                  className="dropdown-checkbox"
                />
                <span>All</span>
              </label>
              <div className="dropdown-divider dropdown-divider--dark" />
              {groups.map((group) => (
                <div key={group.groupValue}>
                  <label className="dropdown-option dropdown-option--group">
                    <input
                      type="checkbox"
                      checked={selected.includes('All') || selected.includes(group.groupValue)}
                      onChange={() => onToggle(group.groupValue)}
                      className="dropdown-checkbox"
                    />
                    <span>{group.groupLabel}</span>
                  </label>
                  {group.children.map((child) => (
                    <label key={child.value} className="dropdown-option dropdown-option--child">
                      <input
                        type="checkbox"
                        checked={selected.includes('All') || selected.includes(child.value)}
                        onChange={() => onToggle(child.value)}
                        className="dropdown-checkbox"
                      />
                      <span>{child.label}</span>
                    </label>
                  ))}
                  <div className="dropdown-group-divider" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/** Multi-select for meeting type – same selection outline as Date/Attributes (All + checkboxes). */
const MeetingTypeMultiSelect: React.FC<{
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}> = ({ label, options, selected, onToggle }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const buttonText = useMemo(() => {
    if (selected.includes('All')) return 'All';
    if (selected.length === 0) return 'Select';
    return `Selected (${selected.length})`;
  }, [selected]);

  const typeOptions = useMemo(() => options.filter((o) => o !== 'All'), [options]);

  return (
    <div className="dropdown-wrap dropdown-wrap--meeting" ref={dropdownRef}>
      <label className="dropdown-label">{label}</label>
      <div className="relative flex-1 min-w-0">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="dropdown-trigger"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className="dropdown-trigger-text">{buttonText}</span>
          <ChevronDownIcon className={isOpen ? 'dropdown-chevron dropdown-chevron--open' : 'dropdown-chevron'} />
        </button>
        {isOpen && (
          <div className="dropdown-panel dropdown-panel--meeting">
            <div className="dropdown-panel-inner">
              <label className="dropdown-option">
                <input
                  type="checkbox"
                  checked={selected.includes('All')}
                  onChange={() => onToggle('All')}
                  className="dropdown-checkbox"
                />
                <span>All</span>
              </label>
              <div className="dropdown-divider" />
              {typeOptions.map((opt) => (
                <label key={opt} className="dropdown-option">
                  <input
                    type="checkbox"
                    checked={selected.includes('All') || selected.includes(opt)}
                    onChange={() => onToggle(opt)}
                    className="dropdown-checkbox"
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const MeetingMultiSelect: React.FC<{
  label: string;
  meetingList: MeetingMinutes[];
  selected: string[];
  onToggle: (value: string) => void;
}> = ({ label, meetingList, selected, onToggle }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const buttonText = useMemo(() => {
    if (selected.includes('All')) return 'All';
    if (selected.length === 0) return 'Select';
    return `Selected (${selected.length})`;
  }, [selected]);

  return (
    <div className="dropdown-wrap dropdown-wrap--meeting" ref={dropdownRef}>
      <label className="dropdown-label">{label}</label>
      <div className="relative flex-1 min-w-0">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="dropdown-trigger"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
        >
          <span className="dropdown-trigger-text">{buttonText}</span>
          <ChevronDownIcon className={isOpen ? 'dropdown-chevron dropdown-chevron--open' : 'dropdown-chevron'} />
        </button>
        {isOpen && (
          <div className="dropdown-panel dropdown-panel--meeting">
            <div className="dropdown-panel-inner">
              <label className="dropdown-option">
                <input
                  type="checkbox"
                  checked={selected.includes('All')}
                  onChange={() => onToggle('All')}
                  className="dropdown-checkbox"
                />
                <span>All</span>
              </label>
              <div className="dropdown-divider" />
              {meetingList.map((m) => {
                const displayDate = getMeetingDisplayDate(m);
                const dateStr = displayDate ? formatMeetingDate(displayDate) : m.filename;
                const subtype = m.meeting_metadata?.meeting_type;
                return (
                  <label key={m.filename} className="dropdown-option dropdown-option--meeting-date">
                    <input
                      type="checkbox"
                      checked={selected.includes('All') || selected.includes(m.filename)}
                      onChange={() => onToggle(m.filename)}
                      className="dropdown-checkbox"
                    />
                    <span className="dropdown-option-meeting-label">
                      <span className="dropdown-option-meeting-date">{dateStr}</span>
                      {subtype && <span className="dropdown-option-meeting-subtype">{subtype}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<TabView>('Voting History');
  const [viewMode, setViewMode] = useState<ViewMode>('category');
  const [searchQuery, setSearchQuery] = useState('');
  const [aiQuery, setAiQuery] = useState('');
  const [documents, setDocuments] = useState<VillageDocument[]>(MOCK_DOCUMENTS);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);

  const [selectedYears, setSelectedYears] = useState<string[]>(['All']);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['All']);

  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [externalAiMessage, setExternalAiMessage] = useState<string | null>(null);
  const [meetingManifest, setMeetingManifest] = useState<string[]>([]);
  const [meetingList, setMeetingList] = useState<MeetingMinutes[]>([]);
  const [meetingsLoading, setMeetingsLoading] = useState(true);
  const [meetingPdfUrlMap, setMeetingPdfUrlMap] = useState<Record<string, string>>({});
  const [selectedMeetingTypes, setSelectedMeetingTypes] = useState<string[]>(['All']);
  const [selectedMeetings, setSelectedMeetings] = useState<string[]>(['All']);
  const [selectedMeetingAttributes, setSelectedMeetingAttributes] = useState<string[]>(['All']);
  const [meetingSearchQuery, setMeetingSearchQuery] = useState('');

  const appMainRef = useRef<HTMLElement | null>(null);

  /** Toggle .meeting-table-sticky-header--stuck and .meeting-page-header--stuck when in sticky position. */
  useEffect(() => {
    const el = appMainRef.current;
    if (!el) return;
    const stickTopPx = 64 + 3 + 84; // 4rem + 3px + 5.25rem
    const updateStuck = () => {
      const containerTop = el.getBoundingClientRect().top;
      const thresholdFromContainer = containerTop + stickTopPx + 2;
      const thresholdFromViewport = stickTopPx + 2;
      el.querySelectorAll<HTMLElement>('.meeting-table-sticky-header').forEach((header) => {
        const headerTop = header.getBoundingClientRect().top;
        const stuck = headerTop <= thresholdFromContainer || headerTop <= thresholdFromViewport;
        header.classList.toggle('meeting-table-sticky-header--stuck', stuck);
      });
    };
    const runAfterPaint = () => requestAnimationFrame(updateStuck);
    runAfterPaint();
    setTimeout(updateStuck, 50);
    setTimeout(updateStuck, 200);
    el.addEventListener('scroll', updateStuck, { passive: true });
    window.addEventListener('scroll', updateStuck, { passive: true });
    return () => {
      el.removeEventListener('scroll', updateStuck);
      window.removeEventListener('scroll', updateStuck);
    };
  }, [currentTab, meetingList.length, selectedMeetings]);

  useEffect(() => {
    loadDocuments().then((list) => {
      setDocuments(list);
      setDocumentsLoaded(true);
    });
  }, []);

  useEffect(() => {
    loadMeetingPdfUrlMap().then(setMeetingPdfUrlMap);
  }, []);

  useEffect(() => {
    if (!isChatExpanded) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsChatExpanded(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isChatExpanded]);

  useEffect(() => {
    setMeetingsLoading(true);
    fetch('/meeting_minutes/manifest.json')
      .then((res) => (res.ok ? res.json() : null))
      .then((list: string[] | null) => {
        if (!Array.isArray(list) || list.length === 0) {
          setMeetingManifest([]);
          setMeetingList([]);
          return null;
        }
        setMeetingManifest(list);
        return Promise.allSettled(
          list.map((filename) =>
            fetch(`/meeting_minutes/json/${filename}`).then((r) => (r.ok ? r.json() : null))
          )
        );
      })
      .then((settled) => {
        if (!settled || !Array.isArray(settled)) return;
        const loaded = settled
          .filter((s): s is PromiseFulfilledResult<MeetingMinutes | null> => s.status === 'fulfilled')
          .map((s) => s.value)
          .filter((m): m is MeetingMinutes => m != null && typeof m.filename === 'string');
        const byDate = [...loaded].sort((a, b) => {
          const dA = a.meeting_metadata?.date ?? '';
          const dB = b.meeting_metadata?.date ?? '';
          return dB.localeCompare(dA);
        });
        setMeetingList(byDate);
        if (byDate.length > 0) setSelectedMeetings((prev) => (prev.length === 0 ? ['All'] : prev));
      })
      .catch(() => {})
      .finally(() => setMeetingsLoading(false));
  }, []);

  const handleAiAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim()) return;
    setExternalAiMessage(aiQuery);
    setAiQuery('');
    setIsChatExpanded(true);
  };

  const yearOptions = useMemo(() => {
    const years = new Set(documents.map((d) => d.date.slice(0, 4)));
    return Array.from(years).sort();
  }, [documents]);

  const meetingTypeOptions = useMemo(() => ['All', 'Board of Trustees'], []);

  const meetingListByType = useMemo(() => {
    if (selectedMeetingTypes.includes('All')) return meetingList;
    if (selectedMeetingTypes.includes('Board of Trustees')) return meetingList;
    return meetingList.filter((m) => selectedMeetingTypes.includes(m.meeting_metadata?.meeting_type ?? ''));
  }, [meetingList, selectedMeetingTypes]);

  /** Collect unique officials, board speakers, and public names; dedupe by normalized form so each name appears once. */
  const meetingAttributeNames = useMemo(() => {
    const officialsByNorm = new Map<string, string>();
    const boardByNorm = new Map<string, string>();
    const publicByNorm = new Map<string, string>();
    const add = (map: Map<string, string>, name: string) => {
      const n = name.trim();
      if (!n) return;
      const key = n.toLowerCase();
      if (!map.has(key)) map.set(key, n);
    };
    meetingListByType.forEach((m) => {
      (m.votes || []).forEach((v) => {
        Object.keys(v.vote_breakdown || {}).forEach((name) => add(officialsByNorm, name));
        (v.discussion || []).forEach((d) => { if (d.speaker) add(boardByNorm, d.speaker); });
      });
      const announcements = (m as { mayor_announcements?: { speaker?: string }[] }).mayor_announcements ?? [];
      announcements.forEach((a) => { if (a.speaker) add(boardByNorm, a.speaker); });
      (m.public_comments ?? []).forEach((pc: { board_response?: { responder?: string } }) => {
        if (pc.board_response?.responder) add(boardByNorm, pc.board_response.responder);
      });
      (m.public_comments || []).forEach((c) => { if (c.speaker?.name) add(publicByNorm, c.speaker.name); });
    });
    return {
      officials: Array.from(officialsByNorm.values()).sort(),
      boardSpeakers: Array.from(boardByNorm.values()).sort(),
      publicNames: Array.from(publicByNorm.values()).sort(),
    };
  }, [meetingListByType]);

  /** Unique vote result values from data (e.g. ALL AYES, MOTION PASSED, NO ACTION TAKEN), uppercase, sorted. */
  const meetingVoteResultOptions = useMemo(() => {
    const set = new Set<string>();
    meetingListByType.forEach((m) => {
      (m.votes || []).forEach((v) => {
        const r = (v.vote_result ?? '').trim().toUpperCase();
        if (r) set.add(r);
      });
    });
    return Array.from(set).sort();
  }, [meetingListByType]);

  /** Attributes hierarchy: Motions (Title), Members (officials), Votes (specific results only), Board comments (names), Public comments (names). */
  const meetingAttributesHierarchy = useMemo<CategoryTypeGroup[]>(() => {
    const resolutionChildren: { label: string; value: string }[] = [
      { label: 'Title', value: 'resolutions|title' },
    ];
    const membersChildren: { label: string; value: string }[] = meetingAttributeNames.officials.map((name) => ({
      label: name,
      value: `resolutions|votes-member|${name}`,
    }));
    const votesChildren: { label: string; value: string }[] = meetingVoteResultOptions.map((result) => ({
      label: result,
      value: `resolutions|votes-type|${result}`,
    }));
    const boardCommentsChildren: { label: string; value: string }[] = meetingAttributeNames.boardSpeakers.map(
      (name) => ({ label: name, value: `comments|board|${name}` })
    );
    const publicCommentsChildren: { label: string; value: string }[] = meetingAttributeNames.publicNames.map(
      (name) => ({ label: name, value: `comments|public|${name}` })
    );
    return [
      { groupLabel: 'Motions', groupValue: 'resolutions', children: resolutionChildren },
      { groupLabel: 'Members', groupValue: 'resolutions|votes-member', children: membersChildren },
      { groupLabel: 'Votes', groupValue: 'resolutions|votes-type', children: votesChildren },
      { groupLabel: 'Board comments', groupValue: 'comments|board', children: boardCommentsChildren },
      { groupLabel: 'Public comments', groupValue: 'comments|public', children: publicCommentsChildren },
    ];
  }, [meetingAttributeNames, meetingVoteResultOptions]);

  /** Flat list of all meeting attribute values (for "All" + deselect-one behavior). */
  const meetingAttributeAllValues = useMemo(
    () => meetingAttributesHierarchy.flatMap((g) => g.children.map((c) => c.value)),
    [meetingAttributesHierarchy]
  );

  const categoryTypeHierarchy = useMemo<CategoryTypeGroup[]>(() => {
    const order = [
      DocCategory.BOARD_OF_TRUSTEES,
      DocCategory.PLANNING_BOARD,
      DocCategory.ZONING_BOARD,
      DocCategory.HISTORIC_DISTRICT_COMMISSION,
      DocCategory.BOA_STEERING_COMMITTEE,
      DocCategory.COMMITTEE_ON_THE_ARTS,
      DocCategory.PARK_AND_TREE,
      DocCategory.ETHICS_BOARD,
      DocCategory.LIBRARY_BOARD,
      DocCategory.REZONING_PUBLIC_FORUM,
      DocCategory.NEWS_NOTICES,
      DocCategory.SPECIAL_PROJECTS,
    ];
    const typeLabels: Record<DocType, string> = {
      [DocType.MINUTES]: 'Meeting Minutes',
      [DocType.AGENDA]: 'Agenda',
      [DocType.PROJECT_DOC]: 'Project Document',
      [DocType.NEWS_POST]: 'News Post',
    };
    const seen = new Map<string, Set<string>>();
    documents.forEach((d) => {
      if (!seen.has(d.category)) seen.set(d.category, new Set());
      seen.get(d.category)!.add(d.type);
    });
    return order.filter((cat) => seen.has(cat)).map((category) => ({
      groupLabel: category,
      groupValue: category,
      children: (Object.values(DocType) as DocType[])
        .filter((t) => seen.get(category)?.has(t))
        .map((t) => ({ label: typeLabels[t], value: `${category}|${t}` })),
    }));
  }, [documents]);

  const filteredDocs = useMemo<VillageDocument[]>(() => {
    return documents.filter(doc => {
      const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           (doc.event?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false) ||
                           (doc.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);

      const docYear = doc.date.split('-')[0];
      const matchesYear = selectedYears.includes('All') || selectedYears.includes(docYear);
      const exactPair = `${doc.category}|${doc.type}`;
      const hasCategoryOnly = selectedCategories.includes(doc.category);
      const hasAnySubTypeForCategory = selectedCategories.some((s) => s.startsWith(doc.category + '|'));
      const matchesCategory =
        selectedCategories.includes('All') ||
        selectedCategories.includes(exactPair) ||
        (hasCategoryOnly && !hasAnySubTypeForCategory);

      return matchesSearch && matchesYear && matchesCategory;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [documents, searchQuery, selectedYears, selectedCategories]);

  const groupedData = useMemo<Record<string, VillageDocument[]>>(() => {
    const groups: Record<string, VillageDocument[]> = {};
    filteredDocs.forEach(doc => {
      let key = 'Archive';
      if (viewMode === 'category') key = doc.event || doc.category;
      else if (viewMode === 'type') key = doc.type;
      else if (viewMode === 'date') {
        key = new Date(doc.date).toLocaleString('default', { month: 'long', year: 'numeric' });
      }
      if (!groups[key]) groups[key] = [];
      groups[key].push(doc);
    });
    return groups;
  }, [filteredDocs, viewMode]);

  const handleToggleFilter = (item: string, current: string[], setter: (val: string[]) => void) => {
    if (item === 'All') {
      setter(['All']);
      return;
    }
    let next = current.includes(item) ? current.filter(x => x !== item) : [...current, item];
    next = next.filter(x => x !== 'All');
    if (next.length === 0) next = ['All'];
    setter(next);
  };

  /** True if meeting filename, date, resolutions, comments, or discussion match the search query. */
  const meetingMatchesSearch = (m: MeetingMinutes, q: string): boolean => {
    const trimmed = q.trim();
    if (!trimmed) return true;
    const lower = trimmed.toLowerCase();
    const parts: string[] = [
      m.filename,
      m.meeting_metadata?.date,
      m.meeting_metadata?.meeting_type,
      m.meeting_summary,
    ].filter(Boolean) as string[];
    (m.votes || []).forEach((v) => {
      parts.push(v.motion_description ?? '', v.context ?? '', v.addendum ?? '', v.mover ?? '', v.seconder ?? '');
      (v.discussion || []).forEach((d) => {
        parts.push(d.speaker, d.statement);
      });
    });
    (m.public_comments || []).forEach((c) => {
      parts.push(c.speaker?.name ?? '', c.comment_text ?? '', c.summary ?? '');
    });
    return parts.join(' ').toLowerCase().includes(lower);
  };

  const handleMeetingFilterToggle = (item: string, current: string[], setter: (val: string[]) => void, allValues?: string[]) => {
    if (item === 'All') {
      setter(current.includes('All') ? [] : ['All']);
      return;
    }
    if (current.includes('All') && allValues && allValues.length > 0) {
      setter(allValues.filter((v) => v !== item));
      return;
    }
    let next = current.includes(item) ? current.filter((x) => x !== item) : [...current, item];
    next = next.filter((x) => x !== 'All');
    if (next.length === 0) next = ['All'];
    setter(next);
  };

  return (
    <div className="page-root">
      <div className="layout-main-wrap">
        <header className="app-header">
          <div className="app-header-inner">
            <div className="app-header-brand">
              <div className="app-header-title-row">
                <SparkleIcon className="app-header-title-icon" strokeWidth={2.5} />
                <h1 className="app-header-title">VILLAGE OF BSPA CIVIC ARCHIVE</h1>
              </div>
              <p className="app-header-subtitle">*Resident created, not official village tool</p>
            </div>
            <div className="tabs-pill-group">
              {(['Voting History', 'Documents'] as TabView[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setCurrentTab(tab)}
                  className={currentTab === tab ? 'tabs-pill tabs-pill--active' : 'tabs-pill'}
                >
                  {tab === 'Voting History' ? 'Meetings' : tab}
                </button>
              ))}
            </div>
          </div>
        </header>

        <button
          type="button"
          onClick={() => setIsChatExpanded((open) => !open)}
          className="ai-fab ai-fab--default"
          aria-label={isChatExpanded ? 'Close AI assistant' : 'Open AI assistant'}
        >
          {isChatExpanded ? <CloseIcon /> : <SparkleIcon strokeWidth={1.25} />}
        </button>

        {currentTab === 'Documents' && (
          <div className="filters-bar">
            <div className="filters-bar-inner filters-bar-inner--documents">
              <div className="filters-row">
                <div className="shrink-0">
                  <HierarchicalMultiSelect
                    label="TYPE"
                    groups={categoryTypeHierarchy}
                    selected={selectedCategories}
                    onToggle={(v) => handleToggleFilter(v, selectedCategories, setSelectedCategories)}
                  />
                </div>
                <div className="shrink-0">
                  <MultiSelectDropdown
                    label="YEAR"
                    options={yearOptions.length ? yearOptions : ['2025', '2026']}
                    selected={selectedYears}
                    onToggle={(y) => handleToggleFilter(y, selectedYears, setSelectedYears)}
                  />
                </div>
                <div className="layout-toggle-wrap">
                  <label className="dropdown-label">LAYOUT</label>
                  <div className="layout-toggle-group">
                    {(['category', 'type', 'date'] as ViewMode[]).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setViewMode(mode)}
                        className={viewMode === mode ? 'layout-toggle-btn layout-toggle-btn--active' : 'layout-toggle-btn'}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="documents-search-wrap">
                  <label className="dropdown-label" htmlFor="documents-search-input">Search</label>
                  <div className="input-search-wrap documents-search-input-wrap input-search-wrap--with-clear">
                    <svg className="input-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      id="documents-search-input"
                      type="search"
                      placeholder="Search by keyword..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="input-search"
                      aria-label="Search documents"
                    />
                    {searchQuery.trim() && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="search-clear-btn"
                        aria-label="Clear search"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <main className="app-main" ref={appMainRef}>
          <div className="layout-content">
            {currentTab === 'Voting History' ? (
              <div className="meetings-content">
                <div className="meeting-filters-bar">
                  <div className="meeting-filters-bar-inner">
                    <MeetingTypeMultiSelect
                      label="Type"
                      options={meetingTypeOptions}
                      selected={selectedMeetingTypes}
                      onToggle={(v) => handleMeetingFilterToggle(v, selectedMeetingTypes, setSelectedMeetingTypes)}
                    />
                    <MeetingMultiSelect
                      label="Date"
                      meetingList={meetingListByType}
                      selected={selectedMeetings}
                      onToggle={(v) => handleMeetingFilterToggle(v, selectedMeetings, setSelectedMeetings)}
                    />
                    <HierarchicalMultiSelect
                      label="Attributes"
                      groups={meetingAttributesHierarchy}
                      selected={selectedMeetingAttributes}
                      onToggle={(v) => handleMeetingFilterToggle(v, selectedMeetingAttributes, setSelectedMeetingAttributes, meetingAttributeAllValues)}
                    />
                    <div className="meeting-search-wrap">
                      <label className="dropdown-label" htmlFor="meeting-search-input">Search</label>
                      <div className="input-search-wrap meeting-search-input-wrap input-search-wrap--with-clear">
                        <svg className="input-search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <input
                          id="meeting-search-input"
                          type="search"
                          placeholder="Search meetings..."
                          value={meetingSearchQuery}
                          onChange={(e) => setMeetingSearchQuery(e.target.value)}
                          className="input-search"
                          aria-label="Search meeting content"
                        />
                        {meetingSearchQuery.trim() && (
                          <button
                            type="button"
                            onClick={() => setMeetingSearchQuery('')}
                            className="search-clear-btn"
                            aria-label="Clear search"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                {meetingsLoading ? (
                  <div className="meeting-skeleton-list" role="status" aria-live="polite" aria-label="Loading meetings">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="meeting-skeleton">
                        <div className="meeting-skeleton-header">
                          <span className="skeleton-bar skeleton-bar--sm" style={{ width: '6rem' }} />
                          <span className="skeleton-bar skeleton-bar--sm" style={{ width: '4rem' }} />
                          <span className="skeleton-bar skeleton-bar--md" style={{ width: '14rem' }} />
                          <span className="skeleton-bar skeleton-bar--sm" style={{ width: '8rem' }} />
                        </div>
                        <div className="meeting-skeleton-section">
                          <span className="skeleton-bar skeleton-bar--section" style={{ width: '8rem' }} />
                          <div className="meeting-skeleton-table">
                            <span className="skeleton-bar skeleton-bar--row" style={{ width: '100%' }} />
                            <span className="skeleton-bar skeleton-bar--row" style={{ width: '92%' }} />
                            <span className="skeleton-bar skeleton-bar--row" style={{ width: '88%' }} />
                            <span className="skeleton-bar skeleton-bar--row" style={{ width: '95%' }} />
                            <span className="skeleton-bar skeleton-bar--row" style={{ width: '70%' }} />
                          </div>
                        </div>
                        <div className="meeting-skeleton-section">
                          <span className="skeleton-bar skeleton-bar--section" style={{ width: '10rem' }} />
                          <div className="meeting-skeleton-table">
                            <span className="skeleton-bar skeleton-bar--row" style={{ width: '85%' }} />
                            <span className="skeleton-bar skeleton-bar--row" style={{ width: '78%' }} />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : meetingList.length === 0 ? (
                  <div className="meeting-empty-msg">No meeting minutes loaded.</div>
                ) : (() => {
                  let toShow = selectedMeetings.includes('All')
                    ? meetingListByType
                    : meetingListByType.filter((m) => selectedMeetings.includes(m.filename));
                  toShow = meetingSearchQuery.trim()
                    ? toShow.filter((m) => meetingMatchesSearch(m, meetingSearchQuery))
                    : toShow;
                  if (toShow.length === 0) {
                    const msg = meetingSearchQuery.trim()
                      ? 'No meetings match your search.'
                      : 'Select one or more dates.';
                    return <div className="meeting-empty-msg">{msg}</div>;
                  }
                  return (
                    <div className="meeting-detail-list">
                      {toShow.map((meeting) => (
                        <MeetingDetail
                          key={meeting.filename}
                          meeting={meeting}
                          fileUrl={meeting.filename ? (meetingPdfUrlMap[meeting.filename] ?? meetingPdfUrlMap[meeting.filename.replace(/\.pdf$/i, '_0.pdf')]) : undefined}
                          visibleAttributes={selectedMeetingAttributes}
                          searchHighlight={meetingSearchQuery.trim() || undefined}
                        />
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="documents-content">
                {!documentsLoaded ? (
                  <div className="content-loading" role="status" aria-live="polite">
                    <span className="content-loading-label">Loading documents</span>
                    <div className="content-loading-dots">
                      <span className="content-loading-dot" />
                      <span className="content-loading-dot" />
                      <span className="content-loading-dot" />
                    </div>
                  </div>
                ) : Object.keys(groupedData).length > 0 ? (
                  (Object.entries(groupedData) as [string, VillageDocument[]][]).map(([groupName, docs]) => (
                    <section key={groupName} className="section-block">
                      <div className="section-head">
                        <h2 className="section-title">{groupName}</h2>
                        <span className="section-count">{docs.length} RECORDS</span>
                      </div>
                      <div className="document-list">
                        {docs.map(doc => (
                          <div key={doc.id} className="document-list-item">
                            <div className="document-meta">
                              <div className="document-meta-row">
                                <span className="document-date">
                                  {new Date(doc.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                </span>
                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="document-link">
                                  {searchQuery.trim() ? highlightSearchPhrase(doc.title, searchQuery) : doc.title}
                                  <ExternalLinkIcon className="document-link-icon" />
                                </a>
                                <span className="document-type-badge">{doc.type}</span>
                                {doc.category && (
                                  <span className="document-type-badge">{doc.category}</span>
                                )}
                              </div>
                              {doc.summary && (
                                <p className="document-summary">
                                  {searchQuery.trim() ? highlightSearchPhrase(doc.summary, searchQuery) : doc.summary}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))
                ) : documentsLoaded ? (
                  <div className="empty-state">
                    <div className="empty-state-icon-wrap">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="empty-state-title">NOTHING FOUND</h3>
                    <button
                      type="button"
                      onClick={() => { setSearchQuery(''); setSelectedYears(['All']); setSelectedCategories(['All']); }}
                      className="empty-state-action"
                    >
                      RESTORE ARCHIVE
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </main>
      </div>

      <div
        className={`chat-modal-overlay${!isChatExpanded ? ' chat-modal-overlay--hidden' : ''}`}
        onClick={() => isChatExpanded && setIsChatExpanded(false)}
        role="dialog"
        aria-modal="true"
        aria-hidden={!isChatExpanded}
        aria-label="AI assistant"
      >
        <div className="chat-modal-content" onClick={(e) => e.stopPropagation()}>
          <ChatPanel documents={documents} meetingMinutes={meetingList} externalTriggerMessage={externalAiMessage} onMessageProcessed={() => setExternalAiMessage(null)} />
        </div>
      </div>

    </div>
  );
};

export default App;
