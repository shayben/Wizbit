import React, { useEffect, useState, useRef, useCallback } from 'react';
import type { PreloadedMoment } from '../services/mediaService';

interface MomentOverlayProps {
  moments: PreloadedMoment[];
  currentWordIndex: number;
}

const DISPLAY_MS = 5000;

const MomentOverlay: React.FC<MomentOverlayProps> = ({ moments, currentWordIndex }) => {
  const [active, setActive] = useState<PreloadedMoment | null>(null);
  const [visible, setVisible] = useState(false);
  const triggeredRef = useRef<Set<number>>(new Set());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (audioRef.current) {
      // Gentle fade-out
      const a = audioRef.current;
      const fade = setInterval(() => {
        if (a.volume > 0.05) {
          a.volume = Math.max(0, a.volume - 0.05);
        } else {
          a.pause();
          a.currentTime = 0;
          clearInterval(fade);
        }
      }, 80);
    }
    // Remove after CSS transition completes
    setTimeout(() => setActive(null), 500);
  }, []);

  useEffect(() => {
    const m = moments.find(
      (m) => m.wordIndex === currentWordIndex && !triggeredRef.current.has(m.wordIndex),
    );
    if (!m) return;

    triggeredRef.current.add(m.wordIndex);
    if (timerRef.current) clearTimeout(timerRef.current);

    setActive(m);
    // Small delay so the DOM mounts before we trigger the transition
    requestAnimationFrame(() => setVisible(true));

    // Play audio
    if (m.audioUrl) {
      try {
        const audio = new Audio(m.audioUrl);
        audio.volume = 0.25;
        audioRef.current = audio;
        audio.play().catch(() => {});
      } catch { /* best-effort */ }
    }

    timerRef.current = window.setTimeout(dismiss, DISPLAY_MS);
  }, [currentWordIndex, moments, dismiss]);

  // Reset triggers when moments change (new session / new text)
  useEffect(() => {
    triggeredRef.current = new Set();
  }, [moments]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      audioRef.current?.pause();
    };
  }, []);

  if (!active) return null;

  return (
    <div
      className={`
        fixed top-20 right-3 z-30 max-w-44 pointer-events-auto
        transition-all duration-500 ease-out
        ${visible ? 'opacity-100 translate-x-0 scale-100' : 'opacity-0 translate-x-8 scale-95'}
      `}
      onClick={dismiss}
    >
      {active.imageUrl && (
        <img
          src={active.imageUrl}
          alt={active.caption}
          className="w-full rounded-2xl shadow-lg border-2 border-white/80"
        />
      )}
      <p className="mt-1.5 text-[11px] leading-tight text-center text-gray-600 bg-white/90 rounded-xl px-2 py-1.5 shadow-sm">
        💡 {active.caption}
      </p>
    </div>
  );
};

export default MomentOverlay;
