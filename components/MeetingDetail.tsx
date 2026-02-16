import React, { useState, useRef, useEffect, useMemo } from 'react';
import type { MeetingMinutes as MeetingMinutesType, MeetingVote } from '../types/meeting';
import { getMeetingDisplayDate } from '../types/meeting';
import { highlightSearchPhrase } from '../utils/highlight';

const SECTION_IDS = ['resolutions', 'board-comments', 'public-comments'] as const;

const ExternalLinkIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden>
    <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 372-372H560v-80h240v240h-80v-144L388-332Z" />
  </svg>
);

const ChevronIcon = ({ expanded, className = 'w-4 h-4' }: { expanded: boolean; className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {expanded ? (
      <path d="M6 9l6 6 6-6" />
    ) : (
      <path d="M9 18l6-6-6-6" />
    )}
  </svg>
);

const SECTION_LABELS: Record<(typeof SECTION_IDS)[number], string> = {
  'resolutions': 'Motions',
  'board-comments': 'Board comments',
  'public-comments': 'Public comments',
};

interface MeetingDetailProps {
  meeting: MeetingMinutesType;
  fileUrl?: string;
  /** When set and not "All", only show selected attributes (resolutions|title, comments|board, etc.) */
  visibleAttributes?: string[];
  /** When set, highlight this phrase in searchable text (date, filename, motions, comments). */
  searchHighlight?: string;
}

/** Ordered list of official names from vote breakdowns (from first vote that has breakdown) */
function getOfficialsOrder(votes: MeetingVote[]): string[] {
  for (const v of votes) {
    const breakdown = v.vote_breakdown || {};
    const names = Object.keys(breakdown);
    if (names.length > 0) return names;
  }
  return [];
}

/** CSS class for Result cell: green only ALL AYES / MOTION PASSED / MOTION PASSES; red only FAILED; muted for all else. */
function getResultClass(voteResult: string): 'passed' | 'failed' | 'muted' {
  const r = (voteResult || '').toUpperCase().trim();
  if (/ALL\s+AYES|MOTION\s+PASSED|MOTION\s+PASSES/.test(r)) return 'passed';
  if (r.includes('FAILED')) return 'failed';
  return 'muted';
}

/** Show exact document text; truncate only if longer than maxLen (for display). */
function truncateExact(text: string, maxLen: number): string {
  const s = String(text ?? '').trim();
  if (!s) return '—';
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen - 1) + '…';
}

/** Same as truncateExact but display in uppercase (for result/vote columns). Preserves — placeholder. */
function truncateExactUpper(text: string, maxLen: number): string {
  const s = truncateExact(text, maxLen);
  return s === '—' ? s : s.toUpperCase();
}

/** Ensure the first letter of each sentence in comment text is uppercase (for display in comment column). */
function capitalizeSentenceStarts(text: string): string {
  const s = String(text ?? '').trim();
  if (!s) return s;
  return s.replace(/(^|[.!?]\s*)([a-z])/g, (_, after, letter) => after + letter.toUpperCase());
}

/** Abbreviate "Mayor Rossi" → "M. Ros", "Trustee Price-Bush" → "T. Pri"; full name on hover via title. */
function abbreviateOfficialName(fullName: string): string {
  const s = fullName.trim();
  if (!s) return '';
  const parts = s.split(/\s+/);
  const titleChar = parts[0].slice(0, 1) + '.';
  const namePart = parts.length > 1 ? parts[parts.length - 1].slice(0, 3) : parts[0].slice(0, 3);
  return titleChar + ' ' + namePart;
}

function hasAttr(visible: string[] | undefined, ...keys: string[]): boolean {
  if (!visible || visible.includes('All')) return true;
  return keys.some((k) => visible.includes(k));
}

/** If visibility is filtered by specific names, return the set of allowed values; otherwise null = show all. */
function getVisibleNames(visible: string[] | undefined, prefix: string): Set<string> | null {
  if (!visible || visible.includes('All')) return null;
  const genericKey = prefix; // e.g. 'resolutions|votes-member' or 'comments|board'
  if (visible.includes(genericKey)) return null;
  const set = new Set<string>();
  visible.forEach((v) => {
    if (v.startsWith(genericKey + '|')) set.add(v.slice((genericKey + '|').length));
  });
  return set.size > 0 ? set : null;
}

/** Selected vote result values (e.g. ALL AYES, MOTION PASSED). Null = show all. */
function getVisibleVoteResults(visible: string[] | undefined): Set<string> | null {
  return getVisibleNames(visible, 'resolutions|votes-type');
}

const normalizeName = (s: string) => s.trim().toLowerCase();

/** True if displayName set contains any name that normalizes to the same as rawName (so one dropdown entry matches all variants). */
function nameMatchesVisible(visibleNames: Set<string>, rawName: string): boolean {
  const norm = normalizeName(rawName);
  for (const display of visibleNames) if (normalizeName(display) === norm) return true;
  return false;
}

/** Mayor, trustees, and attorney for this meeting; used to include only board/officials in board comments. */
function getMeetingOfficials(meeting: MeetingMinutesType): Set<string> {
  const set = new Set<string>();
  const addWithSurname = (fullName: string) => {
    const t = fullName.trim();
    if (!t) return;
    set.add(t);
    const parts = t.split(/\s+/);
    if (parts.length > 1) set.add(parts[parts.length - 1]);
  };
  const att = meeting.meeting_metadata?.attendees as {
    mayor?: { name?: string };
    trustees?: { name?: string }[];
    others?: { name?: string; title?: string }[];
  } | undefined;
  if (!att) return set;
  if (att.mayor?.name) addWithSurname(att.mayor.name);
  (att.trustees || []).forEach((t) => { if (t.name) addWithSurname(t.name); });
  (att.others || []).forEach((o) => {
    if (o.name && (o.title === 'Attorney' || /attorney/i.test(o.title ?? '') || /attorney/i.test(o.name))) addWithSurname(o.name);
  });
  return set;
}

/** True if speaker is one of the meeting officials (exact or surname match). */
function isBoardOfficial(speaker: string, officials: Set<string>): boolean {
  const s = speaker.trim();
  if (officials.has(s)) return true;
  const norm = normalizeName(s);
  for (const official of officials) {
    if (normalizeName(official) === norm) return true;
    const officialParts = official.trim().split(/\s+/);
    const speakerParts = s.split(/\s+/);
    if (officialParts.length > 0 && speakerParts.length > 0) {
      if (normalizeName(officialParts[officialParts.length - 1]) === norm) return true;
      if (normalizeName(speakerParts[speakerParts.length - 1]) === normalizeName(official)) return true;
    }
  }
  return false;
}

/** True if responder string looks like a board role (Mayor, Trustee, Attorney) so we still show it when officials list is missing or name doesn't match. */
function isLikelyBoardResponder(responder: string): boolean {
  const r = responder.trim().toLowerCase();
  return r.includes('mayor') || r.includes('trustee') || r.includes('attorney');
}

export function MeetingDetail({ meeting, fileUrl, visibleAttributes, searchHighlight }: MeetingDetailProps) {
  const date = getMeetingDisplayDate(meeting);
  const votes = meeting.votes || [];
  const publicComments = meeting.public_comments || [];
  const meetingOfficials = getMeetingOfficials(meeting);
  const boardCommentsRaw = flattenBoardComments(votes);
  const boardCommentsFiltered = meetingOfficials.size > 0
    ? boardCommentsRaw.filter((c) => isBoardOfficial(c.speaker, meetingOfficials))
    : boardCommentsRaw;
  const mayorAnnouncements = (meeting as { mayor_announcements?: { speaker?: string; topic?: string; announcement?: string }[] }).mayor_announcements ?? [];
  const mayorCommentRows = mayorAnnouncements
    .filter((a) => a.speaker && (a.announcement || a.topic))
    .map((a) => ({
      speaker: (a.speaker ?? '').trim(),
      statement: (a.announcement ?? a.topic ?? '').trim(),
      inResponseTo: a.topic && a.announcement ? a.topic : undefined,
    }));
  const publicWithResponse = (meeting.public_comments ?? []) as { board_response?: { responder?: string; response?: string } }[];
  const boardResponseRows = publicWithResponse
    .filter((pc) => {
      const responder = pc.board_response?.responder?.trim();
      const response = pc.board_response?.response?.trim();
      if (!responder || !response) return false;
      return meetingOfficials.size === 0
        ? isLikelyBoardResponder(responder)
        : isBoardOfficial(responder, meetingOfficials) || isLikelyBoardResponder(responder);
    })
    .map((pc) => ({
      speaker: (pc.board_response!.responder ?? '').trim(),
      statement: (pc.board_response!.response ?? '').trim(),
      inResponseTo: undefined,
    }));
  const boardComments = [...boardCommentsFiltered, ...mayorCommentRows, ...boardResponseRows];
  const officialsOrder = getOfficialsOrder(votes);

  const showResolutions = hasAttr(visibleAttributes, 'resolutions', 'resolutions|title', 'resolutions|votes-member') ||
    (visibleAttributes?.some((a) => a.startsWith('resolutions|votes-type|')) ?? false);
  const showTitleCol = hasAttr(visibleAttributes, 'resolutions', 'resolutions|title');
  const showVoteColsGeneric = hasAttr(visibleAttributes, 'resolutions', 'resolutions|votes-member');
  const visibleOfficials = getVisibleNames(visibleAttributes, 'resolutions|votes-member');
  const officialsToShow =
    visibleOfficials == null
      ? (showVoteColsGeneric ? officialsOrder : [])
      : officialsOrder.filter((n) => nameMatchesVisible(visibleOfficials, n));
  const visibleVoteResults = getVisibleVoteResults(visibleAttributes);
  const showResultCol = hasAttr(visibleAttributes, 'resolutions') || (visibleAttributes?.some((a) => a.startsWith('resolutions|votes-type|')) ?? false);
  const votesToShow = visibleVoteResults == null
    ? votes
    : votes.filter((v) => visibleVoteResults.has((v.vote_result ?? '').trim().toUpperCase()));
  const showBoardCommentsGeneric = hasAttr(visibleAttributes, 'comments', 'comments|board');
  const visibleBoardSpeakers = getVisibleNames(visibleAttributes, 'comments|board');
  const boardCommentsToShow = (showBoardCommentsGeneric
    ? (visibleBoardSpeakers == null ? boardComments : boardComments.filter((c) => nameMatchesVisible(visibleBoardSpeakers, c.speaker)))
    : []
  ).slice().sort((a, b) => a.speaker.localeCompare(b.speaker, undefined, { sensitivity: 'base' }));
  const showPublicCommentsGeneric = hasAttr(visibleAttributes, 'comments', 'comments|public');
  const visiblePublicNames = getVisibleNames(visibleAttributes, 'comments|public');
  const publicCommentsToShow = (showPublicCommentsGeneric
    ? (visiblePublicNames == null ? publicComments : publicComments.filter((c) => nameMatchesVisible(visiblePublicNames, c.speaker?.name ?? '')))
    : []
  ).slice().sort((a, b) => (a.speaker?.name ?? '').localeCompare(b.speaker?.name ?? '', undefined, { sensitivity: 'base' }));
  const showBoardComments = boardCommentsToShow.length > 0 || (showBoardCommentsGeneric && visibleBoardSpeakers == null);
  const showPublicComments = publicCommentsToShow.length > 0 || (showPublicCommentsGeneric && visiblePublicNames == null);

  /** Public comments grouped by speaker name for nested display */
  const publicCommentsBySpeaker = useMemo(() => {
    const map = new Map<string, typeof publicCommentsToShow>();
    for (const c of publicCommentsToShow) {
      const name = c.speaker?.name ?? '—';
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(c);
    }
    return Array.from(map.entries())
      .map(([name, comments]) => ({ name, comments }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [publicCommentsToShow]);

  /** Board comments grouped by speaker for nested display */
  const boardCommentsBySpeaker = useMemo(() => {
    const map = new Map<string, typeof boardCommentsToShow>();
    for (const c of boardCommentsToShow) {
      const name = c.speaker;
      if (!map.has(name)) map.set(name, []);
      map.get(name)!.push(c);
    }
    return Array.from(map.entries())
      .map(([name, comments]) => ({ name, comments }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [boardCommentsToShow]);

  const [activeSection, setActiveSection] = useState<(typeof SECTION_IDS)[number]>('resolutions');
  const [expandedPublicSpeakers, setExpandedPublicSpeakers] = useState<Set<string>>(new Set());
  const [expandedBoardSpeakers, setExpandedBoardSpeakers] = useState<Set<string>>(new Set());
  const hl = (text: string) =>
    searchHighlight?.trim() ? highlightSearchPhrase(text, searchHighlight) : text;
  const meetingDetailRef = useRef<HTMLDivElement>(null);
  const headerSentinelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const container = meetingDetailRef.current;
    if (!container) return;

    const observers: IntersectionObserver[] = [];
    const rootMargin = '0px 0px -50% 0px';

    SECTION_IDS.forEach((id) => {
      const el = container.querySelector(`[data-section="${id}"]`);
      if (!el) return;
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) setActiveSection(id);
          });
        },
        { root: null, rootMargin, threshold: 0 }
      );
      observer.observe(el);
      observers.push(observer);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  // Toggle .meeting-page-header--stuck when header is in sticky position (for drop shadow).
  useEffect(() => {
    const sentinel = headerSentinelRef.current;
    const header = headerRef.current;
    if (!sentinel || !header) return;
    const stickTopPx = 66; // 4rem + 2px
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          header.classList.toggle('meeting-page-header--stuck', !entry.isIntersecting);
        });
      },
      { root: null, rootMargin: `-${stickTopPx}px 0px 0px 0px`, threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // Hide expand caret only when neither "Related to" (topics) nor comment column is truncated.
  useEffect(() => {
    const container = meetingDetailRef.current;
    if (!container) return;

    const updateNoExpand = () => {
      container.querySelectorAll('.meeting-comment-preview').forEach((el) => {
        const tr = (el as HTMLElement).closest('tr');
        if (!tr) return;
        const commentEl = el as HTMLElement;
        const commentTruncated = commentEl.scrollHeight > commentEl.clientHeight;

        const topicsCell = tr.querySelector('td.meeting-table-col-response');
        const topicsEllipsis = topicsCell?.querySelector('.meeting-cell-ellipsis');
        const topicsTruncated = topicsEllipsis
          ? (topicsEllipsis as HTMLElement).scrollWidth > (topicsEllipsis as HTMLElement).clientWidth
          : false;

        const anyTruncated = commentTruncated || topicsTruncated;
        tr.classList.toggle('meeting-comment-row--no-expand', !anyTruncated);
      });
    };

    const raf = requestAnimationFrame(() => updateNoExpand());
    const ro = new ResizeObserver(() => requestAnimationFrame(updateNoExpand));
    ro.observe(container);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [boardCommentsBySpeaker, expandedBoardSpeakers, publicCommentsBySpeaker, expandedPublicSpeakers]);

  return (
    <div className="meeting-detail" ref={meetingDetailRef}>
      <div ref={headerSentinelRef} className="meeting-page-header-sentinel" aria-hidden="true" />
      <header ref={headerRef} className="meeting-page-header">
        <div className="meeting-page-header-inner">
          <div className="meeting-page-header-left">
            <span className="meeting-date">{hl(formatDate(date))}</span>
            <span className="meeting-page-header-section-label">{SECTION_LABELS[activeSection]}</span>
          </div>
          <div className="meeting-page-header-right">
            <h2 className="meeting-title">Board of Trustees Meeting</h2>
            {meeting.filename && (
              <a href={fileUrl || '#'} target="_blank" rel="noopener noreferrer" className="meeting-filename-link">
                {hl(meeting.filename)}
                <ExternalLinkIcon className="meeting-filename-link-icon" />
              </a>
            )}
          </div>
        </div>
      </header>

      {showResolutions && (showTitleCol || officialsToShow.length > 0 || showResultCol) && (
        <>
          <h3 className="meeting-page-section-header" data-section="resolutions">Motions</h3>
          <div className="meeting-section-card-wrap">
            <section className="meeting-card meeting-card--full meeting-section-card">
              <div className="meeting-resolutions-table-wrap">
                <div className="meeting-table-sticky-header" aria-hidden="true">
                  <table className="meeting-table meeting-table--header-only">
                    <colgroup>
                      {showTitleCol && <col className="meeting-table-col-title" />}
                      {officialsToShow.map((name) => (
                        <col key={name} className="meeting-table-cell-vote meeting-col-vote-result" />
                      ))}
                      {showResultCol && <col className="meeting-table-cell-result meeting-col-vote-result" />}
                    </colgroup>
                    <thead>
                      <tr>
                        {showTitleCol && <th className="meeting-table-head meeting-table-cell meeting-table-col-title">Title</th>}
                        {officialsToShow.map((name) => (
                          <th key={name} className="meeting-table-head meeting-table-cell meeting-table-cell-vote meeting-table-head-official meeting-col-vote-result" title={name}>
                            {abbreviateOfficialName(name)}
                          </th>
                        ))}
                        {showResultCol && <th className="meeting-table-head meeting-table-cell meeting-table-cell-result meeting-col-vote-result">Result</th>}
                      </tr>
                    </thead>
                  </table>
                </div>
                <div className="meeting-section-card-inner meeting-card-scroll">
                  <table className="meeting-table">
                    <colgroup>
                      {showTitleCol && <col className="meeting-table-col-title" />}
                      {officialsToShow.map((name) => (
                        <col key={name} className="meeting-table-cell-vote meeting-col-vote-result" />
                      ))}
                      {showResultCol && <col className="meeting-table-cell-result meeting-col-vote-result" />}
                    </colgroup>
                    <tbody>
                      {votesToShow.map((v, i) => (
                        <tr key={v.section + String(i)}>
                          {showTitleCol && (
                            <td className="meeting-table-cell meeting-table-col-title">
                              <span className="meeting-resolution-title meeting-cell-truncate" title={v.motion_description ?? ''}>{hl(v.motion_description ?? '')}</span>
                            </td>
                          )}
                          {officialsToShow.map((name) => {
                            const voteValue = (v.vote_breakdown || {})[name];
                            return (
                              <td key={name} className="meeting-table-cell meeting-table-cell-vote meeting-col-vote-result">
                                <span className="meeting-vote-cell-inner" title={voteValue ?? ''}>
                                  <VoteCell value={voteValue} />
                                </span>
                              </td>
                            );
                          })}
                          {showResultCol && (
                            <td className={`meeting-table-cell meeting-table-cell-result meeting-table-cell-result--${getResultClass(v.vote_result)} meeting-col-vote-result`}>
                              <span className="meeting-result-tag meeting-cell-truncate-result" title={v.vote_result ?? undefined}>
                                {hl(truncateExactUpper(v.vote_result, 28))}
                              </span>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {showBoardComments && (
        <>
          <div className="meeting-section-header-row" data-section="board-comments">
            <h3 className="meeting-page-section-header">Board comments</h3>
            <button
              type="button"
              className="meeting-expand-all-btn"
              aria-label={expandedBoardSpeakers.size === boardCommentsBySpeaker.length && boardCommentsBySpeaker.length > 0 ? 'Collapse all board comment rows' : 'Expand all board comment rows'}
              onClick={() => {
                const allNames = new Set(boardCommentsBySpeaker.map((g) => g.name));
                const allExpanded = allNames.size > 0 && expandedBoardSpeakers.size === allNames.size;
                setExpandedBoardSpeakers(allExpanded ? new Set() : allNames);
              }}
            >
              {boardCommentsBySpeaker.length > 0 && expandedBoardSpeakers.size === boardCommentsBySpeaker.length ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
          <div className="meeting-section-card-wrap">
            <section className="meeting-card meeting-card--full meeting-section-card">
              <div className="meeting-table-sticky-wrap meeting-comments-table-wrap">
                <div className="meeting-table-sticky-header" aria-hidden="true">
                  <table className="meeting-table meeting-table--header-only">
                    <colgroup>
                      <col className="meeting-comments-col-expand" />
                      <col className="meeting-comments-col-name" />
                      <col className="meeting-comments-col-response" />
                      <col className="meeting-comments-col-comment" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="meeting-table-head meeting-table-cell meeting-comments-col-expand" aria-label="Expand row" />
                        <th className="meeting-table-head meeting-table-cell">Name</th>
                        <th className="meeting-table-head meeting-table-cell meeting-table-col-response">Topics</th>
                        <th className="meeting-table-head meeting-table-cell meeting-table-col-comment">Comment</th>
                      </tr>
                    </thead>
                  </table>
                </div>
                <div className="meeting-section-card-inner meeting-card-scroll">
                  <table className="meeting-table">
                    <colgroup>
                      <col className="meeting-comments-col-expand" />
                      <col className="meeting-comments-col-name" />
                      <col className="meeting-comments-col-response" />
                      <col className="meeting-comments-col-comment" />
                    </colgroup>
                    <tbody>
                      {boardComments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="meeting-table-cell meeting-table-cell--empty">
                            No board discussion recorded.
                          </td>
                        </tr>
                      ) : (
                        boardCommentsBySpeaker.flatMap((group) => {
                          const isExpanded = expandedBoardSpeakers.has(group.name);
                          const toggleExpanded = () => {
                            setExpandedBoardSpeakers((prev) => {
                              const next = new Set(prev);
                              if (next.has(group.name)) next.delete(group.name);
                              else next.add(group.name);
                              return next;
                            });
                          };
                          const topicCount = group.comments.length;
                          const isSingle = topicCount === 1;
                          const c0 = group.comments[0];

                          if (isSingle) {
                            const topicText = c0.inResponseTo ?? '—';
                            return [
                              <tr key={group.name} className={`meeting-comment-row--parent ${isExpanded ? 'meeting-public-comment-row--expanded' : ''}`}>
                                <td className="meeting-table-cell meeting-table-cell--expand">
                                  <button
                                    type="button"
                                    onClick={toggleExpanded}
                                    className="meeting-comment-expand-btn"
                                    aria-expanded={isExpanded}
                                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                                  >
                                    <ChevronIcon expanded={isExpanded} />
                                  </button>
                                </td>
                                <td className="meeting-table-cell meeting-table-cell--name">
                                  <span className="meeting-cell-ellipsis" title={group.name}>{group.name}</span>
                                </td>
                                <td className="meeting-table-cell meeting-table-cell--muted meeting-table-col-response">
                                  <span className={isExpanded ? 'meeting-topic-full' : 'meeting-cell-ellipsis'} title={topicText === '—' ? undefined : topicText}>{topicText}</span>
                                </td>
                                <td className="meeting-table-cell meeting-table-cell--muted">
                                  {isExpanded ? (
                                    <span className="meeting-comment-full-text">{hl(capitalizeSentenceStarts(c0.statement))}</span>
                                  ) : (
                                    <span className="meeting-cell-ellipsis meeting-comment-preview" title={c0.statement}>{hl(capitalizeSentenceStarts(c0.statement))}</span>
                                  )}
                                </td>
                              </tr>,
                            ];
                          }

                          const parentRow = (
                            <tr key={group.name} className="meeting-comment-row--parent">
                              <td className="meeting-table-cell meeting-table-cell--expand">
                                <button
                                  type="button"
                                  onClick={toggleExpanded}
                                  className="meeting-comment-expand-btn"
                                  aria-expanded={isExpanded}
                                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                                >
                                  <ChevronIcon expanded={isExpanded} />
                                </button>
                              </td>
                              <td className="meeting-table-cell meeting-table-cell--name">
                                <span className="meeting-cell-ellipsis" title={group.name}>{group.name}</span>
                              </td>
                              <td className="meeting-table-cell meeting-table-cell--muted meeting-table-col-response">
                                <span className="meeting-cell-ellipsis" title={topicCount === 0 ? undefined : `${topicCount} topic${topicCount !== 1 ? 's' : ''}`}>
                                  {topicCount === 0 ? '—' : `${topicCount} Topic${topicCount !== 1 ? 's' : ''}`}
                                </span>
                              </td>
                              <td className="meeting-table-cell meeting-table-cell--muted" />
                            </tr>
                          );
                          const childRows = isExpanded
                            ? group.comments.map((c, j) => {
                                const childKey = `${group.name}|${j}`;
                                const topicText = c.inResponseTo ?? '—';
                                return (
                                  <tr key={childKey} className="meeting-comment-row--child">
                                    <td className="meeting-table-cell meeting-table-cell--expand meeting-table-cell--child-indent meeting-table-cell--child-no-btn" />
                                    <td className="meeting-table-cell meeting-table-cell--name meeting-table-cell--child-empty" />
                                    <td className="meeting-table-cell meeting-table-cell--muted meeting-table-col-response">
                                      <span className="meeting-topic-full" title={topicText === '—' ? undefined : topicText}>{topicText}</span>
                                    </td>
                                    <td className="meeting-table-cell meeting-table-cell--muted">
                                      <span className="meeting-comment-full-text">{hl(capitalizeSentenceStarts(c.statement))}</span>
                                    </td>
                                  </tr>
                                );
                              })
                            : [];
                          return [parentRow, ...childRows];
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </>
      )}

      {showPublicComments && (
        <>
          <div className="meeting-section-header-row" data-section="public-comments">
            <h3 className="meeting-page-section-header">Public comments</h3>
            <button
              type="button"
              className="meeting-expand-all-btn"
              aria-label={expandedPublicSpeakers.size === publicCommentsBySpeaker.length && publicCommentsBySpeaker.length > 0 ? 'Collapse all public comment rows' : 'Expand all public comment rows'}
              onClick={() => {
                const allNames = new Set(publicCommentsBySpeaker.map((g) => g.name));
                const allExpanded = allNames.size > 0 && expandedPublicSpeakers.size === allNames.size;
                setExpandedPublicSpeakers(allExpanded ? new Set() : allNames);
              }}
            >
              {publicCommentsBySpeaker.length > 0 && expandedPublicSpeakers.size === publicCommentsBySpeaker.length ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
          <div className="meeting-section-card-wrap">
            <section className="meeting-card meeting-card--full meeting-section-card">
              <div className="meeting-table-sticky-wrap meeting-comments-table-wrap">
                <div className="meeting-table-sticky-header" aria-hidden="true">
                  <table className="meeting-table meeting-table--header-only">
                    <colgroup>
                      <col className="meeting-comments-col-expand" />
                      <col className="meeting-comments-col-name" />
                      <col className="meeting-comments-col-response" />
                      <col className="meeting-comments-col-comment" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="meeting-table-head meeting-table-cell meeting-comments-col-expand" aria-label="Expand row" />
                        <th className="meeting-table-head meeting-table-cell">Name</th>
                        <th className="meeting-table-head meeting-table-cell meeting-table-col-response">Topics</th>
                        <th className="meeting-table-head meeting-table-cell meeting-table-col-public-comment meeting-table-col-comment">Comment</th>
                      </tr>
                    </thead>
                  </table>
                </div>
                <div className="meeting-section-card-inner meeting-card-scroll">
                  <table className="meeting-table">
                    <colgroup>
                      <col className="meeting-comments-col-expand" />
                      <col className="meeting-comments-col-name" />
                      <col className="meeting-comments-col-response" />
                      <col className="meeting-comments-col-comment" />
                    </colgroup>
                    <tbody>
                      {publicComments.length === 0 ? (
                        <tr>
                          <td colSpan={4} className="meeting-table-cell meeting-table-cell--empty">
                            No public comments recorded.
                          </td>
                        </tr>
                      ) : (
                        publicCommentsBySpeaker.flatMap((group) => {
                          const isExpanded = expandedPublicSpeakers.has(group.name);
                          const toggleExpanded = () => {
                            setExpandedPublicSpeakers((prev) => {
                              const next = new Set(prev);
                              if (next.has(group.name)) next.delete(group.name);
                              else next.add(group.name);
                              return next;
                            });
                          };
                          const topicCount = group.comments.reduce((sum, c) => sum + ((c.referenced_items ?? []).filter((t) => String(t).trim()).length), 0);
                          const isSingle = group.comments.length === 1;
                          const c0 = group.comments[0];

                          if (isSingle) {
                            const topics = (c0.referenced_items ?? []).filter((t) => String(t).trim());
                            return [
                              <tr key={group.name} className={`meeting-comment-row--parent ${isExpanded ? 'meeting-public-comment-row--expanded' : ''}`}>
                                <td className="meeting-table-cell meeting-table-cell--expand">
                                  <button
                                    type="button"
                                    onClick={toggleExpanded}
                                    className="meeting-comment-expand-btn"
                                    aria-expanded={isExpanded}
                                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                                  >
                                    <ChevronIcon expanded={isExpanded} />
                                  </button>
                                </td>
                                <td className="meeting-table-cell meeting-table-cell--name">
                                  <span className="meeting-cell-ellipsis" title={group.name}>{group.name}</span>
                                </td>
                                <td className="meeting-table-cell meeting-table-cell--muted meeting-table-col-response">
                                  {topics.length === 0 ? (
                                    <span>—</span>
                                  ) : isExpanded ? (
                                    topics.length === 1 ? (
                                      <span className="meeting-topic-full" title={topics[0]}>{topics[0]}</span>
                                    ) : (
                                      <ul className="meeting-topics-list">
                                        {topics.map((t, k) => (
                                          <li key={k}>{String(t).trim()}</li>
                                        ))}
                                      </ul>
                                    )
                                  ) : topics.length === 1 ? (
                                    <span className="meeting-cell-ellipsis" title={topics[0]}>{topics[0]}</span>
                                  ) : (
                                    <span className="meeting-cell-ellipsis" title={topics.join(', ')}>{topics.length} Topics</span>
                                  )}
                                </td>
                                <td className="meeting-table-cell meeting-table-cell--muted meeting-table-col-public-comment">
                                  {isExpanded ? (
                                    <span className="meeting-comment-full-text">{hl(capitalizeSentenceStarts(c0.comment_text))}</span>
                                  ) : (
                                    <span className="meeting-cell-ellipsis meeting-comment-preview" title={c0.comment_text}>{hl(capitalizeSentenceStarts(c0.comment_text))}</span>
                                  )}
                                </td>
                              </tr>,
                            ];
                          }

                          const parentRow = (
                            <tr key={group.name} className="meeting-comment-row--parent">
                              <td className="meeting-table-cell meeting-table-cell--expand">
                                <button
                                  type="button"
                                  onClick={toggleExpanded}
                                  className="meeting-comment-expand-btn"
                                  aria-expanded={isExpanded}
                                  aria-label={isExpanded ? 'Collapse' : 'Expand'}
                                >
                                  <ChevronIcon expanded={isExpanded} />
                                </button>
                              </td>
                              <td className="meeting-table-cell meeting-table-cell--name">
                                <span className="meeting-cell-ellipsis" title={group.name}>{group.name}</span>
                              </td>
                              <td className="meeting-table-cell meeting-table-cell--muted meeting-table-col-response">
                                <span className="meeting-cell-ellipsis" title={topicCount === 0 ? undefined : `${topicCount} topic${topicCount !== 1 ? 's' : ''}`}>
                                  {topicCount === 0 ? '—' : `${topicCount} Topic${topicCount !== 1 ? 's' : ''}`}
                                </span>
                              </td>
                              <td className="meeting-table-cell meeting-table-cell--muted meeting-table-col-public-comment" />
                            </tr>
                          );
                          const childRows = isExpanded
                            ? group.comments.map((c, j) => {
                                const childKey = `${group.name}|${j}`;
                                const topics = (c.referenced_items ?? []).filter((t) => String(t).trim());
                                return (
                                  <tr key={childKey} className="meeting-comment-row--child">
                                    <td className="meeting-table-cell meeting-table-cell--expand meeting-table-cell--child-indent meeting-table-cell--child-no-btn" />
                                    <td className="meeting-table-cell meeting-table-cell--name meeting-table-cell--child-empty" />
                                    <td className="meeting-table-cell meeting-table-cell--muted meeting-table-col-response">
                                      {topics.length === 0 ? (
                                        <span>—</span>
                                      ) : topics.length === 1 ? (
                                        <span className="meeting-topic-full" title={topics[0]}>{topics[0]}</span>
                                      ) : (
                                        <ul className="meeting-topics-list">
                                          {topics.map((t, k) => (
                                            <li key={k}>{String(t).trim()}</li>
                                          ))}
                                        </ul>
                                      )}
                                    </td>
                                    <td className="meeting-table-cell meeting-table-cell--muted meeting-table-col-public-comment">
                                      <span className="meeting-comment-full-text">{hl(capitalizeSentenceStarts(c.comment_text))}</span>
                                    </td>
                                  </tr>
                                );
                              })
                            : [];
                          return [parentRow, ...childRows];
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>
        </>
      )}

    </div>
  );
}

/**
 * Topic for a board comment: use the resolution/motion title.
 * Only use a section or line identifier if the statement explicitly mentions it (e.g. "item 8d", "section 4").
 */
function getBoardCommentTopic(vote: MeetingVote, statement: string): string {
  const title = (vote.motion_description ?? '').trim();
  if (title) return title;
  // No title: show section/line only if explicitly mentioned in the comment text
  const section = (vote.section ?? '').trim();
  if (!section) return '—';
  const mentionPattern = new RegExp(
    `\\b(?:item|resolution|section|line|#)\\s*${escapeRegex(section)}|\\b${escapeRegex(section)}\\b`,
    'i'
  );
  return mentionPattern.test(statement) ? section : '—';
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function flattenBoardComments(votes: MeetingVote[]): { speaker: string; statement: string; inResponseTo?: string }[] {
  const out: { speaker: string; statement: string; inResponseTo?: string }[] = [];
  votes.forEach((v) => {
    (v.discussion || []).forEach((d) => {
      const topic = getBoardCommentTopic(v, d.statement);
      out.push({ speaker: d.speaker, statement: d.statement, inResponseTo: topic === '—' ? undefined : topic });
    });
  });
  return out;
}

/** Format ISO date (YYYY-MM-DD) as local calendar date; avoids UTC-midnight showing previous day in western timezones. */
function formatDate(iso: string): string {
  if (!iso || !iso.trim()) return '—';
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
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

/** Displays exact document text for vote in uppercase (e.g. YES or AYE as in source); truncate only for narrow column. */
function VoteCell({ value }: { value?: string }) {
  if (value == null || value === '') return <span className="meeting-voting-placeholder">—</span>;
  const exact = String(value).trim();
  const display = truncateExact(exact, 14).toUpperCase();
  const v = exact.toUpperCase();
  const className =
    v === 'YES' || v === 'AYE'
      ? 'meeting-voting-value--yes'
      : v === 'NO' || v === 'NAY'
        ? 'meeting-voting-value--no'
        : 'meeting-voting-value--other';
  return (
    <span className={className} title={exact}>
      {display}
    </span>
  );
}
