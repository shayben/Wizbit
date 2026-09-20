import type { PianoChord, PianoNote } from '../services/pianoSongService';

interface PianoSheetMusicProps {
  chords: PianoChord[];
  currentIndex: number;
}

const NOTE_POSITIONS: Record<number, number> = {
  0: 0, 2: 1, 4: 2, 5: 3, 7: 4, 9: 5, 11: 6,
};

function staffPosition(note: PianoNote) {
  const pitchClass = note.midi % 12;
  const naturalPitch = pitchClass === 1 ? 0
    : pitchClass === 3 ? 2
      : pitchClass === 6 ? 5
        : pitchClass === 8 ? 7
          : pitchClass === 10 ? 9
            : pitchClass;
  const octave = Math.floor(note.midi / 12) - 1;
  return octave * 7 + (NOTE_POSITIONS[naturalPitch] ?? 0);
}

function NoteHead({ note, x, active }: { note: PianoNote; x: number; active: boolean }) {
  const treble = note.midi >= 60;
  const reference = treble ? 4 * 7 + 2 : 2 * 7 + 4;
  const centerY = treble ? 52 : 128;
  const y = centerY - (staffPosition(note) - reference) * 5;
  const accidental = note.name.includes('#');

  return (
    <g>
      {accidental && (
        <text x={x - 13} y={y + 5} fontSize="14" fill="#475569">♯</text>
      )}
      <ellipse
        cx={x}
        cy={y}
        rx="7"
        ry="5"
        transform={`rotate(-15 ${x} ${y})`}
        fill={active ? '#7c3aed' : note.hand === 'left' ? '#2563eb' : '#db2777'}
      />
      <line
        x1={x + 6}
        y1={y}
        x2={x + 6}
        y2={y - 28}
        stroke={active ? '#7c3aed' : '#334155'}
        strokeWidth="1.5"
      />
      <text x={x - 12} y={treble ? 91 : 166} fontSize="10" fill="#64748b">{note.name}</text>
    </g>
  );
}

export default function PianoSheetMusic({ chords, currentIndex }: PianoSheetMusicProps) {
  const start = Math.max(0, currentIndex - 1);
  const visible = chords.slice(start, start + 8);

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      <svg viewBox="0 0 720 185" className="min-w-[620px] w-full" aria-label="Sheet music">
        <rect width="720" height="185" fill="white" />
        {[32, 42, 52, 62, 72, 108, 118, 128, 138, 148].map((y) => (
          <line key={y} x1="38" y1={y} x2="700" y2={y} stroke="#94a3b8" strokeWidth="1" />
        ))}
        <line x1="38" y1="32" x2="38" y2="148" stroke="#475569" strokeWidth="2" />
        <text x="8" y="65" fontSize="38" fill="#334155">𝄞</text>
        <text x="12" y="138" fontSize="32" fill="#334155">𝄢</text>
        {visible.map((chord, index) => {
          const absoluteIndex = start + index;
          const x = 92 + index * 82;
          return (
            <g key={chord.id}>
              {absoluteIndex === currentIndex && (
                <rect x={x - 28} y="18" width="58" height="146" rx="12" fill="#ede9fe" />
              )}
              {chord.notes.map((note, noteIndex) => (
                <NoteHead
                  key={note.id}
                  note={note}
                  x={x + noteIndex * 9}
                  active={absoluteIndex === currentIndex}
                />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
