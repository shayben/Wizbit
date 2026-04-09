/**
 * Progress Dashboard — shows reading history, words that need practice,
 * and collected trophies.
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  loadSessions,
  loadPracticeWords,
  loadTrophies,
  type SessionRecord,
  type PracticeWord,
  type EarnedTrophy,
} from '../services/progressService';
import { ALL_TROPHIES } from '../services/trophyService';

interface ProgressDashboardProps {
  user: User;
  onClose: () => void;
}

type Tab = 'history' | 'practice' | 'trophies';

const ProgressDashboard: React.FC<ProgressDashboardProps> = ({ user, onClose }) => {
  const [tab, setTab] = useState<Tab>('history');
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [practiceWords, setPracticeWords] = useState<PracticeWord[]>([]);
  const [earnedTrophies, setEarnedTrophies] = useState<EarnedTrophy[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [s, p, t] = await Promise.all([
        loadSessions(user.uid),
        loadPracticeWords(user.uid),
        loadTrophies(user.uid),
      ]);
      setSessions(s);
      setPracticeWords(p);
      setEarnedTrophies(t);
    } finally {
      setLoading(false);
    }
  }, [user.uid]);

  useEffect(() => { reload(); }, [reload]);

  const earnedIds = new Set(earnedTrophies.map((t) => t.id));

  function formatDate(iso: string) {
    try {
      return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch { return iso; }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 md:p-6 max-w-lg md:max-w-2xl mx-auto w-full">
        <button
          type="button"
          onClick={onClose}
          className="text-indigo-500 font-medium text-sm md:text-base"
        >
          ← Back
        </button>
        <div className="flex-1">
          <h2 className="text-xl md:text-2xl font-bold text-indigo-700">My Progress</h2>
        </div>
        {user.photoURL && (
          <img
            src={user.photoURL}
            alt={user.displayName ?? ''}
            className="w-9 h-9 rounded-full border-2 border-indigo-200"
            referrerPolicy="no-referrer"
          />
        )}
      </div>

      {/* Summary chips */}
      <div className="flex gap-3 px-4 md:px-6 pb-3 max-w-lg md:max-w-2xl mx-auto w-full overflow-x-auto">
        <div className="flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 text-center min-w-[80px]">
          <p className="text-2xl md:text-3xl font-extrabold text-indigo-700">{sessions.length}</p>
          <p className="text-xs md:text-sm text-gray-400">Sessions</p>
        </div>
        <div className="flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 text-center min-w-[80px]">
          <p className="text-2xl md:text-3xl font-extrabold text-amber-500">{earnedIds.size}</p>
          <p className="text-xs md:text-sm text-gray-400">Trophies</p>
        </div>
        <div className="flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 text-center min-w-[80px]">
          <p className="text-2xl md:text-3xl font-extrabold text-red-500">{practiceWords.length}</p>
          <p className="text-xs md:text-sm text-gray-400">Practice</p>
        </div>
        {sessions.length > 0 && (
          <div className="flex-shrink-0 bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 text-center min-w-[80px]">
            <p className="text-2xl md:text-3xl font-extrabold text-green-600">
              {Math.round(sessions.reduce((s, r) => s + r.score, 0) / sessions.length)}
            </p>
            <p className="text-xs md:text-sm text-gray-400">Avg Score</p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-4 md:px-6 max-w-lg md:max-w-2xl mx-auto w-full">
        {(['history', 'practice', 'trophies'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2 md:py-3 rounded-xl text-sm md:text-base font-semibold transition-colors capitalize ${
              tab === t
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-white text-gray-500 border border-gray-100'
            }`}
          >
            {t === 'history' ? '📅 History' : t === 'practice' ? '🔁 Practice' : '🏆 Trophies'}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 md:px-6 pt-4 pb-8 max-w-lg md:max-w-2xl mx-auto w-full">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-10 h-10 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* ── History tab ── */}
            {tab === 'history' && (
              <div className="flex flex-col gap-3">
                {sessions.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm md:text-base py-10">
                    No reading sessions yet. Start reading to build your history!
                  </p>
                ) : (
                  sessions.map((s) => (
                    <div
                      key={s.id}
                      className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5 flex items-center gap-4"
                    >
                      <div className="text-3xl md:text-4xl">
                        {'⭐'.repeat(s.stars)}{'☆'.repeat(5 - s.stars)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-800 text-sm md:text-base truncate">{s.title}</p>
                        <p className="text-gray-400 text-xs md:text-sm">{formatDate(s.date)}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xl md:text-2xl font-extrabold text-indigo-700">{s.score}</p>
                        <p className="text-xs md:text-sm text-gray-400">/ 100</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Practice tab ── */}
            {tab === 'practice' && (
              <div className="flex flex-col gap-3">
                {practiceWords.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm md:text-base py-10">
                    No words need practice — keep up the great work! 🎉
                  </p>
                ) : (
                  <>
                    <p className="text-gray-500 text-xs md:text-sm">
                      These words appeared as mispronounced or skipped across your sessions. Keep practising!
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                      {practiceWords.map((pw) => (
                        <div
                          key={pw.word}
                          className="bg-white rounded-2xl border border-red-100 shadow-sm p-3 md:p-4 text-center"
                        >
                          <p className="text-base md:text-lg font-bold text-red-700 mb-1">{pw.word}</p>
                          <p className="text-xs md:text-sm text-gray-400">
                            {pw.failCount} {pw.failCount === 1 ? 'miss' : 'misses'}
                          </p>
                          <p className="text-[10px] md:text-xs text-gray-300 mt-0.5">
                            Last seen {formatDate(pw.lastSeen)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Trophies tab ── */}
            {tab === 'trophies' && (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                {ALL_TROPHIES.map((trophy) => {
                  const earned = earnedIds.has(trophy.id);
                  const earnedRecord = earnedTrophies.find((t) => t.id === trophy.id);
                  return (
                    <div
                      key={trophy.id}
                      className={`rounded-2xl border shadow-sm p-4 md:p-5 text-center transition-opacity ${
                        earned
                          ? 'bg-gradient-to-br from-amber-50 to-yellow-50 border-amber-200'
                          : 'bg-gray-50 border-gray-100 opacity-40'
                      }`}
                    >
                      <p className={`text-4xl md:text-5xl mb-2 ${earned ? '' : 'grayscale'}`}>
                        {earned ? trophy.emoji : '🔒'}
                      </p>
                      <p className={`text-sm md:text-base font-bold ${earned ? 'text-amber-700' : 'text-gray-400'}`}>
                        {trophy.name}
                      </p>
                      <p className="text-xs md:text-sm text-gray-400 mt-1 leading-snug">{trophy.description}</p>
                      {earned && earnedRecord && (
                        <p className="text-[10px] md:text-xs text-amber-400 mt-2">
                          Earned {formatDate(earnedRecord.earnedAt)}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ProgressDashboard;
