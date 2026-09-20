import type { PianoChord } from '../services/pianoSongService';

interface PianoRollProps {
  chords: PianoChord[];
  currentIndex: number;
  pressedNotes: Set<number>;
}

const WHITE_PITCHES = new Set([0, 2, 4, 5, 7, 9, 11]);
const MIN_NOTE = 36;
const MAX_NOTE = 84;

function keyPosition(midi: number) {
  return ((midi - MIN_NOTE) / (MAX_NOTE - MIN_NOTE + 1)) * 100;
}

export default function PianoRoll({ chords, currentIndex, pressedNotes }: PianoRollProps) {
  const targetTime = chords[currentIndex]?.time ?? 0;
  const upcoming = chords.slice(currentIndex, currentIndex + 18);
  const whiteKeys = Array.from({ length: MAX_NOTE - MIN_NOTE + 1 }, (_, index) => MIN_NOTE + index)
    .filter((note) => WHITE_PITCHES.has(note % 12));
  const blackKeys = Array.from({ length: MAX_NOTE - MIN_NOTE + 1 }, (_, index) => MIN_NOTE + index)
    .filter((note) => !WHITE_PITCHES.has(note % 12));

  return (
    <div className="relative h-80 md:h-[28rem] overflow-hidden rounded-2xl bg-slate-950 border border-slate-800">
      <div className="absolute inset-0 opacity-25 bg-[linear-gradient(to_right,transparent_0,transparent_calc(12.5%-1px),#64748b_calc(12.5%-1px),#64748b_12.5%)] bg-[length:12.5%_100%]" />
      {upcoming.flatMap((chord) =>
        chord.notes.map((note) => {
          const bottom = 76 + Math.min(310, (chord.time - targetTime) * 74);
          const height = Math.max(18, Math.min(90, note.duration * 46));
          const isTarget = chord.id === chords[currentIndex]?.id;
          return (
            <div
              key={note.id}
              className={`absolute rounded-md border shadow-lg ${
                note.hand === 'left'
                  ? 'bg-blue-400 border-blue-200 shadow-blue-500/30'
                  : 'bg-pink-400 border-pink-200 shadow-pink-500/30'
              } ${isTarget ? 'ring-2 ring-white animate-pulse' : ''}`}
              style={{
                left: `${keyPosition(note.midi)}%`,
                bottom,
                width: '2.3%',
                height,
              }}
              title={note.name}
            />
          );
        }),
      )}
      <div className="absolute bottom-[72px] inset-x-0 h-1 bg-violet-400 shadow-[0_0_12px_#a78bfa]" />
      <div className="absolute bottom-0 inset-x-0 h-[72px] bg-slate-200 flex">
        {whiteKeys.map((note) => (
          <div
            key={note}
            className={`relative flex-1 border-r border-slate-400 rounded-b ${
              pressedNotes.has(note) ? 'bg-violet-300' : 'bg-white'
            }`}
          >
            {note % 12 === 0 && (
              <span className="absolute bottom-1 inset-x-0 text-center text-[9px] text-slate-500">
                C{Math.floor(note / 12) - 1}
              </span>
            )}
          </div>
        ))}
        {blackKeys.map((note) => (
          <div
            key={note}
            className={`absolute top-0 h-11 rounded-b z-10 ${
              pressedNotes.has(note) ? 'bg-violet-500' : 'bg-slate-900'
            }`}
            style={{ left: `${keyPosition(note) + 0.8}%`, width: '1.6%' }}
          />
        ))}
      </div>
    </div>
  );
}
