import React from 'react';

/** Returns text with phrase matches wrapped in <mark className="search-highlight">. Case-insensitive. */
export function highlightSearchPhrase(text: string, phrase: string): React.ReactNode {
  const trimmed = phrase.trim();
  if (!trimmed || !text) return text;
  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = String(text).split(regex);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    i % 2 === 1 ? <mark key={i} className="search-highlight">{part}</mark> : part
  );
}
