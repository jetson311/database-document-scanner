import React, { useState, useRef, useEffect } from 'react';
import type { MeetingMinutes as MeetingMinutesType, MeetingVote } from '../types/meeting';

const SECTION_IDS = ['resolutions', 'board-comments', 'public-comments'] as const;

const ExternalLinkIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="currentColor" aria-hidden>
    <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 372-372H560v-80h240v240h-80v-144L388-332Z" />
  </svg>
);
const SECTION_LABELS: Record<(typeof SECTION_IDS)[number], string> = {
  'resolutions': 'Resolutions',
  'board-comments': 'Board comments',
  'public-comments': 'Public comments',
};

interface MeetingDetailProps {
  meeting: MeetingMinutesType;
  fileUrl?: string;
  /** When set and not "All", only show selected attributes (resolutions|title, comments|board, etc.) */
  visibleAttributes?: string[];
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

function getResultClass(voteResult: string): 'passed' | 'failed' {
  const r = (voteResult || '').toUpperCase();
  return r.includes('FAILED') || r.includes('NAY') ? 'failed' : 'passed';
}

function getResultLabel(voteResult: string): string {
  return getResultClass(voteResult) === 'failed' ? 'Failed' : 'Passed';
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

const normalizeName = (s: string) => s.trim().toLowerCase();

/** True if displayName set contains any name that normalizes to the same as rawName (so one dropdown entry matches all variants). */
function nameMatchesVisible(visibleNames: Set<string>, rawName: string): boolean {
  const norm = normalizeName(rawName);
  for (const display of visibleNames) if (normalizeName(display) === norm) return true;
  return false;
}

/** Mayor, trustees, and attorney for this meeting; used to exclude public from board comments. */
function getMeetingOfficials(meeting: MeetingMinutesType): Set<string> {
  const set = new Set<string>();
  const att = meeting.meeting_metadata?.attendees as {
    mayor?: { name?: string };
    trustees?: { name?: string }[];
    others?: { name?: string; title?: string }[];
  } | undefined;
  if (!att) return set;
  if (att.mayor?.name) set.add(att.mayor.name.trim());
  (att.trustees || []).forEach((t) => { if (t.name) set.add(t.name.trim()); });
  (att.others || []).forEach((o) => {
    if (o.name && (o.title === 'Attorney' || /attorney/i.test(o.title ?? '') || /attorney/i.test(o.name))) set.add(o.name.trim());
  });
  return set;
}

export function MeetingDetail({ meeting, fileUrl, visibleAttributes }: MeetingDetailProps) {
  const meta = meeting.meeting_metadata || {};
  const date = meta.date || '';
  const votes = meeting.votes || [];
  const publicComments = meeting.public_comments || [];
  const meetingOfficials = getMeetingOfficials(meeting);
  const boardCommentsRaw = flattenBoardComments(votes);
  const boardComments = meetingOfficials.size > 0
    ? boardCommentsRaw.filter((c) => meetingOfficials.has(c.speaker))
    : boardCommentsRaw;
  const officialsOrder = getOfficialsOrder(votes);

  const showResolutions = hasAttr(visibleAttributes, 'resolutions', 'resolutions|title', 'resolutions|context', 'resolutions|votes-member', 'resolutions|votes-type');
  const showTitleCol = hasAttr(visibleAttributes, 'resolutions', 'resolutions|title');
  const showContextCol = hasAttr(visibleAttributes, 'resolutions', 'resolutions|context');
  const showVoteColsGeneric = hasAttr(visibleAttributes, 'resolutions', 'resolutions|votes-member');
  const visibleOfficials = getVisibleNames(visibleAttributes, 'resolutions|votes-member');
  const officialsToShow =
    visibleOfficials == null
      ? (showVoteColsGeneric ? officialsOrder : [])
      : officialsOrder.filter((n) => nameMatchesVisible(visibleOfficials, n));
  const showResultCol = hasAttr(visibleAttributes, 'resolutions', 'resolutions|votes-type');
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

  const [activeSection, setActiveSection] = useState<(typeof SECTION_IDS)[number]>('resolutions');
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

  return (
    <div className="meeting-detail" ref={meetingDetailRef}>
      <div ref={headerSentinelRef} className="meeting-page-header-sentinel" aria-hidden="true" />
      <header ref={headerRef} className="meeting-page-header">
        <div className="meeting-page-header-inner">
          <div className="meeting-page-header-left">
            <span className="meeting-date">{formatDate(date)}</span>
            <span className="meeting-page-header-section-label">{SECTION_LABELS[activeSection]}</span>
          </div>
          <div className="meeting-page-header-right">
            <h2 className="meeting-title">Board of Trustees Meeting</h2>
            {meeting.filename && (
              <a href={fileUrl || '#'} target="_blank" rel="noopener noreferrer" className="meeting-filename-link">
                {meeting.filename}
                <ExternalLinkIcon className="meeting-filename-link-icon" />
              </a>
            )}
          </div>
        </div>
      </header>

      {showResolutions && (showTitleCol || showContextCol || officialsToShow.length > 0 || showResultCol) && (
        <>
          <h3 className="meeting-page-section-header" data-section="resolutions">Resolutions</h3>
          <div className="meeting-section-card-wrap">
            <section className="meeting-card meeting-card--full meeting-section-card">
              <div className="meeting-resolutions-table-wrap">
                <div className="meeting-table-sticky-header" aria-hidden="true">
                  <table className="meeting-table meeting-table--header-only">
                    <colgroup>
                      {showTitleCol && <col className="meeting-table-col-title" />}
                      {showContextCol && <col className="meeting-table-col-context" />}
                      {officialsToShow.map((name) => (
                        <col key={name} className="meeting-table-cell-vote meeting-col-vote-result" />
                      ))}
                      {showResultCol && <col className="meeting-table-cell-result meeting-col-vote-result" />}
                    </colgroup>
                    <thead>
                      <tr>
                        {showTitleCol && <th className="meeting-table-head meeting-table-cell meeting-table-col-title">Title</th>}
                        {showContextCol && <th className="meeting-table-head meeting-table-cell meeting-table-col-context">Context</th>}
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
                      {showContextCol && <col className="meeting-table-col-context" />}
                      {officialsToShow.map((name) => (
                        <col key={name} className="meeting-table-cell-vote meeting-col-vote-result" />
                      ))}
                      {showResultCol && <col className="meeting-table-cell-result meeting-col-vote-result" />}
                    </colgroup>
                    <tbody>
                      {votes.map((v, i) => (
                        <tr key={v.section + String(i)}>
                          {showTitleCol && (
                            <td className="meeting-table-cell meeting-table-col-title">
                              <span className="meeting-resolution-title meeting-cell-truncate" title={v.motion_description ?? ''}>{v.motion_description}</span>
                            </td>
                          )}
                          {showContextCol && (() => {
                            const itemOrAddendum = v.section ? formatItemOrAddendum(v.section, v.addendum) : null;
                            const parts = [itemOrAddendum, v.context].filter(Boolean);
                            const text = parts.length ? parts.join(' ') : '—';
                            return (
                              <td className="meeting-table-cell meeting-table-col-context meeting-table-cell--muted">
                                <span className="meeting-cell-truncate" title={text || undefined}>
                                  {text}
                                </span>
                              </td>
                            );
                          })()}
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
                              <span className="meeting-result-tag">{getResultLabel(v.vote_result)}</span>
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
          <h3 className="meeting-page-section-header" data-section="board-comments">Board comments</h3>
          <div className="meeting-section-card-wrap">
            <section className="meeting-card meeting-card--full meeting-section-card">
              <div className="meeting-table-sticky-wrap meeting-comments-table-wrap">
                <div className="meeting-table-sticky-header" aria-hidden="true">
                  <table className="meeting-table meeting-table--header-only">
                    <colgroup>
                      <col className="meeting-comments-col-name" />
                      <col className="meeting-comments-col-response" />
                      <col className="meeting-comments-col-comment" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="meeting-table-head meeting-table-cell">Name</th>
                        <th className="meeting-table-head meeting-table-cell meeting-table-col-response">In response to</th>
                        <th className="meeting-table-head meeting-table-cell meeting-table-col-comment">Comment</th>
                      </tr>
                    </thead>
                  </table>
                </div>
                <div className="meeting-section-card-inner meeting-card-scroll">
                  <table className="meeting-table">
                    <colgroup>
                      <col className="meeting-comments-col-name" />
                      <col className="meeting-comments-col-response" />
                      <col className="meeting-comments-col-comment" />
                    </colgroup>
                    <tbody>
                      {boardComments.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="meeting-table-cell meeting-table-cell--empty">
                            No board discussion recorded.
                          </td>
                        </tr>
                      ) : (
                        boardCommentsToShow.map((c, i) => (
                          <tr key={i}>
                            <td className="meeting-table-cell meeting-table-cell--name">
                              <span className="meeting-cell-ellipsis" title={c.speaker}>{c.speaker}</span>
                            </td>
                            <td className="meeting-table-cell meeting-table-cell--muted meeting-table-col-response">
                              <span className="meeting-cell-ellipsis" title={c.inResponseTo ?? undefined}>{c.inResponseTo ?? '—'}</span>
                            </td>
                            <td className="meeting-table-cell meeting-table-cell--muted">
                              <span className="meeting-cell-ellipsis" title={c.statement}>{c.statement}</span>
                            </td>
                          </tr>
                        ))
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
          <h3 className="meeting-page-section-header" data-section="public-comments">Public comments</h3>
          <div className="meeting-section-card-wrap">
            <section className="meeting-card meeting-card--full meeting-section-card">
              <div className="meeting-table-sticky-wrap meeting-comments-table-wrap">
                <div className="meeting-table-sticky-header" aria-hidden="true">
                  <table className="meeting-table meeting-table--header-only">
                    <colgroup>
                      <col className="meeting-comments-col-name" />
                      <col className="meeting-comments-col-response" />
                      <col className="meeting-comments-col-comment" />
                    </colgroup>
                    <thead>
                      <tr>
                        <th className="meeting-table-head meeting-table-cell">Name</th>
                        <th className="meeting-table-head meeting-table-cell meeting-table-col-response">In response to</th>
                        <th className="meeting-table-head meeting-table-cell meeting-table-col-public-comment meeting-table-col-comment">Comment</th>
                      </tr>
                    </thead>
                  </table>
                </div>
                <div className="meeting-section-card-inner meeting-card-scroll">
                  <table className="meeting-table">
                    <colgroup>
                      <col className="meeting-comments-col-name" />
                      <col className="meeting-comments-col-response" />
                      <col className="meeting-comments-col-comment" />
                    </colgroup>
                    <tbody>
                      {publicComments.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="meeting-table-cell meeting-table-cell--empty">
                            No public comments recorded.
                          </td>
                        </tr>
                      ) : (
                        publicCommentsToShow.map((c, i) => {
                          const nameStr = c.speaker?.name ?? '—';
                          const responseStr = c.referenced_items?.length ? c.referenced_items.map((ref) => `Item ${ref}`).join(', ') : '—';
                          return (
                            <tr key={i}>
                              <td className="meeting-table-cell meeting-table-cell--name">
                                <span className="meeting-cell-ellipsis" title={nameStr}>{nameStr}</span>
                              </td>
                              <td className="meeting-table-cell meeting-table-cell--muted meeting-table-col-response">
                                <span className="meeting-cell-ellipsis" title={responseStr}>{responseStr}</span>
                              </td>
                              <td className="meeting-table-cell meeting-table-cell--muted meeting-table-col-public-comment">
                                <span className="meeting-cell-ellipsis" title={c.comment_text}>{c.comment_text}</span>
                              </td>
                            </tr>
                          );
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

/** Format section as "Item 7e" or "Addendum: 7d-amended" for context / In response to columns. */
function formatItemOrAddendum(section: string, addendum?: string | null): string {
  if (!section) return '';
  const isAddendum = /-(?:amended|addendum)/i.test(section);
  if (addendum) return `Addendum: ${addendum}`;
  if (isAddendum) return `Addendum: ${section}`;
  return `Item ${section}`;
}

function flattenBoardComments(votes: MeetingVote[]): { speaker: string; statement: string; inResponseTo?: string }[] {
  const out: { speaker: string; statement: string; inResponseTo?: string }[] = [];
  votes.forEach((v) => {
    const inResponseTo = v.section ? formatItemOrAddendum(v.section, v.addendum) : undefined;
    (v.discussion || []).forEach((d) => {
      out.push({ speaker: d.speaker, statement: d.statement, inResponseTo });
    });
  });
  return out;
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return iso;
  }
}

function VoteCell({ value }: { value?: string }) {
  if (value == null || value === '') return <span className="meeting-voting-placeholder">—</span>;
  const v = String(value).toUpperCase();
  const className =
    v === 'YES' || v === 'AYE'
      ? 'meeting-voting-value--yes'
      : v === 'NO' || v === 'NAY'
        ? 'meeting-voting-value--no'
        : 'meeting-voting-value--other';
  return <span className={className}>{value}</span>;
}
