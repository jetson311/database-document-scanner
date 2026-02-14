
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MOCK_DOCUMENTS, MOCK_VOTES, BOARD_MEMBERS } from './constants';
import { DocCategory, VillageDocument, BoardAnalysis, DocType, VoteRecord } from './types';
import { ChatPanel } from './components/ChatPanel';
import { analyzeVotingRecord } from './services/geminiService';

type TabView = 'Documents' | 'Voting History';
type ViewMode = 'category' | 'type' | 'date';

const SparkleIcon = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-7.714 2.143L11 21l-2.286-6.857L1 12l7.714-2.143L11 3z" />
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
    <div className="flex items-center gap-3 w-full max-w-[180px]" ref={dropdownRef}>
      <label className="text-[12px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">
        {label}
      </label>
      <div className="relative flex-1 min-w-0">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center justify-between gap-2 bg-white border border-slate-200 rounded-full px-4 py-2.5 text-[13px] font-bold text-slate-700 hover:border-indigo-400 transition-all w-full shadow-sm active:scale-95 overflow-hidden"
        >
          <span className="truncate">{buttonText}</span>
          <ChevronDownIcon className={`w-2.5 h-2.5 shrink-0 transition-transform duration-200 text-slate-400 ${isOpen ? 'rotate-180' : ''}`} />
        </button>
        
        {isOpen && (
          <div className="absolute z-[60] mt-2 w-full min-w-[200px] bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="p-2 space-y-0.5 max-h-[300px] overflow-y-auto">
              <label className="flex items-center gap-3 px-3 py-2.5 rounded text-[13px] font-bold transition-colors hover:bg-slate-50 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={selected.includes("All")}
                  onChange={() => onToggle("All")}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span>{allOptionLabel}</span>
              </label>
              <div className="h-px bg-slate-100 my-1"></div>
              {options.map(opt => (
                <label key={opt} className="flex items-center gap-3 px-3 py-2.5 rounded text-[13px] font-bold transition-colors hover:bg-slate-50 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={selected.includes(opt)}
                    onChange={() => onToggle(opt)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
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

const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState<TabView>('Documents');
  const [viewMode, setViewMode] = useState<ViewMode>('category');
  const [searchQuery, setSearchQuery] = useState('');
  const [aiQuery, setAiQuery] = useState('');
  const [isNoticeVisible, setIsNoticeVisible] = useState(true);
  
  const [selectedYears, setSelectedYears] = useState<string[]>(['2025']);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(['All']);
  
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [analysis, setAnalysis] = useState<BoardAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [externalAiMessage, setExternalAiMessage] = useState<string | null>(null);
  
  const [visibleMembers, setVisibleMembers] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    Object.values(BOARD_MEMBERS).flat().forEach(m => initial[m] = true);
    return initial;
  });

  const handleAiAsk = (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuery.trim()) return;
    setExternalAiMessage(aiQuery);
    setAiQuery('');
    setIsChatExpanded(true);
  };

  const handleAnalyze = async (doc: VillageDocument) => {
    setIsAnalyzing(true);
    setAnalysis(null);
    try {
      const result = await analyzeVotingRecord(doc);
      setAnalysis(result);
    } catch (error) {
      console.error("Analysis failed:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const filteredDocs = useMemo<VillageDocument[]>(() => {
    return MOCK_DOCUMENTS.filter(doc => {
      const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           (doc.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
      
      const docYear = doc.date.split('-')[0];
      const matchesYear = selectedYears.includes(docYear);
      const matchesCategory = selectedCategories.includes('All') || selectedCategories.includes(doc.category);
      
      return matchesSearch && matchesYear && matchesCategory;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [searchQuery, selectedYears, selectedCategories]);

  const groupedData = useMemo<Record<string, VillageDocument[]>>(() => {
    const groups: Record<string, VillageDocument[]> = {};
    filteredDocs.forEach(doc => {
      let key = 'Archive';
      if (viewMode === 'category') key = doc.category;
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

  const toggleMember = (name: string) => {
    setVisibleMembers(prev => ({ ...prev, [name]: !prev[name] }));
  };

  const renderVotingMatrix = () => {
    const boards = [DocCategory.BOARD_OF_TRUSTEES, DocCategory.PLANNING_BOARD, DocCategory.ZONING_BOARD];
    const votesFiltered = MOCK_VOTES.filter(v => {
      const year = v.date.split('-')[0];
      return selectedYears.includes(year) && (selectedCategories.includes('All') || selectedCategories.includes(v.category));
    });
    
    return (
      <div className="space-y-10 max-w-6xl mx-auto">
        {isNoticeVisible && (
          <div className="bg-amber-50 border border-amber-200 p-8 rounded-lg text-amber-900 text-[15px] leading-relaxed shadow-sm relative animate-in fade-in slide-in-from-top-2">
            <button 
              onClick={() => setIsNoticeVisible(false)}
              className="absolute top-4 right-4 p-1 text-amber-500 hover:text-amber-800 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <p className="font-bold mb-2 uppercase tracking-[0.2em] flex items-center gap-2 text-amber-800">
              <SparkleIcon className="w-5 h-5" />
              AI GENERATED RECORD
            </p>
            This voting record is automatically generated by AI analysis of meeting minutes. 
            Results should be <strong>independently verified</strong> against official village records before use.
          </div>
        )}

        {boards.map(board => {
          const members = BOARD_MEMBERS[board];
          const votes = votesFiltered.filter(v => v.category === board);
          if (votes.length === 0) return null;

          return (
            <section key={board} className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
              <div className="px-8 py-6 flex justify-between items-center border-b border-slate-100 bg-slate-50/30">
                <div className="flex items-center gap-3">
                  <h3 className="text-[14px] font-bold uppercase tracking-widest text-slate-700">{board}</h3>
                </div>
                
                <div className="max-w-[180px] w-full">
                  <MultiSelectDropdown 
                    label="FILTER MEMBERS"
                    options={members}
                    selected={members.filter(m => visibleMembers[m])}
                    onToggle={(m) => toggleMember(m)}
                    allOptionLabel="Hide/Show All"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-[14px]">
                  <thead className="bg-slate-50 border-b border-slate-100">
                    <tr>
                      <th className="p-6 w-64 font-bold text-slate-500 uppercase tracking-widest text-[12px]">Resolution</th>
                      <th className="p-6 w-56 font-bold text-slate-500 uppercase tracking-widest text-[12px]">Context</th>
                      {members.filter(m => visibleMembers[m]).map(m => (
                        <th key={m} className="px-2 py-6 text-center font-bold text-slate-500 uppercase tracking-widest border-l border-slate-100 text-[11px] group relative min-w-[60px]" title={m}>
                          <span className="cursor-help">{m.slice(0, 3)}</span>
                        </th>
                      ))}
                      <th className="p-6 text-center font-bold text-slate-500 uppercase tracking-widest border-l border-slate-100 text-[12px]">Result</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {votes.map(vote => (
                      <tr key={vote.id} className="hover:bg-slate-50 transition-colors">
                        <td className="p-6">
                          <div className="font-bold text-slate-900 text-[16px] mb-2 leading-tight">{vote.motion}</div>
                          <div className="flex items-center gap-3">
                            <a href={vote.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-indigo-600 hover:underline text-[13px] font-bold">
                              <span>{vote.date}</span>
                              <ExternalLinkIcon className="w-3.5 h-3.5" />
                            </a>
                          </div>
                        </td>
                        <td className="p-6 text-slate-600 leading-relaxed font-medium text-[14px]">"{vote.description}"</td>
                        {members.filter(m => visibleMembers[m]).map(m => {
                          const v = vote.votes.find(mv => mv.memberName === m);
                          return (
                            <td key={m} className="px-2 py-6 text-center border-l border-slate-100 font-bold text-[12px]">
                              {v?.status === 'Aye' && <span className="text-emerald-600">YES</span>}
                              {v?.status === 'No' && <span className="text-rose-600">NO</span>}
                              {v?.status === 'Abstain' && <span className="text-amber-500">ABS</span>}
                              {!v && <span className="text-slate-300">—</span>}
                            </td>
                          );
                        })}
                        <td className="p-6 text-center border-l border-slate-100">
                           <span className={`px-4 py-1.5 rounded-full font-bold uppercase text-[12px] tracking-wider text-white shadow-sm ${vote.result === 'Passed' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
                             {vote.result}
                           </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen flex bg-[#f8f9fa] antialiased overflow-hidden">
      <div className="flex-1 flex flex-col min-w-0 h-screen transition-all relative">
        
        {/* Top Header */}
        <header className="bg-white px-6 py-6 sticky top-0 z-40 shadow-sm shrink-0">
          <div className="max-w-6xl mx-auto flex justify-between items-start gap-4">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <SparkleIcon className="text-slate-900 w-5 h-5 shrink-0" />
                <h1 className="text-xl font-bold text-slate-900 tracking-tight leading-none uppercase truncate">VILLAGE OF BSPA DOCUMENT ENGINE</h1>
              </div>
              <p className="text-[14px] text-slate-500 italic mt-2 font-bold truncate">*Resident created, not official village tool</p>
            </div>

            <div className="flex bg-slate-100 p-1 rounded-full gap-1 shadow-inner shrink-0">
              {(['Documents', 'Voting History'] as TabView[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setCurrentTab(tab)}
                  className={`px-4 md:px-8 py-2 rounded-full text-[13px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${currentTab === tab ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* AI Sticky Button */}
        <button 
          onClick={() => setIsChatExpanded(!isChatExpanded)}
          style={{ right: isChatExpanded ? '480px' : '30px' }}
          className="fixed bottom-[30px] z-[70] p-4 rounded-full transition-all duration-500 border shadow-2xl active:scale-95 bg-slate-900 text-white border-slate-900"
        >
          <SparkleIcon className="w-6 h-6" />
        </button>

        {/* Filter Area - Only on Documents tab */}
        {currentTab === 'Documents' && (
          <div className="bg-white border-b border-slate-50 sticky top-0 z-30 py-6 px-6 shrink-0 overflow-visible">
            <div className="max-w-6xl mx-auto flex flex-col gap-6">
              <div className="flex flex-wrap items-center gap-10">
                <div className="shrink-0">
                  <MultiSelectDropdown 
                    label="TYPE"
                    options={Object.values(DocCategory)}
                    selected={selectedCategories}
                    onToggle={(c) => handleToggleFilter(c, selectedCategories, setSelectedCategories)}
                  />
                </div>
                <div className="shrink-0">
                  <MultiSelectDropdown 
                    label="YEAR"
                    options={['2025', '2026']}
                    selected={selectedYears}
                    onToggle={(y) => handleToggleFilter(y, selectedYears, setSelectedYears)}
                  />
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <label className="text-[12px] font-bold text-slate-500 uppercase tracking-widest whitespace-nowrap">LAYOUT</label>
                  <div className="flex bg-slate-100 p-1 rounded-full gap-1">
                    {(['category', 'type', 'date'] as ViewMode[]).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setViewMode(mode)}
                        className={`px-4 py-2 rounded-full text-[13px] font-bold uppercase transition-all whitespace-nowrap ${viewMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-6">
                <div className="relative w-full max-w-[250px] flex items-center">
                  <svg className="w-5 h-5 text-slate-400 absolute left-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    placeholder="Search by keyword"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-100 border border-slate-200 rounded-full py-2.5 px-12 text-[14px] font-medium focus:bg-white focus:border-indigo-100 outline-none transition-all shadow-inner"
                  />
                </div>

                <form onSubmit={handleAiAsk} className="relative w-full max-w-[300px] flex items-center">
                  <div className="absolute left-4 flex items-center pointer-events-none">
                    <SparkleIcon className="text-slate-400 w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    placeholder="Ask AI..."
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    className="w-full bg-indigo-50/50 border border-indigo-100 rounded-full py-2.5 px-11 text-[14px] font-medium focus:bg-white focus:border-indigo-300 outline-none transition-all shadow-sm"
                  />
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#f8f9fa]">
          <div className="max-w-6xl mx-auto min-w-0">
            {currentTab === 'Voting History' ? renderVotingMatrix() : (
              <div className="space-y-10">
                {Object.keys(groupedData).length > 0 ? (
                  (Object.entries(groupedData) as [string, VillageDocument[]][]).map(([groupName, docs]) => (
                    <section key={groupName} className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="flex items-center justify-between gap-4 mb-4 border-b border-slate-100 pb-2">
                        <h2 className="text-[14px] font-bold text-slate-400 uppercase tracking-[0.4em] truncate">
                          {groupName}
                        </h2>
                        <span className="text-[14px] font-bold text-slate-400 tracking-widest uppercase whitespace-nowrap">{docs.length} RECORDS</span>
                      </div>
                      
                      <div className="flex flex-col space-y-1">
                        {docs.map(doc => (
                          <div 
                            key={doc.id} 
                            className="group flex flex-col md:flex-row items-start md:items-center justify-between gap-4 py-3 px-6 rounded-lg transition-all hover:bg-slate-100/50 border-transparent border"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-1 flex-wrap">
                                <a 
                                  href={doc.url} 
                                  target="_blank" 
                                  className="text-[15px] font-bold text-slate-900 hover:text-indigo-600 transition-colors truncate block tracking-tight flex items-center gap-2"
                                >
                                  {doc.title}
                                  <ExternalLinkIcon className="w-3.5 h-3.5 opacity-40" />
                                </a>
                                <span className="text-[11px] font-medium text-slate-400 bg-slate-200/20 px-2.5 py-0.5 rounded-full leading-none shrink-0 uppercase tracking-wider">
                                  {doc.type}
                                </span>
                              </div>
                              {doc.summary && (
                                <p className="text-[13px] text-slate-500 font-medium leading-relaxed line-clamp-1">
                                  {doc.summary}
                                </p>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity shrink-0">
                              {doc.type === DocType.MINUTES && (
                                <button 
                                  onClick={() => handleAnalyze(doc)}
                                  className="flex items-center gap-2 text-[12px] font-bold text-white bg-indigo-600 px-5 py-2 rounded-full uppercase tracking-wider hover:bg-indigo-700 shadow-md transition-all active:scale-95"
                                >
                                  <SparkleIcon />
                                  <span>ANALYZE</span>
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>
                  ))
                ) : (
                  <div className="flex flex-col items-center justify-center py-32 text-center">
                    <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-6 text-slate-300">
                      <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    </div>
                    <h3 className="text-xl font-bold text-slate-900 uppercase tracking-wider">NOTHING FOUND</h3>
                    <button onClick={() => { setSearchQuery(''); setSelectedYears(['2025']); setSelectedCategories(['All']); }} className="mt-4 text-indigo-600 font-bold text-[13px] uppercase tracking-wider hover:underline underline-offset-4">RESTORE ARCHIVE</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* AI Assistant Sidebar */}
      <aside 
        className={`h-screen border-l border-slate-200 bg-white transition-all duration-500 flex flex-col z-50 overflow-hidden shrink-0
          ${isChatExpanded ? 'w-full md:w-[450px]' : 'w-0 border-none'}`}
      >
        <div className="flex-1 relative w-[450px]">
          <ChatPanel externalTriggerMessage={externalAiMessage} onMessageProcessed={() => setExternalAiMessage(null)} />
        </div>
      </aside>

      {/* AI Analysis Overlay */}
      {(isAnalyzing || analysis) && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white rounded-lg w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col shadow-2xl border border-white/20 animate-in zoom-in-95 duration-500">
            <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-6">
                <span className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2 rounded-full font-bold text-[14px] uppercase tracking-widest shadow-lg">
                  <SparkleIcon />
                  ANALYSIS
                </span>
                <h2 className="text-lg font-bold text-slate-900 tracking-tight uppercase">Meeting Intelligence</h2>
              </div>
              <button 
                onClick={() => { setAnalysis(null); setIsAnalyzing(false); }} 
                className="p-2.5 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded-full transition-all"
              >
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 md:p-10">
               {isAnalyzing ? (
                 <div className="flex flex-col items-center justify-center h-80 space-y-6">
                   <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                   <p className="text-[14px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">Scanning Public Records...</p>
                 </div>
               ) : (
                 analysis && (
                   <div className="space-y-16 max-w-3xl mx-auto">
                    <div className="relative">
                      <p className="text-slate-900 text-2xl md:text-3xl font-bold leading-tight text-center tracking-tight">
                        {analysis.summary}
                      </p>
                    </div>

                    {analysis.votes.length > 0 && (
                      <div className="space-y-10">
                         <h3 className="text-sm font-bold text-slate-400 uppercase tracking-[0.5em] text-center">RESOLUTION DATA</h3>
                         <div className="grid gap-6">
                           {analysis.votes.map((v, i) => (
                             <div key={i} className="bg-white p-6 md:p-8 rounded-lg border border-slate-100 hover:shadow-lg transition-all">
                               <div className="flex justify-between items-start mb-6 pb-4 border-b border-slate-50 gap-4">
                                 <h4 className="text-lg md:text-xl font-bold text-slate-900 leading-tight tracking-tight">{v.motion}</h4>
                                 <span className={`shrink-0 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-widest shadow-sm ${v.result === 'Passed' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>{v.result}</span>
                               </div>
                               <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                                 <div className="space-y-1">
                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">MOVER</p>
                                    <p className="text-[14px] font-bold text-slate-900">{v.proposer}</p>
                                 </div>
                                 <div className="space-y-1">
                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">SECONDER</p>
                                    <p className="text-[14px] font-bold text-slate-900">{v.seconder}</p>
                                 </div>
                                 <div className="col-span-2 space-y-1">
                                   <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">AYES</p>
                                   <p className="text-[13px] font-bold text-emerald-800 leading-relaxed">{v.ayes.join(', ')}</p>
                                 </div>
                               </div>
                             </div>
                           ))}
                         </div>
                      </div>
                    )}
                   </div>
                 )
               )}
            </div>
            <div className="px-8 py-4 bg-slate-900 border-t border-slate-800 flex justify-between items-center text-white shrink-0">
               <span className="text-[11px] font-bold uppercase tracking-[0.3em] opacity-50 truncate">Archive Data Authenticated</span>
               <span className="flex items-center gap-2 text-[11px] font-bold text-indigo-400 uppercase tracking-[0.3em] shrink-0">
                 <SparkleIcon className="w-3.5 h-3.5" />
                 MUNICIPAL AI
               </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
