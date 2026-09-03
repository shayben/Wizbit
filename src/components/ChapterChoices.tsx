import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { StoryChoice } from '../services/storyService';
import { recordAudioClip, transcribeAudio } from '../services/transcribeService';

type VoicePhase = 'idle' | 'recording' | 'transcribing';

interface ChapterChoicesProps {
  chapterNumber: number;
  chapterTitle: string;
  choices: StoryChoice[];
  onChoose: (choiceText: string) => void;
}

const ChapterChoices: React.FC<ChapterChoicesProps> = ({
  chapterNumber,
  chapterTitle,
  choices,
  onChoose,
}) => {
  const [custom, setCustom] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [voicePhase, setVoicePhase] = useState<VoicePhase>('idle');
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recorderRef = useRef<{ stop: () => void; cancel: () => void } | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      recorderRef.current?.cancel();
    };
  }, []);

  const processRecording = useCallback(async (stopped: Promise<Blob>) => {
    try {
      const blob = await stopped;
      if (!mountedRef.current) return;
      if (blob.size < 200) {
        setVoiceError('I didn\'t catch that — please try again.');
        setVoicePhase('idle');
        return;
      }

      setVoicePhase('transcribing');
      const { text } = await transcribeAudio(blob);
      if (!mountedRef.current) return;
      if (!text) {
        setVoiceError('I didn\'t catch that — please try again.');
        setVoicePhase('idle');
        return;
      }

      setCustom(text);
      setShowCustom(true);
      setVoicePhase('idle');
    } catch (err) {
      if (!mountedRef.current || (err instanceof Error && err.message === 'cancelled')) return;
      const message = err instanceof Error ? err.message : 'Microphone unavailable.';
      setVoiceError(`Couldn't hear your idea: ${message}`);
      setVoicePhase('idle');
    } finally {
      recorderRef.current = null;
    }
  }, []);

  const handleVoiceClick = useCallback(async () => {
    if (voicePhase === 'recording') {
      recorderRef.current?.stop();
      return;
    }
    if (voicePhase === 'transcribing') return;

    setVoiceError(null);
    setVoicePhase('recording');
    try {
      const recorder = await recordAudioClip();
      if (!mountedRef.current) {
        recorder.cancel();
        return;
      }
      recorderRef.current = { stop: recorder.stop, cancel: recorder.cancel };
      void processRecording(recorder.stopped);
    } catch (err) {
      if (!mountedRef.current) return;
      const message = err instanceof Error ? err.message : 'Microphone unavailable.';
      setVoiceError(`Can't access the microphone: ${message}`);
      setVoicePhase('idle');
    }
  }, [processRecording, voicePhase]);

  const voiceBusy = voicePhase !== 'idle';

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white p-6 md:p-10 flex flex-col items-center justify-center">
      <div className="max-w-lg md:max-w-2xl w-full">
        {/* Chapter badge */}
        <div className="text-center mb-6">
          <span className="inline-block bg-purple-100 text-purple-700 text-sm md:text-base font-bold px-4 py-1.5 rounded-full mb-2">
            Chapter {chapterNumber} complete ✓
          </span>
          <h2 className="text-xl md:text-2xl font-bold text-purple-700">{chapterTitle}</h2>
        </div>

        <p className="text-center text-gray-600 text-lg md:text-xl font-medium mb-6">
          What happens next? 🤔
        </p>

        {/* Choice buttons */}
        <div className="flex flex-col gap-3 md:gap-4 mb-5">
          {choices.map((choice, i) => (
            <button
              key={i}
              type="button"
              onClick={() => onChoose(choice.text)}
              disabled={voiceBusy}
              className="w-full text-left bg-white rounded-2xl border border-gray-100 shadow-sm
                         p-4 md:p-5 active:bg-purple-50 active:border-purple-200 transition-colors
                         flex items-center gap-3 disabled:opacity-50"
            >
              <span className="text-3xl md:text-4xl shrink-0">{choice.emoji}</span>
              <span className="text-base md:text-lg font-medium text-gray-700">{choice.text}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={() => void handleVoiceClick()}
          disabled={voicePhase === 'transcribing'}
          aria-label={voicePhase === 'recording' ? 'Stop recording idea' : 'Say your own idea'}
          className={`w-full rounded-2xl py-3 mb-2 font-bold text-base md:text-lg transition-colors
            ${voicePhase === 'recording'
              ? 'bg-red-500 text-white animate-pulse'
              : voicePhase === 'transcribing'
                ? 'bg-gray-200 text-gray-500 cursor-wait'
                : 'bg-purple-100 text-purple-700 active:bg-purple-200'
            }`}
        >
          {voicePhase === 'recording'
            ? '■ Listening… tap to stop'
            : voicePhase === 'transcribing'
              ? '⏳ Turning speech into text…'
              : '🎤 Say your own idea'}
        </button>
        {voiceError && (
          <p role="alert" className="text-center text-sm text-red-600 mb-2">
            {voiceError}
          </p>
        )}

        {/* Custom idea */}
        {!showCustom ? (
          <button
            type="button"
            onClick={() => setShowCustom(true)}
            disabled={voiceBusy}
            className="w-full text-center text-purple-500 text-sm md:text-base font-medium py-2
                       active:text-purple-700 transition-colors disabled:opacity-50"
          >
            ✏️ Or type your own idea…
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Type what happens next..."
              className="flex-1 rounded-2xl border border-gray-200 px-4 py-3 text-base md:text-lg
                         focus:outline-none focus:ring-2 focus:ring-purple-300 focus:border-purple-300
                         placeholder:text-gray-300"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && custom.trim()) onChoose(custom.trim());
              }}
            />
            <button
              type="button"
              onClick={() => { if (custom.trim()) onChoose(custom.trim()); }}
              disabled={!custom.trim()}
              className={`px-5 py-3 rounded-2xl font-bold text-base transition-colors
                ${custom.trim()
                  ? 'bg-purple-600 text-white active:bg-purple-700'
                  : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
            >
              Go!
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChapterChoices;
