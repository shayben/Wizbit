import React, { useEffect, useRef, useState } from 'react';
import {
  MATH_GRADES,
  MATH_BUDDIES,
  MATH_SKILLS,
  generateMathQuestions,
  getMathSkillProgress,
  getUnlockedMathBuddyIds,
  loadMathSessions,
  recommendMathSkill,
  saveMathSession,
  unlockMathBuddy,
  type MathBuddy,
  type MathGrade,
  type MathQuestion,
  type MathResponse,
  type MathSessionRecord,
} from '../services/mathService';

interface MathPracticeModeProps {
  uid?: string | null;
  onExit: () => void;
}

type Phase = 'grade' | 'skill' | 'practice' | 'results';

const MathPracticeMode: React.FC<MathPracticeModeProps> = ({ uid, onExit }) => {
  const [phase, setPhase] = useState<Phase>('grade');
  const [grade, setGrade] = useState<MathGrade | null>(null);
  const [skillId, setSkillId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<MathQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [responses, setResponses] = useState<MathResponse[]>([]);
  const [feedback, setFeedback] = useState<MathResponse | null>(null);
  const [unlockedBuddyIds, setUnlockedBuddyIds] = useState<string[]>(() => getUnlockedMathBuddyIds(uid));
  const [newBuddy, setNewBuddy] = useState<MathBuddy | null>(null);
  const [validationError, setValidationError] = useState('');
  const [pastSessions, setPastSessions] = useState<MathSessionRecord[]>([]);
  const questionStartedAt = useRef(0);

  const selectedSkill = MATH_SKILLS.find((skill) => skill.id === skillId);
  const currentQuestion = questions[currentIndex];
  const correctCount = responses.filter((response) => response.correct).length;
  const accuracy = responses.length === 0 ? 0 : Math.round((correctCount / responses.length) * 100);
  const correctStreak = [...responses].reverse().findIndex((response) => !response.correct);
  const activeStreak = correctStreak === -1 ? responses.length : correctStreak;
  const recommendedSkill = grade ? recommendMathSkill(grade, pastSessions) : null;

  useEffect(() => {
    let cancelled = false;
    void loadMathSessions(uid).then((sessions) => {
      if (!cancelled) {
        setPastSessions((current) => [
          ...current,
          ...sessions.filter((loaded) => !current.some((existing) => existing.id === loaded.id)),
        ]);
      }
    });
    return () => { cancelled = true; };
  }, [uid]);

  function chooseGrade(selectedGrade: MathGrade) {
    setGrade(selectedGrade);
    setPhase('skill');
  }

  function startPractice(selectedSkillId: string, startedAt: number) {
    setSkillId(selectedSkillId);
    setQuestions(generateMathQuestions(selectedSkillId));
    setCurrentIndex(0);
    setAnswer('');
    setResponses([]);
    setFeedback(null);
    setValidationError('');
    questionStartedAt.current = startedAt;
    setPhase('practice');
  }

  function submitAnswer(event: React.FormEvent) {
    event.preventDefault();
    if (!currentQuestion || !grade || !selectedSkill || feedback) return;

    const studentAnswer = Number(answer);
    if (answer.trim() === '' || !Number.isFinite(studentAnswer)) {
      setValidationError('Enter a number to continue.');
      return;
    }

    const response: MathResponse = {
      question: currentQuestion.prompt,
      expectedAnswer: currentQuestion.answer,
      studentAnswer,
      correct: Math.abs(studentAnswer - currentQuestion.answer) < 0.0001,
      responseMs: Math.max(0, event.timeStamp - questionStartedAt.current),
    };
    const nextResponses = [...responses, response];
    setResponses(nextResponses);
    setFeedback(response);
    if (response.correct) {
      const nextCorrectCount = nextResponses.filter((item) => item.correct).length;
      const buddy = MATH_BUDDIES.find(
        (item) => item.requiredCorrect === nextCorrectCount && !unlockedBuddyIds.includes(item.id),
      );
      if (buddy) {
        unlockMathBuddy(uid, buddy.id);
        setUnlockedBuddyIds((ids) => [...ids, buddy.id]);
        setNewBuddy(buddy);
      }
    }
    setAnswer('');
    setValidationError('');
  }

  function continuePractice(event: React.MouseEvent) {
    if (!feedback || !grade || !selectedSkill) return;
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((index) => index + 1);
      setFeedback(null);
      questionStartedAt.current = event.timeStamp;
      return;
    }

    const finalCorrectCount = responses.filter((item) => item.correct).length;
    const finalAccuracy = Math.round((finalCorrectCount / responses.length) * 100);
    const averageResponseMs = Math.round(
      responses.reduce((sum, item) => sum + item.responseMs, 0) / responses.length,
    );
    const now = new Date();
    const record: MathSessionRecord = {
      id: `${uid || 'anon'}_math_${now.getTime()}`,
      date: now.toISOString(),
      grade,
      skillId: selectedSkill.id,
      skillName: selectedSkill.name,
      accuracy: finalAccuracy,
      correctCount: finalCorrectCount,
      questionCount: responses.length,
      averageResponseMs,
      responses,
    };
    setPastSessions((sessions) => [record, ...sessions]);
    void saveMathSession(uid, record);
    setPhase('results');
  }

  function retry(event: React.MouseEvent) {
    if (skillId) startPractice(skillId, event.timeStamp);
  }

  const header = (
    <div className="flex items-center gap-3 mb-8">
      <button
        type="button"
        onClick={phase === 'grade' ? onExit : () => {
          if (phase === 'skill') setPhase('grade');
          else onExit();
        }}
        className="text-violet-600 font-semibold text-sm md:text-base"
      >
        ← Back
      </button>
      <h1 className="flex-1 text-center text-2xl md:text-3xl font-extrabold text-violet-700">
        🧮 Math Lab
      </h1>
      <div className="w-12" />
    </div>
  );

  if (phase === 'grade') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white p-5 md:p-10">
        <div className="max-w-2xl mx-auto">
          {header}
          <h2 className="text-xl md:text-2xl font-bold text-gray-800 text-center">Choose your grade</h2>
          <p className="text-gray-400 text-center mt-1 mb-6">Practice skills made for you</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {MATH_GRADES.map((item) => (
              <button
                key={item.grade}
                type="button"
                onClick={() => chooseGrade(item.grade)}
                className="bg-white border border-violet-100 rounded-2xl p-5 shadow-sm active:bg-violet-50 transition-colors"
              >
                <span className="block text-4xl mb-2">{item.emoji}</span>
                <span className="font-bold text-violet-700">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'skill' && grade) {
    const gradeLabel = MATH_GRADES.find((item) => item.grade === grade);
    return (
      <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white p-5 md:p-10">
        <div className="max-w-2xl mx-auto">
          {header}
          <h2 className="text-xl md:text-2xl font-bold text-gray-800">
            {gradeLabel?.emoji} {gradeLabel?.label}
          </h2>
          <p className="text-gray-400 mt-1 mb-6">Your next best skill is highlighted, but you can choose any topic.</p>
          <div className="grid md:grid-cols-2 gap-3">
            {MATH_SKILLS.filter((skill) => skill.grade === grade).map((skill) => {
              const progress = getMathSkillProgress(skill.id, pastSessions);
              const isRecommended = skill.id === recommendedSkill?.id;
              return (
                <button
                  key={skill.id}
                  type="button"
                  onClick={(event) => startPractice(skill.id, event.timeStamp)}
                  className={`text-left bg-white rounded-2xl p-5 shadow-sm active:bg-violet-50 transition-colors ${
                    isRecommended ? 'border-2 border-violet-500 ring-2 ring-violet-100' : 'border border-violet-100'
                  }`}
                >
                  <span className="flex items-center justify-between">
                    <span className="text-3xl">{skill.emoji}</span>
                    {isRecommended && <span className="rounded-full bg-violet-100 text-violet-700 px-2 py-1 text-xs font-bold">Recommended</span>}
                  </span>
                  <span className="block font-bold text-violet-700 text-lg mt-2">{skill.name}</span>
                  <span className="block text-gray-500 text-sm mt-1">{skill.description}</span>
                  <span className={`block text-xs font-bold mt-3 ${
                    progress.status === 'mastered' ? 'text-green-600' : progress.status === 'developing' ? 'text-amber-600' : 'text-gray-400'
                  }`}>
                    {progress.status === 'mastered' ? `✓ Mastered · ${progress.accuracy}%` : progress.status === 'developing' ? `Growing · ${progress.accuracy}%` : 'New skill'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (phase === 'results') {
    const unlockedBuddies = MATH_BUDDIES.filter((buddy) => unlockedBuddyIds.includes(buddy.id));
    const nextSkill = grade ? recommendMathSkill(grade, pastSessions) : null;
    return (
      <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white flex items-center justify-center p-5">
        <div className="w-full max-w-md bg-white rounded-3xl border border-violet-100 shadow-lg p-7 text-center">
          <div className="text-6xl mb-3">{accuracy >= 80 ? '🌟' : accuracy >= 60 ? '🎯' : '💪'}</div>
          <h2 className="text-2xl font-extrabold text-violet-700">Practice complete!</h2>
          <p className="text-gray-500 mt-2">{selectedSkill?.name}</p>
          <div className="grid grid-cols-2 gap-3 my-6">
            <div className="rounded-2xl bg-green-50 p-4">
              <p className="text-3xl font-extrabold text-green-600">{correctCount}/{responses.length}</p>
              <p className="text-xs text-green-700">Correct</p>
            </div>
            {unlockedBuddies.length > 0 && (
              <div className="rounded-2xl bg-amber-50 p-4 mb-6">
                <p className="text-xs font-bold uppercase tracking-wide text-amber-700">Your math buddies</p>
                <div className="flex justify-center gap-3 mt-2">
                  {unlockedBuddies.map((buddy) => (
                    <span key={buddy.id} title={buddy.name} className="text-4xl" aria-label={buddy.name}>
                      {buddy.emoji}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <div className="rounded-2xl bg-violet-50 p-4">
              <p className="text-3xl font-extrabold text-violet-600">{accuracy}%</p>
              <p className="text-xs text-violet-700">Accuracy</p>
            </div>
          </div>
          <div className="flex flex-col gap-3">
            {nextSkill && (
              <button
                type="button"
                onClick={(event) => startPractice(nextSkill.id, event.timeStamp)}
                className="w-full py-4 px-3 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white font-bold"
              >
                Recommended next: {nextSkill.name}
                <span className="block text-xs text-violet-100 font-medium mt-1">
                  {nextSkill.id === skillId ? 'Keep building this skill' : 'You are ready to level up'}
                </span>
              </button>
            )}
            <button type="button" onClick={retry} className="w-full py-3 rounded-2xl bg-violet-600 text-white font-bold">
              Practice again
            </button>
            <button type="button" onClick={() => setPhase('skill')} className="w-full py-3 rounded-2xl bg-violet-50 text-violet-700 font-bold">
              Choose another skill
            </button>
            <button type="button" onClick={onExit} className="text-gray-400 font-medium py-2">
              Back home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50 to-white p-5 md:p-10">
      {newBuddy && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-violet-950/40 p-5 animate-fade-in">
          <div role="dialog" aria-modal="true" aria-labelledby="buddy-unlocked-title" className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl">
            <div className="text-2xl mb-2" aria-hidden="true">✨ 🎉 ✨</div>
            <div className="text-8xl animate-bounce" aria-hidden="true">{newBuddy.emoji}</div>
            <h2 id="buddy-unlocked-title" className="text-2xl font-extrabold text-violet-700 mt-3">
              New math buddy unlocked!
            </h2>
            <p className="text-gray-600 font-semibold mt-2">{newBuddy.name} is cheering you on.</p>
            <button
              type="button"
              autoFocus
              onClick={() => setNewBuddy(null)}
              className="w-full mt-6 py-3 rounded-2xl bg-violet-600 text-white font-bold"
            >
              Keep going!
            </button>
          </div>
        </div>
      )}
      <div className="max-w-xl mx-auto">
        {header}
        <div className="flex items-center justify-between text-sm font-semibold text-violet-600 mb-2">
          <span>{selectedSkill?.name}</span>
          <span>{currentIndex + 1} / {questions.length}</span>
        </div>
        <div className="h-2 rounded-full bg-violet-100 overflow-hidden mb-8">
          <div
            className="h-full bg-violet-500 transition-all"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
        <div className="bg-white rounded-3xl border border-violet-100 shadow-lg p-6 md:p-10 text-center">
          <p className="text-3xl md:text-5xl font-extrabold text-gray-800 min-h-16 flex items-center justify-center">
            {currentQuestion?.prompt}
          </p>
          {feedback ? (
            <div className="mt-8" role="status" aria-live="polite">
              <div className={`rounded-2xl p-5 ${feedback.correct ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                <p className="text-4xl mb-2">{feedback.correct ? '🎉' : '💡'}</p>
                <p className="text-xl font-extrabold">
                  {feedback.correct ? 'Correct!' : 'Not quite'}
                </p>
                {feedback.correct && activeStreak >= 2 && (
                  <p className="mt-1 font-semibold">🔥 {activeStreak} in a row!</p>
                )}
                {!feedback.correct && (
                  <>
                    <p className="mt-1 font-semibold">The correct answer is {feedback.expectedAnswer}.</p>
                    <div className="mt-4 rounded-xl bg-white/70 p-4 text-left text-amber-900">
                      <p className="text-xs font-extrabold uppercase tracking-wide">Try this strategy</p>
                      <p className="mt-1 text-sm font-medium">{currentQuestion?.tip}</p>
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                autoFocus
                onClick={continuePractice}
                className="w-full mt-4 py-4 rounded-2xl bg-violet-600 text-white text-lg font-bold active:bg-violet-700"
              >
                {currentIndex + 1 < questions.length ? 'Next question' : 'See results'}
              </button>
            </div>
          ) : (
            <form onSubmit={submitAnswer} className="mt-8">
              <label htmlFor="math-answer" className="sr-only">Your answer</label>
              <input
                id="math-answer"
                type="number"
                step="any"
                inputMode="decimal"
                autoFocus
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Your answer"
                className="w-full rounded-2xl border-2 border-violet-200 px-4 py-4 text-center text-2xl font-bold outline-none focus:border-violet-500"
              />
              {validationError && <p className="text-red-500 text-sm mt-2">{validationError}</p>}
              <button
                type="submit"
                className="w-full mt-4 py-4 rounded-2xl bg-violet-600 text-white text-lg font-bold active:bg-violet-700"
              >
                Check answer
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default MathPracticeMode;
