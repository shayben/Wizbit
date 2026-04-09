/**
 * Progress Dashboard — shows reading history, words that need practice,
 * and collected trophies.
 */

import React, { useEffect, useState, useCallback } from 'react';
import type { CurrentUser } from '../types/auth';
import {
  loadSessions,
  loadPracticeWords,
  loadTrophies,
  type SessionRecord,
  type PracticeWord,
  type EarnedTrophy,
} from '../services/progressService';
import { ALL_TROPHIES } from '../services/trophyService';
import { loadCollectedStickers, type CollectedSticker } from '../services/stickerAlbumService';

interface ProgressDashboardProps {
  user: CurrentUser;
  onClose: () => void;
}

type Tab = 'history' | 'practice' | 'trophies' | 'stickers' | 'analytics';

/** Simple skeleton placeholder bar. */
const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 rounded-lg ${className}`} />
);

/** Skeleton for a session card. */
const SessionSkeleton: React.FC = () => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5 flex items-center gap-4">
    <Skeleton className="w-20 h-5" />
    <div className="flex-1 space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-3 w-1/3" />
    </div>
    <Skeleton className="w-10 h-8" />
  </div>
);

/** Compute simple analytics from session data. */
function computeAnalytics(sessions: SessionRecord[]) {
  if (sessions.length === 0) return null;

  const sorted = [...sessions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const scores = sorted.map((s) => s.score);
  const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const bestScore = Math.max(...scores);

  // Last 5 vs previous 5 trend
  const recent = scores.slice(-5);
  const previous = scores.slice(-10, -5);
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const previousAvg = previous.length > 0 ? previous.reduce((a, b) => a + b, 0) / previous.length : recentAvg;
  const trend = recentAvg - previousAvg;

  // Sessions per week (last 4 weeks)
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const last4Weeks = sessions.filter((s) => now - new Date(s.date).getTime() < 4 * weekMs);
  const sessionsPerWeek = last4Weeks.length > 0 ? +(last4Weeks.length / 4).toFixed(1) : 0;

  // Unique reading days (streak-like stat)
  const uniqueDays = new Set(sessions.map((s) => new Date(s.date).toDateString()));

  // Score distribution
  const great = scores.filter((s) => s >= 80).length;
  const good = scores.filter((s) => s >= 50 && s < 80).length;
  const needsWork = scores.filter((s) => s < 50).length;

  return {
    avgScore, bestScore, trend, sessionsPerWeek,
    totalDays: uniqueDays.size, totalSessions: sessions.length,
    great, good, needsWork,
    recentScores: sorted.slice(-10).map((s) => ({ score: s.score, date: s.date })),
  };
}

const ProgressDashboard: React.FC<ProgressDashboardProps> = ({ user, onClose }) => {
  const [tab, setTab] = useState<Tab>('history');
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [practiceWords, setPracticeWords] = useState<PracticeWord[]>([]);
  const [earnedTrophies, setEarnedTrophies] = useState<EarnedTrophy[]>([]);
  const [collectedStickers, setCollectedStickers] = useState<CollectedSticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [s, p, t, stickers] = await Promise.all([
        loadSessions(user.uid),
        loadPracticeWords(user.uid),
        loadTrophies(user.uid),
        loadCollectedStickers(user.uid),
      ]);
      setSessions(s);
      setPracticeWords(p);
      setEarnedTrophies(t);
      setCollectedStickers(stickers);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load progress data');
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
          <p className="text-2xl md:text-3xl font-extrabold text-pink-500">{collectedStickers.length}</p>
          <p className="text-xs md:text-sm text-gray-400">Stickers</p>
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
        {(['history', 'practice', 'trophies', 'stickers', 'analytics'] as Tab[]).map((t) => {
          const icons: Record<Tab, string> = {
            history: '📅', practice: '🔁', trophies: '🏆', stickers: '🖼️', analytics: '📊',
          };
          const labels: Record<Tab, string> = {
            history: 'History', practice: 'Practice', trophies: 'Trophies', stickers: 'Stickers', analytics: 'Stats',
          };
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 py-2 md:py-3 rounded-xl text-xs md:text-sm font-semibold transition-colors ${
                tab === t
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white text-gray-500 border border-gray-100'
              }`}
            >
              {icons[t]}{' '}
              <span className="hidden sm:inline">{labels[t]}</span>
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 px-4 md:px-6 pt-4 pb-8 max-w-lg md:max-w-2xl mx-auto w-full">
        {loading ? (
          <div className="flex flex-col gap-3">
            {/* Skeleton loading state */}
            {tab === 'history' || tab === 'analytics' ? (
              <>
                <SessionSkeleton />
                <SessionSkeleton />
                <SessionSkeleton />
              </>
            ) : tab === 'practice' ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 md:gap-3">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 md:p-4 space-y-2">
                    <Skeleton className="h-5 w-2/3 mx-auto" />
                    <Skeleton className="h-3 w-1/2 mx-auto" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5 space-y-2">
                    <Skeleton className="h-10 w-10 mx-auto rounded-full" />
                    <Skeleton className="h-4 w-2/3 mx-auto" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <p className="text-red-600 text-sm text-center bg-red-50 rounded-xl p-3">
              {loadError}
            </p>
            <button
              type="button"
              onClick={reload}
              className="py-2 px-4 rounded-xl bg-indigo-500 text-white font-medium text-sm
                         active:bg-indigo-600 transition-colors"
            >
              Retry
            </button>
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
            {tab === 'trophies' && (() => {
              const categories: { key: string; label: string; emoji: string }[] = [
                { key: 'reading', label: 'Reading', emoji: '📖' },
                { key: 'score', label: 'Scores', emoji: '⭐' },
                { key: 'words', label: 'Vocabulary', emoji: '💪' },
                { key: 'streak', label: 'Consistency', emoji: '🔥' },
                { key: 'story', label: 'Adventures', emoji: '📝' },
                { key: 'mastery', label: 'Mastery', emoji: '🎓' },
              ];
              return (
                <div className="space-y-6">
                  <p className="text-center text-sm text-gray-400">
                    {earnedTrophies.length} / {ALL_TROPHIES.length} unlocked
                  </p>
                  {categories.map(({ key, label, emoji }) => {
                    const group = ALL_TROPHIES.filter((t) => t.category === key);
                    if (group.length === 0) return null;
                    return (
                      <div key={key}>
                        <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wide mb-3">
                          {emoji} {label}
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                          {group.map((trophy) => {
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
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* ── Stickers tab ── */}
            {tab === 'stickers' && (
              collectedStickers.length === 0 ? (
                <p className="text-center text-gray-400 text-sm md:text-base py-10">
                  Read stories to collect stickers! 🖼️
                </p>
              ) : (
                <div className="space-y-4">
                  <p className="text-center text-sm text-gray-400">
                    {collectedStickers.length} sticker{collectedStickers.length !== 1 ? 's' : ''} collected
                  </p>
                  <div className="grid grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                    {collectedStickers.map((sticker) => (
                      <div
                        key={sticker.id}
                        className="bg-gradient-to-br from-pink-50 to-purple-50 rounded-2xl border border-pink-100 shadow-sm p-3 md:p-4 text-center"
                      >
                        {sticker.stickerUrl ? (
                          <img
                            src={sticker.stickerUrl}
                            alt={sticker.label}
                            className="w-14 h-14 md:w-20 md:h-20 mx-auto object-contain drop-shadow-md"
                          />
                        ) : (
                          <span className="block text-4xl md:text-5xl drop-shadow-md">
                            {sticker.stickerEmoji ?? '🖼️'}
                          </span>
                        )}
                        <p className="text-xs md:text-sm font-bold text-purple-700 mt-2 capitalize leading-snug">
                          {sticker.label}
                        </p>
                        <p className="text-[10px] md:text-xs text-gray-400 mt-0.5 leading-snug line-clamp-2">
                          {sticker.caption}
                        </p>
                        {sticker.storyTitle && (
                          <p className="text-[9px] md:text-[10px] text-pink-400 mt-1">
                            📖 {sticker.storyTitle}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            )}

            {/* ── Analytics tab ── */}
            {tab === 'analytics' && (() => {
              const stats = computeAnalytics(sessions);
              if (!stats) {
                return (
                  <p className="text-center text-gray-400 text-sm md:text-base py-10">
                    Complete a few reading sessions to see your stats!
                  </p>
                );
              }
              const maxScore = Math.max(...stats.recentScores.map((s) => s.score), 1);
              return (
                <div className="flex flex-col gap-4">
                  {/* Summary stats */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                      <p className="text-3xl font-extrabold text-indigo-700">{stats.avgScore}</p>
                      <p className="text-xs text-gray-400">Avg Score</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                      <p className="text-3xl font-extrabold text-green-600">{stats.bestScore}</p>
                      <p className="text-xs text-gray-400">Best Score</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                      <p className="text-3xl font-extrabold text-purple-600">{stats.sessionsPerWeek}</p>
                      <p className="text-xs text-gray-400">Sessions / Week</p>
                    </div>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 text-center">
                      <p className="text-3xl font-extrabold text-amber-500">{stats.totalDays}</p>
                      <p className="text-xs text-gray-400">Reading Days</p>
                    </div>
                  </div>

                  {/* Trend */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <p className="text-sm font-semibold text-gray-600 mb-1">Recent Trend</p>
                    <p className={`text-lg font-bold ${
                      stats.trend > 2 ? 'text-green-600' : stats.trend < -2 ? 'text-red-600' : 'text-gray-500'
                    }`}>
                      {stats.trend > 2 ? '📈 Improving!' : stats.trend < -2 ? '📉 Needs attention' : '➡️ Steady'}
                      <span className="text-sm font-normal text-gray-400 ml-2">
                        ({stats.trend >= 0 ? '+' : ''}{Math.round(stats.trend)} pts vs previous)
                      </span>
                    </p>
                  </div>

                  {/* Simple bar chart of recent scores */}
                  {stats.recentScores.length > 1 && (
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                      <p className="text-sm font-semibold text-gray-600 mb-3">Last {stats.recentScores.length} Sessions</p>
                      <div className="flex items-end gap-1.5 h-24">
                        {stats.recentScores.map((s, i) => (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-[10px] text-gray-400">{s.score}</span>
                            <div
                              className={`w-full rounded-t-md transition-all ${
                                s.score >= 80 ? 'bg-green-400' : s.score >= 50 ? 'bg-amber-400' : 'bg-red-400'
                              }`}
                              style={{ height: `${(s.score / maxScore) * 80}%`, minHeight: '4px' }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Score distribution */}
                  <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
                    <p className="text-sm font-semibold text-gray-600 mb-2">Score Distribution</p>
                    <div className="flex gap-3">
                      <div className="flex-1 text-center">
                        <p className="text-xl font-bold text-green-600">{stats.great}</p>
                        <p className="text-xs text-gray-400">Great (80+)</p>
                      </div>
                      <div className="flex-1 text-center">
                        <p className="text-xl font-bold text-amber-500">{stats.good}</p>
                        <p className="text-xs text-gray-400">Good (50–79)</p>
                      </div>
                      <div className="flex-1 text-center">
                        <p className="text-xl font-bold text-red-500">{stats.needsWork}</p>
                        <p className="text-xs text-gray-400">Practice (&lt;50)</p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
};

export default ProgressDashboard;
