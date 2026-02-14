
import React from 'react';
import { VillageDocument } from '../types';
import { CATEGORY_COLORS } from '../constants';

interface Props {
  doc: VillageDocument;
  onAnalyze?: (doc: VillageDocument) => void;
}

export const DocumentCard: React.FC<Props> = ({ doc, onAnalyze }) => {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex justify-between items-start mb-2">
        <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${CATEGORY_COLORS[doc.category]}`}>
          {doc.category}
        </span>
        <span className="text-slate-400 text-xs font-mono">{doc.date}</span>
      </div>
      <h3 className="text-slate-800 font-semibold mb-2 group-hover:text-indigo-600 transition-colors">
        {doc.title}
      </h3>
      {doc.summary && (
        <p className="text-slate-500 text-sm mb-3 line-clamp-2 italic">
          "{doc.summary}"
        </p>
      )}
      <div className="flex items-center gap-3 mt-4">
        <a
          href={doc.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-md transition-colors"
        >
          View PDF / Page
        </a>
        {onAnalyze && (
          <button
            onClick={() => onAnalyze(doc)}
            className="text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-md transition-colors"
          >
            AI Analyze Votes
          </button>
        )}
      </div>
    </div>
  );
};
