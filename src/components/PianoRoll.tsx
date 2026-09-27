import type { PianoChord } from '../services/pianoSongService';

interface PianoRollProps {
  chords: PianoChord[];
  currentIndex: number;
  pressedNotes: Set<number>;
  onPlayNote: (note: number) => void;
}

const WHITE_PITCHES = new Set([0, 2, 4, 5, 7, 9, 11]);
const MIN_NOTE = 36;
const MAX_NOTE = 84;
const KEYBOARD_HEIGHT = 72;
const COMPUTER_KEYS: Record<number, string> = {
  60: 'A', 61: 'W', 62: 'S', 63: 'E', 64: 'D', 65: 'F', 66: 'T',
  67: 'G', 68: 'Y', 69: 'H', 70: 'U', 71: 'J', 72: 'K',
};

const ALL_NOTES = Array.from(
  { length: MAX_NOTE - MIN_NOTE + 1 },
  (_, index) => MIN_NOTE + index,
);
const WHITE_KEYS = ALL_NOTES.filter((note) => WHITE_PITCHES.has(note % 12));
const BLACK_KEYS = ALL_NOTES.filter((note) => !WHITE_PITCHES.has(note % 12));
const WHITE_KEY_WIDTH = 100 / WHITE_KEYS.length;
const BLACK_KEY_WIDTH = WHITE_KEY_WIDTH * 0.62;

interface KeyGeometry {
  left: number;
  width: number;
  isWhite: boolean;
}

function getPianoKeyGeometry(midi: number): KeyGeometry | null {
  if (midi < MIN_NOTE || midi > MAX_NOTE) return null;

  const whiteIndex = WHITE_KEYS.indexOf(midi);
  if (whiteIndex >= 0) {
    return {
      left: whiteIndex * WHITE_KEY_WIDTH,
      width: WHITE_KEY_WIDTH,
      isWhite: true,
    };
  }

  const previousWhiteIndex = WHITE_KEYS.indexOf(midi - 1);
  if (previousWhiteIndex < 0) return null;

  return {
    left: ((previousWhiteIndex + 1) * WHITE_KEY_WIDTH) - (BLACK_KEY_WIDTH / 2),
    width: BLACK_KEY_WIDTH,
    isWhite: false,
  };
}

function geometryStyle(geometry: KeyGeometry) {
  return {
    left: `${geometry.left}%`,
    width: `${geometry.width}%`,
  };
}

export default function PianoRoll({ chords, currentIndex, pressedNotes, onPlayNote }: PianoRollProps) {
  const targetTime = chords[currentIndex]?.time ?? 0;
  const upcoming = chords.slice(currentIndex, currentIndex + 18);
  const targetNotes = [...new Set(chords[currentIndex]?.notes.map((note) => note.midi) ?? [])];

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-950">
      <div className="relative h-80 min-w-[980px] overflow-hidden md:h-[28rem]">
        <div className="absolute inset-x-0 top-0 border-b border-slate-700" style={{ bottom: KEYBOARD_HEIGHT }}>
          {WHITE_KEYS.map((note, index) => {
            const geometry = getPianoKeyGeometry(note);
            if (!geometry) return null;
            return (
              <div
                key={`white-track-${note}`}
                aria-hidden="true"
                className={`absolute inset-y-0 border-r border-slate-700/80 ${
                  note % 12 === 0 ? 'bg-slate-800/55' : index % 2 === 0 ? 'bg-slate-900/20' : 'bg-slate-800/20'
                }`}
                style={geometryStyle(geometry)}
              />
            );
          })}
          {BLACK_KEYS.map((note) => {
            const geometry = getPianoKeyGeometry(note);
            if (!geometry) return null;
            return (
              <div
                key={`black-track-${note}`}
                aria-hidden="true"
                className="absolute inset-y-0 border-x border-slate-600/35 bg-black/20"
                style={geometryStyle(geometry)}
              />
            );
          })}
          {targetNotes.map((note) => {
            const geometry = getPianoKeyGeometry(note);
            if (!geometry) return null;
            return (
              <div
                key={`target-track-${note}`}
                aria-hidden="true"
                className="absolute inset-y-0 border-x border-violet-300/40 bg-violet-400/15 shadow-[inset_0_0_18px_rgba(167,139,250,0.16)]"
                style={geometryStyle(geometry)}
              />
            );
          })}
        </div>

        {upcoming.flatMap((chord) =>
          chord.notes.map((note) => {
            const geometry = getPianoKeyGeometry(note.midi);
            if (!geometry) return null;
            const bottom = KEYBOARD_HEIGHT + 4 + Math.min(310, (chord.time - targetTime) * 74);
            const height = Math.max(18, Math.min(90, note.duration * 46));
            const isTarget = chord.id === chords[currentIndex]?.id;
            return (
              <div
                key={note.id}
                data-midi-note={note.midi}
                className={`absolute z-10 flex items-end justify-center overflow-hidden rounded-md border shadow-lg ${
                  note.hand === 'left'
                    ? 'border-blue-200 bg-gradient-to-b from-sky-300 to-blue-500 shadow-blue-500/40'
                    : 'border-pink-200 bg-gradient-to-b from-fuchsia-300 to-pink-500 shadow-pink-500/40'
                } ${isTarget ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-950 animate-pulse' : ''}`}
                style={{
                  ...geometryStyle(geometry),
                  bottom,
                  height,
                }}
                title={note.name}
              >
                {isTarget && (
                  <span className="mb-1 rounded bg-slate-950/65 px-1 text-[9px] font-bold leading-4 text-white">
                    {note.name}
                  </span>
                )}
              </div>
            );
          }),
        )}
        <div
          className="absolute inset-x-0 z-20 h-1 bg-violet-300 shadow-[0_0_16px_#a78bfa]"
          style={{ bottom: KEYBOARD_HEIGHT }}
        />
        <div
          className="absolute inset-x-0 bottom-0 z-30 bg-slate-200"
          style={{ height: KEYBOARD_HEIGHT }}
        >
          {WHITE_KEYS.map((note) => {
            const geometry = getPianoKeyGeometry(note);
            if (!geometry) return null;
            const isTarget = targetNotes.includes(note);
            return (
              <button
                type="button"
                key={note}
                data-piano-key={note}
                onClick={() => onPlayNote(note)}
                aria-label={`Play ${note}`}
                className={`absolute inset-y-0 rounded-b border-r border-slate-400 transition-colors ${
                  pressedNotes.has(note)
                    ? 'bg-violet-300'
                    : isTarget ? 'bg-violet-100' : 'bg-white'
                } active:bg-violet-200 touch-manipulation`}
                style={geometryStyle(geometry)}
              >
                {COMPUTER_KEYS[note] && (
                  <span className="absolute inset-x-0 top-1 text-center text-[10px] font-bold text-violet-500">
                    {COMPUTER_KEYS[note]}
                  </span>
                )}
                {note % 12 === 0 && (
                  <span className="absolute inset-x-0 bottom-1 text-center text-[9px] text-slate-500">
                    C{Math.floor(note / 12) - 1}
                  </span>
                )}
              </button>
            );
          })}
          {BLACK_KEYS.map((note) => {
            const geometry = getPianoKeyGeometry(note);
            if (!geometry) return null;
            const isTarget = targetNotes.includes(note);
            return (
              <button
                type="button"
                key={note}
                data-piano-key={note}
                onClick={() => onPlayNote(note)}
                aria-label={`Play ${note}`}
                className={`absolute top-0 z-40 h-11 rounded-b border-x border-b border-black transition-colors ${
                  pressedNotes.has(note)
                    ? 'bg-violet-500'
                    : isTarget ? 'bg-violet-700' : 'bg-slate-900'
                } active:bg-violet-600 touch-manipulation`}
                style={geometryStyle(geometry)}
              >
                {COMPUTER_KEYS[note] && (
                  <span className="text-[9px] font-bold text-white">{COMPUTER_KEYS[note]}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
