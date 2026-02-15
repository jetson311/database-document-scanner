
import React, { useState, useRef, useEffect } from 'react';
import { askDocumentQuestion } from '../services/anthropicService';
import { VillageDocument } from '../types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: { title: string; url: string }[];
}

interface ChatPanelProps {
  documents: VillageDocument[];
  externalTriggerMessage?: string | null;
  onMessageProcessed?: () => void;
}

const SparkleIcon = ({ className = 'w-4 h-4', strokeWidth = 1.5 }: { className?: string; strokeWidth?: number }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={strokeWidth} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" />
  </svg>
);

export const ChatPanel: React.FC<ChatPanelProps> = ({ documents, externalTriggerMessage, onMessageProcessed }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "I can answer questions about documents, meetings, and this page. What would you like to know?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
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
      const result = await askDocumentQuestion(msgContent, documents);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: result.text || "No specific records matching your query were identified.",
        sources: result.sources
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
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'chat-message chat-message--user' : 'chat-message chat-message--assistant'}>
            <span className="chat-message-label">
              {m.role === 'user' ? 'User' : 'System'}
            </span>
            <div className={m.role === 'user' ? 'chat-message-bubble chat-message-bubble--user' : 'chat-message-bubble chat-message-bubble--assistant'}>
              <div className="chat-message-content">{m.content}</div>
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
        ))}
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
