/**
 * ParentReport — the weekly summary for the grown-up.
 *
 * Answers the questions a parent actually asks (did they practise, is it
 * getting easier, what is still shaky) and names concrete things to do,
 * rather than showing another chart to interpret.
 */

import React, { useEffect, useState } from 'react';
import ProgressRing from './common/ProgressRing';
import { buildParentReport, type ParentReport as Report } from '../services/parentReportService';
import { loadSessions } from '../services/progressService';
import { loadMathSessions } from '../services/mathService';
import { loadFactState } from '../services/mathFactService';
import { loadSightWordProgress } from '../services/sightWordService';
import { loadSpellingProgress } from '../services/spellingService';
import { loadDailyState } from '../services/dailyPlanService';
import type { ChildProfile } from '../services/profileService';

export interface ParentReportProps {
  scopedUid: string | null;
  profile: ChildProfile | null;
  onClose: () => void;
}

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-4 text-center">
      <p className="text-2xl md:text-3xl font-extrabold text-slate-700">{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

const ParentReport: React.FC<ParentReportProps> = ({ scopedUid, profile, onClose }) => {
  const [report, setReport] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const name = profile?.name ?? 'Your learner';
    const grade = profile?.grade ?? '1';

    Promise.all([
      scopedUid ? loadSessions(scopedUid) : Promise.resolve([]),
      loadMathSessions(scopedUid),
      loadFactState(scopedUid),
      loadSightWordProgress(scopedUid),
      loadSpellingProgress(scopedUid),
      loadDailyState(scopedUid),
    ])
      .then(([readingSessions, mathSessions, factState, sightWords, spellingWords, dailyState]) => {
        if (cancelled) return;
        setReport(buildParentReport({
          learnerName: name,
          grade,
          readingSessions,
          mathSessions,
          factState,
          sightWords,
          spellingWords,
          dailyState,
        }));
      })
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => { cancelled = true; };
  }, [scopedUid, profile]);

  if (failed) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-3xl bg-white border border-slate-100 p-7 text-center">
          <p className="font-bold text-slate-700">Could not load the report right now.</p>
          <button type="button" onClick={onClose} className="w-full mt-5 py-3 rounded-2xl bg-slate-700 text-white font-bold">
            Back
          </button>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-3">
        <div className="w-12 h-12 border-4 border-slate-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-slate-500 font-medium">Putting the week together…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-5 md:p-10">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button type="button" onClick={onClose} className="text-slate-600 font-semibold">← Back</button>
          <h1 className="flex-1 text-center text-xl md:text-2xl font-extrabold text-slate-800">
            {report.learnerName}'s week
          </h1>
          <span className="w-12" />
        </div>

        <section aria-label="This week at a glance" className="rounded-3xl bg-white border border-slate-100 p-5 md:p-6">
          <div className="flex items-center gap-5">
            <ProgressRing
              percent={(report.activeDays / 7) * 100}
              size={92}
              label={`${report.activeDays}/7`}
              sublabel="days"
              colorClass="text-slate-600"
              trackClass="text-slate-100"
            />
            <div className="flex-1">
              <h2 className="font-extrabold text-slate-800 text-lg">This week</h2>
              <ul className="mt-1 space-y-1">
                {report.highlights.map((highlight) => (
                  <li key={highlight} className="text-sm text-slate-600">• {highlight}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
          <Stat value={report.readingSessions} label="Reading sessions" />
          <Stat value={report.wordsRead.toLocaleString()} label="Words read" />
          <Stat value={report.fluencyWcpm ?? '—'} label="Words / minute" />
          <Stat value={`${report.mathAccuracy}%`} label="Math accuracy" />
          <Stat value={report.mathQuestions} label="Math questions" />
          <Stat value={`${report.factsFluent}/${report.factsTotal}`} label="Facts instant" />
          <Stat value={report.sightWordsMastered} label="Sight words" />
          <Stat value={report.currentStreak} label="Day streak" />
        </div>

        {report.fluency && (
          <section className="rounded-3xl bg-white border border-slate-100 p-5 mt-4">
            <h2 className="font-extrabold text-slate-800">Reading fluency</h2>
            <p className="text-sm text-slate-600 mt-1">
              {report.fluencyWcpm} words correct per minute · grade {report.grade} target is {report.fluency.target}.
            </p>
            <p className="text-sm font-semibold text-slate-700 mt-2">{report.fluency.label}</p>
          </section>
        )}

        {report.wordsToWatch.length > 0 && (
          <section className="rounded-3xl bg-white border border-slate-100 p-5 mt-4">
            <h2 className="font-extrabold text-slate-800">Words to watch</h2>
            <div className="flex flex-wrap gap-2 mt-3">
              {report.wordsToWatch.map((word) => (
                <span key={word} className="rounded-xl bg-amber-50 text-amber-800 px-3 py-1.5 text-sm font-bold">
                  {word}
                </span>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-3xl bg-slate-800 text-white p-5 md:p-6 mt-4">
          <h2 className="font-extrabold text-lg">Try this week</h2>
          <ul className="mt-3 space-y-2">
            {report.suggestions.map((suggestion) => (
              <li key={suggestion} className="text-sm text-slate-200 flex gap-2">
                <span aria-hidden="true">→</span>
                <span>{suggestion}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
};

export default ParentReport;
