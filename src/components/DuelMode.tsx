/**
 * DuelMode — two learners, one device, taking turns.
 *
 * Siblings sharing a device is the norm rather than the exception, and it only
 * becomes a fair game once each player answers from their *own* grade level.
 * Each player gets facts drawn from their own profile's grade, so a first
 * grader and a third grader can genuinely compete; the contest is over how you
 * do on your questions, not over who drew the easier ones.
 */

import React, { useCallback, useMemo, useState } from 'react';
import NumberPad from './common/NumberPad';
import ProgressRing from './common/ProgressRing';
import {
  currentTurn,
  isDuelComplete,
  pointsForAnswer,
  scoreDuel,
  type DuelAnswer,
  type DuelPlayer,
} from '../services/duelService';
import { buildFactDrill, type FactState, type MathFact } from '../services/mathFactService';
import { gradeIndex, type GradeCode } from '../types/grade';
import type { ChildProfile } from '../services/profileService';

export interface DuelModeProps {
  /** At least two learner profiles from the account. */
  profiles: ChildProfile[];
  roundsPerPlayer?: number;
  onExit: () => void;
}

const EMPTY_STATE: FactState = { srs: {}, stats: {} };

/** Operation appropriate to a grade — first graders add, older ones multiply. */
function operationForGrade(grade: GradeCode) {
  return gradeIndex(grade) <= 1 ? 'add' as const : 'mul' as const;
}

const DuelMode: React.FC<DuelModeProps> = ({ profiles, roundsPerPlayer = 5, onExit }) => {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => profiles.slice(0, 2).map((p) => p.id));
  const [started, setStarted] = useState(false);
  const [answers, setAnswers] = useState<DuelAnswer[]>([]);
  const [entered, setEntered] = useState('');
  /**
   * Feedback for the answer just given. It carries its own question and player
   * so it can still be shown after the final answer, when there is no next
   * turn to render from.
   */
  const [flash, setFlash] = useState<
    { correct: boolean; points: number; question: MathFact; player: DuelPlayer } | null
  >(null);
  const [askedAt, setAskedAt] = useState(() => Date.now());

  const players: DuelPlayer[] = useMemo(
    () => profiles
      .filter((profile) => selectedIds.includes(profile.id))
      .map((profile) => ({ id: profile.id, name: profile.name, emoji: profile.emoji })),
    [profiles, selectedIds],
  );

  /**
   * Each player's question bank, drawn at their own grade. Built once per duel
   * so both players face a stable set for the whole round.
   */
  const banks = useMemo(() => {
    const map = new Map<string, MathFact[]>();
    for (const profile of profiles) {
      if (!selectedIds.includes(profile.id)) continue;
      map.set(profile.id, buildFactDrill({
        state: EMPTY_STATE,
        operation: operationForGrade(profile.grade),
        size: roundsPerPlayer,
      }));
    }
    return map;
  }, [profiles, selectedIds, roundsPerPlayer]);

  const turnPlayer = currentTurn(players, answers.length);
  // The final answer still shows its feedback: jumping straight to the results
  // would deny the last player the "did I get it?" moment everyone else got.
  const complete = isDuelComplete(players, answers, roundsPerPlayer) && flash === null;
  const lastAnswer = isDuelComplete(players, answers, roundsPerPlayer);

  const questionIndex = turnPlayer
    ? answers.filter((answer) => answer.playerId === turnPlayer.id).length
    : 0;
  const question = turnPlayer ? banks.get(turnPlayer.id)?.[questionIndex] : undefined;

  const submit = useCallback(() => {
    if (!turnPlayer || !question) return;
    const value = Number(entered);
    const correct = Number.isFinite(value) && value === question.answer;
    const responseMs = Math.max(0, Date.now() - askedAt);

    setAnswers((previous) => [...previous, { playerId: turnPlayer.id, correct, responseMs }]);
    setFlash({ correct, points: pointsForAnswer(correct, responseMs), question, player: turnPlayer });
    setEntered('');
  }, [turnPlayer, question, entered, askedAt]);

  const continueTurn = useCallback(() => {
    setFlash(null);
    setAskedAt(Date.now());
  }, []);

  const restart = useCallback(() => {
    setAnswers([]);
    setEntered('');
    setFlash(null);
    setStarted(false);
  }, []);

  function togglePlayer(id: string) {
    setSelectedIds((current) => {
      if (current.includes(id)) return current.filter((value) => value !== id);
      if (current.length >= 2) return [current[1], id];
      return [...current, id];
    });
  }

  if (profiles.length < 2) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-3xl border border-rose-100 bg-white p-7 text-center">
          <p className="text-5xl mb-2" aria-hidden="true">👥</p>
          <p className="font-extrabold text-rose-700 text-lg">Head-to-head needs two learners</p>
          <p className="text-gray-500 text-sm mt-2">
            Add another learner on this account to play together.
          </p>
          <button type="button" onClick={onExit} className="w-full mt-5 py-3 rounded-2xl bg-rose-500 text-white font-bold">
            Back
          </button>
        </div>
      </div>
    );
  }

  if (!started) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white p-5 md:p-10">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <button type="button" onClick={onExit} className="text-rose-600 font-semibold">← Back</button>
            <h1 className="flex-1 text-center text-2xl md:text-3xl font-extrabold text-rose-700">⚔️ Head to Head</h1>
            <span className="w-12" />
          </div>

          <p className="text-center text-gray-500 mb-5">
            Pick two players. Everyone answers questions at their own grade.
          </p>

          <div className="grid grid-cols-2 gap-3">
            {profiles.map((profile) => (
              <button
                key={profile.id}
                type="button"
                aria-pressed={selectedIds.includes(profile.id)}
                onClick={() => togglePlayer(profile.id)}
                className={`rounded-3xl border-2 bg-white p-5 transition-colors ${
                  selectedIds.includes(profile.id)
                    ? 'border-rose-500 ring-2 ring-rose-100'
                    : 'border-gray-100'
                }`}
              >
                <span className="block text-5xl" aria-hidden="true">{profile.emoji}</span>
                <span className="block font-bold text-rose-700 mt-2 truncate">{profile.name}</span>
                <span className="block text-xs text-gray-400">
                  {profile.grade === 'K' ? 'Kindergarten' : `Grade ${profile.grade}`}
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            disabled={selectedIds.length !== 2}
            onClick={() => { setStarted(true); setAskedAt(Date.now()); }}
            className="w-full mt-6 py-4 rounded-2xl bg-rose-500 text-white text-lg font-bold
                       active:bg-rose-600 disabled:bg-rose-200"
          >
            Start the duel
          </button>
        </div>
      </div>
    );
  }

  if (complete) {
    const result = scoreDuel(players, answers);
    return (
      <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white flex items-center justify-center p-5">
        <div className="w-full max-w-md rounded-3xl border border-rose-100 bg-white p-7 text-center shadow-lg">
          <p className="text-6xl mb-2" aria-hidden="true">{result.tie ? '🤝' : '🏆'}</p>
          <h2 className="text-xl font-extrabold text-rose-700">{result.summary}</h2>

          <div className="grid grid-cols-2 gap-3 mt-6">
            {result.scores.map((score) => {
              const player = players.find((item) => item.id === score.playerId)!;
              return (
                <div key={score.playerId} className="rounded-2xl bg-rose-50 p-4">
                  <p className="text-4xl" aria-hidden="true">{player.emoji}</p>
                  <p className="font-bold text-rose-700 mt-1 truncate">{player.name}</p>
                  <p className="text-3xl font-extrabold text-rose-600 mt-2">{score.points}</p>
                  <p className="text-xs text-rose-500">
                    {score.correct}/{score.answered} correct
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 mt-6">
            <button type="button" onClick={restart} className="w-full py-3 rounded-2xl bg-rose-500 text-white font-bold">
              Play again
            </button>
            <button type="button" onClick={onExit} className="text-gray-400 font-medium py-2">
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const running = scoreDuel(players, answers);

  return (
    <div className="min-h-screen bg-gradient-to-b from-rose-50 to-white p-5 md:p-10">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <button type="button" onClick={onExit} className="text-rose-600 font-semibold">← Back</button>
          <h1 className="flex-1 text-center text-xl font-extrabold text-rose-700">⚔️ Head to Head</h1>
          <span className="w-12" />
        </div>

        <div className="grid grid-cols-2 gap-3 mb-5">
          {running.scores.map((score) => {
            const player = players.find((item) => item.id === score.playerId)!;
            const isTurn = turnPlayer?.id === player.id;
            return (
              <div
                key={score.playerId}
                className={`rounded-2xl p-3 text-center border-2 transition-colors ${
                  isTurn ? 'border-rose-500 bg-white' : 'border-transparent bg-white/60'
                }`}
              >
                <p className="text-3xl" aria-hidden="true">{player.emoji}</p>
                <p className="font-bold text-rose-700 text-sm truncate">{player.name}</p>
                <p className="text-2xl font-extrabold text-rose-600">{score.points}</p>
              </div>
            );
          })}
        </div>

        {(flash || (turnPlayer && question)) && (
          <div className="rounded-3xl border border-rose-100 bg-white p-5 md:p-7 shadow-sm">
            <p className="text-center font-bold text-rose-600" aria-live="polite">
              {flash
                ? `${flash.player.emoji} ${flash.player.name}`
                : `${turnPlayer!.emoji} ${turnPlayer!.name}'s turn — question ${questionIndex + 1} of ${roundsPerPlayer}`}
            </p>

            <p className="text-center text-4xl md:text-6xl font-extrabold text-gray-800 my-6">
              {(flash?.question ?? question)!.prompt}
            </p>

            {flash ? (
              <div
                role="status"
                aria-live="polite"
                className={`rounded-2xl p-4 text-center ${
                  flash.correct ? 'bg-green-50 text-green-800' : 'bg-amber-50 text-amber-900'
                }`}
              >
                <p className="text-3xl mb-1" aria-hidden="true">{flash.correct ? '🎉' : '💡'}</p>
                <p className="font-extrabold text-lg">
                  {flash.correct ? `+${flash.points} points!` : `The answer is ${flash.question.answer}`}
                </p>
                <button
                  type="button"
                  autoFocus
                  onClick={continueTurn}
                  className="w-full mt-4 py-3 rounded-2xl bg-rose-500 text-white font-bold active:bg-rose-600"
                >
                  {lastAnswer ? 'See the winner' : 'Pass the device'}
                </button>
              </div>
            ) : (
              <NumberPad
                value={entered}
                onChange={setEntered}
                onSubmit={submit}
                maxLength={4}
                submitLabel="Lock it in"
              />
            )}
          </div>
        )}

        <div className="mt-4">
          <ProgressRing
            percent={(answers.length / (players.length * roundsPerPlayer)) * 100}
            size={64}
            label={`${answers.length}`}
            sublabel="answers"
            colorClass="text-rose-500"
            trackClass="text-rose-100"
          />
        </div>
      </div>
    </div>
  );
};

export default DuelMode;
