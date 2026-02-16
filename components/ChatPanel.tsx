import React, { useState, useRef, useEffect } from 'react';
import { askChatQuestion, type ChatAssessments, type ChatResponseView } from '../services/anthropicService';
import { VillageDocument } from '../types';
import type { MeetingMinutes } from '../types/meeting';

const ASSESSMENT_LABELS: Record<ChatResponseView, string> = {
  general: 'General',
  zoning: 'Zoning',
  seqra: 'SEQRA',
  comprehensivePlan: 'COMP PLAN',
};

/** Full Comprehensive Plan PDF (official Village of Ballston Spa source). Shown whenever a COMP PLAN assessment is displayed. */
const COMP_PLAN_PDF_URL = 'https://www.ballstonspa.gov/sites/g/files/vyhlif6186/f/pages/village_of_ballston_spa_comprehensive_plan.pdf';
/** Comp plan structured data file (e.g. for future context loading): documents/comprehensive-plan/comprehensive-plan.json */
const COMP_PLAN_JSON_FILENAME = 'comprehensive-plan.json';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: { title: string; url: string }[];
  /** When set, show pill tabs to switch between general and framework assessments. */
  assessments?: ChatAssessments;
}

interface ChatPanelProps {
  documents: VillageDocument[];
  meetingMinutes?: MeetingMinutes[];
  externalTriggerMessage?: string | null;
  onMessageProcessed?: () => void;
}

/** Match meeting dates: ISO (2026-01-26) or long form (November 24, 2025). */
const MEETING_DATE_REGEX = /(\d{4}-\d{2}-\d{2}|(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/gi;

const MAX_SECTION_HEADING_LENGTH = 65;

/** True if this line looks like a section heading (parent with content under it). */
function isSectionHeadingLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (t.length > MAX_SECTION_HEADING_LENGTH) return false;
  if (/[.?!]$/.test(t)) return false;
  return true;
}

/** Renders content with only meeting dates bolded; strips ** so nothing else is bold. */
function renderContentWithDatesBold(content: string): React.ReactNode {
  const stripped = content.replace(/\*\*/g, '');
  const parts = stripped.split(MEETING_DATE_REGEX);
  if (parts.length <= 1) return stripped;
  // Split with capturing group yields [text, date, text, date, ...]; odd indices are dates.
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : part
  );
}

/** Renders a block: section heading lines (short parent lines) and meeting dates are bold; nothing else. */
function renderBlockWithHeadingsAndDates(blockText: string): React.ReactNode {
  const stripped = blockText.replace(/\*\*/g, '');
  const paragraphs = stripped.split(/\n\n+/);
  const nodes: React.ReactNode[] = [];
  paragraphs.forEach((para, pIdx) => {
    const firstNewline = para.indexOf('\n');
    const firstLine = firstNewline === -1 ? para : para.slice(0, firstNewline);
    const rest = firstNewline === -1 ? '' : para.slice(firstNewline + 1);
    const firstLineTrim = firstLine.trim();
    const isHeading = firstLineTrim && isSectionHeadingLine(firstLine) && (rest.length > 0 || paragraphs.length > 1);
    if (isHeading) {
      const headingText = firstLineTrim.endsWith(':') ? firstLineTrim : `${firstLineTrim}:`;
      nodes.push(<strong key={`${pIdx}-h`}>{headingText}</strong>);
      if (rest) {
        nodes.push(
          <span key={`${pIdx}-r`}>
            {'\n'}
            {renderContentWithDatesBold(rest)}
          </span>
        );
      }
      if (pIdx < paragraphs.length - 1) nodes.push('\n\n');
    } else {
      nodes.push(renderContentWithDatesBold(para));
      if (pIdx < paragraphs.length - 1) nodes.push('\n\n');
    }
  });
  return <>{nodes}</>;
}

/** Renders assistant content: ## headers (bold via CSS) with divider; body has section headings + meeting dates bold. */
function renderAssistantContent(content: string): React.ReactNode {
  const lines = content.split('\n');
  const nodes: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^##\s+.+/.test(line)) {
      nodes.push(
        <h2 key={i} className="chat-content-h2">
          {line.trim()}
        </h2>
      );
      i += 1;
    } else {
      const block: string[] = [];
      while (i < lines.length && !/^##\s+.+/.test(lines[i])) {
        block.push(lines[i]);
        i += 1;
      }
      const blockText = block.join('\n');
      if (blockText.trim()) {
        nodes.push(
          <div key={i} className="chat-content-block">
            {renderBlockWithHeadingsAndDates(blockText)}
          </div>
        );
      }
    }
  }
  if (nodes.length === 0) return renderBlockWithHeadingsAndDates(content);
  return <>{nodes}</>;
}

const SparkleIcon = ({ className = 'w-4 h-4', strokeWidth = 1.5 }: { className?: string; strokeWidth?: number }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" />
  </svg>
);

/** Returns pill keys in display order when we have multiple views (general + at least one framework). */
function getAssessmentPillKeys(assessments: ChatAssessments): ChatResponseView[] {
  const keys: ChatResponseView[] = ['general'];
  if (assessments.zoning?.trim()) keys.push('zoning');
  if (assessments.seqra?.trim()) keys.push('seqra');
  if (assessments.comprehensivePlan?.trim()) keys.push('comprehensivePlan');
  return keys.length > 1 ? keys : [];
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ documents, meetingMinutes = [], externalTriggerMessage, onMessageProcessed }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "I can answer questions about village documents and Board of Trustees meeting votes (e.g. who voted how, how many times). What would you like to know?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  /** Per-message index: which assessment view is active (general | zoning | seqra | comprehensivePlan). */
  const [activeAssessmentView, setActiveAssessmentView] = useState<Record<number, ChatResponseView>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const scrollToBottom = () => {
      el.scrollTop = el.scrollHeight;
    };
    scrollToBottom();
    requestAnimationFrame(scrollToBottom);
  }, [messages]);

  useEffect(() => {
    if (!isLoading && scrollRef.current) {
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight - el.clientHeight;
      });
    }
  }, [isLoading]);

  // Handle external triggers
  useEffect(() => {
    if (externalTriggerMessage) {
      processMessage(externalTriggerMessage);
      onMessageProcessed?.();
    }
  }, [externalTriggerMessage]);

  const processMessage = async (msgContent: string) => {
    if (!msgContent.trim() || isLoading) return;

    setMessages(prev => [...prev, { role: 'user', content: msgContent }]);
    setIsLoading(true);

    try {
      const result = await askChatQuestion(msgContent, { documents, meetings: meetingMinutes });
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: result.text || "No specific records matching your query were identified.",
        sources: result.sources,
        assessments: result.assessments,
      }]);
    } catch (error) {
      setMessages(prev => [...prev, { role: 'assistant', content: "CONNECTION ERROR: Document Intelligence Engine offline." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    const userMsg = input;
    setInput('');
    processMessage(userMsg);
  };

  return (
    <div className="chat-panel">
      <div className="chat-panel-header">
        <SparkleIcon className="chat-panel-header-icon" strokeWidth={1.5} />
        <span className="chat-panel-header-title">System</span>
      </div>

      <div ref={scrollRef} className="chat-messages scrollbar-hide">
        {messages.map((m, i) => {
          const pillKeys = m.role === 'assistant' && m.assessments ? getAssessmentPillKeys(m.assessments) : [];
          const activeView = (pillKeys.length > 1 ? (activeAssessmentView[i] ?? 'general') : 'general') as ChatResponseView;
          const displayContent = pillKeys.length > 1 && m.assessments
            ? (m.assessments[activeView] ?? m.assessments.general ?? m.content)
            : m.content;

          return (
            <div key={i} className={m.role === 'user' ? 'chat-message chat-message--user' : 'chat-message chat-message--assistant'}>
              <span className="chat-message-label">
                {m.role === 'user' ? 'User' : 'System'}
              </span>
              <div className={m.role === 'user' ? 'chat-message-bubble chat-message-bubble--user' : 'chat-message-bubble chat-message-bubble--assistant'}>
                {pillKeys.length > 1 && (
                  <div className="chat-assessment-pills" role="tablist" aria-label="Answer view">
                    {pillKeys.map((key) => (
                      <button
                        key={key}
                        type="button"
                        role="tab"
                        aria-selected={activeView === key}
                        aria-label={`Show ${ASSESSMENT_LABELS[key]} view`}
                        className={`chat-assessment-pill ${activeView === key ? 'chat-assessment-pill--active' : ''}`}
                        onClick={() => setActiveAssessmentView((prev) => ({ ...prev, [i]: key }))}
                      >
                        {ASSESSMENT_LABELS[key]}
                      </button>
                    ))}
                  </div>
                )}
                <div className="chat-message-content" role="tabpanel">
                  {m.role === 'assistant' ? renderAssistantContent(displayContent) : m.content}
                </div>
                {m.role === 'assistant' && m.assessments?.insights && m.assessments.insights.length > 0 && (
                  <div className="chat-insights">
                    <p className="chat-insights-title">Related patterns found</p>
                    <ul className="chat-insights-list">
                      {m.assessments.insights.map((insight, idx) => (
                        <li key={idx}>{insight}</li>
                      ))}
                    </ul>
                    <p className="chat-insights-prompt">Would you like to know more about any of these?</p>
                  </div>
                )}
                {m.role === 'assistant' && activeView === 'comprehensivePlan' && m.assessments?.comprehensivePlan?.trim() && (
                  <div className="chat-sources chat-comp-plan-more">
                    <a href={COMP_PLAN_PDF_URL} target="_blank" rel="noopener noreferrer" className="chat-source-link">
                      Village of Ballston Spa Comprehensive Plan (PDF)
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    </a>
                  </div>
                )}
                {m.sources && m.sources.length > 0 && (
                  <div className="chat-sources">
                    <p className="chat-sources-title">SOURCES</p>
                    <div className="chat-sources-list">
                      {m.sources.map((s, si) => (
                        <a key={si} href={s.url} target="_blank" rel="noopener noreferrer" className="chat-source-link">
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          {s.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {isLoading && (
          <div className="chat-loading">
            <span className="chat-loading-label">WORKING</span>
            <div className="chat-loading-dots">
              <div className="chat-loading-dot" />
              <div className="chat-loading-dot" />
              <div className="chat-loading-dot" />
            </div>
          </div>
        )}
      </div>

      <div className="chat-footer">
        <div className="chat-input-wrap">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask a question..."
            rows={2}
            className="chat-textarea"
            aria-label="Chat input"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="chat-send-btn"
            aria-label="Send message"
          >
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <p className="chat-powered-by">POWERED BY CLAUDE</p>
      </div>
    </div>
  );
};
