
import React, { useState, useRef, useEffect } from 'react';
import { askDocumentQuestion } from '../services/geminiService';
import { MOCK_DOCUMENTS } from '../constants';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: { title: string; url: string }[];
}

interface ChatPanelProps {
  externalTriggerMessage?: string | null;
  onMessageProcessed?: () => void;
}

const SparkleIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" />
  </svg>
);

export const ChatPanel: React.FC<ChatPanelProps> = ({ externalTriggerMessage, onMessageProcessed }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "SYSTEM ONLINE. I am the intelligence engine for Ballston Spa's archive. How can I assist you with document research today?" }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
      const result = await askDocumentQuestion(msgContent, MOCK_DOCUMENTS);
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
    <div className="flex flex-col h-full bg-white font-sans border-l border-slate-200">
      <div className="p-6 bg-slate-900 text-white flex items-center justify-between border-b border-white/10 shadow-lg">
        <div className="flex items-center gap-4">
          <SparkleIcon className="w-5 h-5 text-indigo-400" />
          <h3 className="font-bold text-[14px] uppercase tracking-[0.4em]">SYSTEM INTEL</h3>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-hide">
        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in slide-in-from-bottom-4 duration-500`}>
            <span className="text-[12px] font-bold uppercase text-slate-300 mb-2 tracking-[0.3em]">
              {m.role === 'user' ? 'Transmission' : 'Intelligence Output'}
            </span>
            <div className={`max-w-[100%] p-6 rounded-lg text-[14px] leading-relaxed transition-all shadow-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-800 border border-slate-200'}`}>
              <div className="whitespace-pre-wrap font-bold tracking-tight">{m.content}</div>
              {m.sources && m.sources.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-200/50">
                  <p className="text-[12px] uppercase font-bold text-slate-400 mb-3 tracking-[0.3em]">SOURCES</p>
                  <div className="flex flex-col gap-2">
                    {m.sources.map((s, si) => (
                      <a key={si} href={s.url} target="_blank" className="text-[14px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-3 transition-colors group">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
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
          <div className="flex flex-col items-start animate-pulse">
             <span className="text-[12px] font-bold uppercase text-slate-300 mb-2 tracking-[0.3em]">WORKING</span>
             <div className="flex gap-2 items-center bg-slate-50 px-4 py-3 rounded-full">
                <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce"></div>
                <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce delay-100"></div>
                <div className="w-1.5 h-1.5 bg-indigo-600 rounded-full animate-bounce delay-200"></div>
             </div>
          </div>
        )}
      </div>

      <div className="p-8 bg-slate-50 border-t border-slate-200">
        <div className="relative group">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder="Search records or ask questions..."
            rows={2}
            className="w-full bg-white border border-slate-200 rounded-lg p-5 pr-14 text-[15px] font-bold focus:outline-none focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 transition-all resize-none shadow-sm placeholder:text-slate-300 tracking-tight"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            className="absolute right-4 bottom-7 p-2.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-20 transition-all shadow-lg active:scale-90"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <p className="mt-4 text-[11px] text-slate-400 text-center font-bold uppercase tracking-[0.5em]">POWERED BY GEMINI 3 FLASH</p>
      </div>
    </div>
  );
};
