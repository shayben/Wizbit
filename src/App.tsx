import { useState, useRef, useCallback, useEffect } from 'react';
import ReadingSession from './components/ReadingSession';
import AdventureMode from './components/AdventureMode';
import LoginScreen from './components/LoginScreen';
import UserHeader from './components/UserHeader';
import ProgressDashboard from './components/ProgressDashboard';
import StoryLibrary from './components/StoryLibrary';
import { recognizeText } from './services/ocrService';
import { readingLevels } from './data/demoParagraphs';
import type { ReadingLevel, DemoParagraph } from './data/demoParagraphs';
import { useAuth } from './contexts/AuthContext';
import { useAppStep } from './hooks/useAppStep';

export default function App() {
  const { user, loading: authLoading, isConfigured, signOut } = useAuth();
  const { step, navigate, goHome } = useAppStep();
  const [assignmentText, setAssignmentText] = useState('');
  const [momentCacheKey, setMomentCacheKey] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [demoLevel, setDemoLevel] = useState<ReadingLevel | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const openCamera = useCallback(async () => {
    setError(null);
    navigate('camera');

    const constraintOptions: MediaStreamConstraints[] = [
      { video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
      { video: { facingMode: { ideal: 'environment' } }, audio: false },
      { video: true, audio: false },
    ];

    let stream: MediaStream | null = null;
    for (const constraints of constraintOptions) {
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch { /* try next */ }
    }

    if (!stream) {
      setError('Unable to access camera. Please allow camera permissions.');
      goHome();
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      try { await videoRef.current.play(); } catch { /* safe to ignore */ }
    }
  }, [navigate, goHome]);

  const capture = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    stopCamera();
    navigate('processing');

    try {
      const result = await recognizeText(dataUrl);
      if (result.text.trim()) {
        setAssignmentText(result.text);
        navigate('reading');
      } else {
        setError('No text found — try again with clearer text.');
        goHome();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      goHome();
    }
  }, [stopCamera, navigate, goHome]);

  const handleReset = useCallback(() => {
    stopCamera();
    setAssignmentText('');
    setMomentCacheKey(undefined);
    setError(null);
    setDemoLevel(null);
    goHome();
  }, [stopCamera, goHome]);

  const handleDemoLevel = useCallback((level: ReadingLevel) => {
    setDemoLevel(level);
    navigate('demo-pick');
  }, [navigate]);

  const handleDemoParagraph = useCallback((p: DemoParagraph, index: number) => {
    setAssignmentText(p.text);
    setMomentCacheKey(demoLevel ? `${demoLevel.grade}-${index}` : undefined);
    navigate('reading');
  }, [demoLevel, navigate]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // ── Auth gates (after all hooks) ──
  if (authLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Show login screen only when MSAL is configured and nobody is signed in
  if (isConfigured && !user) {
    return <LoginScreen />;
  }

  // ── Progress Dashboard ──
  if (step === 'dashboard' && user) {
    return <ProgressDashboard user={user} onClose={goHome} />;
  }

  // ── Story Library ──
  if (step === 'my-stories') {
    return <StoryLibrary onClose={goHome} />;
  }

  // ── Home: camera button + demo levels ──
  if (step === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex flex-col items-center gap-6 md:gap-8 p-6 pt-12 md:pt-16">
        <canvas ref={canvasRef} className="hidden" />
        <h1 className="text-3xl md:text-4xl font-bold text-indigo-700">📖 Reading Assistant</h1>

        {/* User header (SSO) */}
        {user && (
          <UserHeader
            user={user}
            onOpenDashboard={() => navigate('dashboard')}
            onSignOut={signOut}
          />
        )}

        {error && (
          <p className="text-red-600 text-sm text-center bg-red-50 rounded-xl p-3 max-w-xs md:max-w-md">{error}</p>
        )}

        <button
          type="button"
          onClick={openCamera}
          className="group w-28 h-28 md:w-36 md:h-36 rounded-full
                     bg-gradient-to-b from-indigo-400 via-indigo-600 to-indigo-700
                     flex items-center justify-center
                     shadow-[0_6px_20px_rgba(79,70,229,0.45),inset_0_2px_4px_rgba(255,255,255,0.25),inset_0_-2px_4px_rgba(0,0,0,0.2)]
                     active:shadow-[0_2px_8px_rgba(79,70,229,0.3),inset_0_-1px_2px_rgba(255,255,255,0.15),inset_0_2px_6px_rgba(0,0,0,0.25)]
                     active:translate-y-0.5 active:scale-[0.97]
                     transition-all duration-100 ease-out
                     border border-indigo-500/30"
        >
          <span className="text-5xl md:text-6xl flex items-center justify-center
                           drop-shadow-[0_2px_2px_rgba(0,0,0,0.2)]
                           group-active:scale-90 transition-transform duration-100
                           -mt-0.5">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="white" className="w-12 h-12 md:w-14 md:h-14">
              <path d="M12 9a3.75 3.75 0 100 7.5A3.75 3.75 0 0012 9z" />
              <path fillRule="evenodd" d="M9.344 3.071a49.52 49.52 0 015.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71.386.054.77.113 1.152.177 1.432.239 2.429 1.493 2.429 2.909V18a3 3 0 01-3 3H4.5a3 3 0 01-3-3V9.574c0-1.416.997-2.67 2.429-2.909.382-.064.766-.123 1.151-.178a1.56 1.56 0 001.11-.71l.822-1.315a2.942 2.942 0 012.332-1.39zM12 10.5a2.25 2.25 0 100 4.5 2.25 2.25 0 000-4.5z" clipRule="evenodd" />
            </svg>
          </span>
        </button>
        <p className="text-gray-400 text-sm md:text-base">Tap to scan your reading</p>

        {/* Divider */}
        <div className="flex items-center gap-3 w-full max-w-xs md:max-w-md">
          <hr className="flex-1 border-gray-200" />
          <span className="text-gray-400 text-sm md:text-base font-medium">or try a story</span>
          <hr className="flex-1 border-gray-200" />
        </div>

        {/* Reading level grid */}
        <div className="grid grid-cols-4 md:grid-cols-7 gap-2 md:gap-3 w-full max-w-xs md:max-w-lg">
          {readingLevels.map((level) => (
            <button
              key={level.grade}
              type="button"
              onClick={() => handleDemoLevel(level)}
              className="flex flex-col items-center gap-1 py-3 md:py-4 px-1 rounded-2xl bg-white border border-gray-100
                         shadow-sm active:bg-indigo-50 active:border-indigo-200 transition-colors"
            >
              <span className="text-2xl md:text-3xl">{level.emoji}</span>
              <span className="text-xs md:text-sm font-semibold text-gray-600">
                {level.grade === 'K' ? 'K' : level.grade}
              </span>
            </button>
          ))}
        </div>

        {/* My Stories shortcut */}
        <button
          type="button"
          onClick={() => navigate('my-stories')}
          className="w-full max-w-xs md:max-w-md py-3 md:py-4 rounded-2xl bg-purple-50 border border-purple-100
                     text-purple-700 font-semibold text-base md:text-lg
                     active:bg-purple-100 transition-colors"
        >
          📚 My Stories
        </button>
      </div>
    );
  }

  // ── Demo: pick a paragraph ──
  if (step === 'demo-pick' && demoLevel) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white p-6 md:p-10 pt-8">
        <div className="max-w-lg md:max-w-2xl mx-auto">
          <button
            type="button"
            onClick={handleReset}
            className="text-indigo-500 font-medium text-sm md:text-base mb-4"
          >
            ← Back
          </button>
          <h2 className="text-2xl md:text-3xl font-bold text-indigo-700 mb-1">
            {demoLevel.emoji} {demoLevel.label}
          </h2>
          <p className="text-gray-400 text-sm md:text-base mb-5">Pick a story to read</p>

          <div className="flex flex-col md:grid md:grid-cols-2 gap-3 md:gap-4">
            {/* Create Your Own Story card */}
            <button
              type="button"
              onClick={() => navigate('adventure')}
              className="text-left bg-gradient-to-br from-purple-50 to-indigo-50 rounded-2xl
                         border border-purple-200 shadow-sm p-4 md:p-5
                         active:from-purple-100 active:to-indigo-100 transition-colors
                         md:col-span-2"
            >
              <p className="font-semibold text-purple-700 text-lg md:text-xl mb-1">🗺️ Create Your Own Story</p>
              <p className="text-purple-500 text-sm md:text-base">Start an adventure where you choose what happens next!</p>
            </button>

            {demoLevel.paragraphs.map((p, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleDemoParagraph(p, i)}
                className="text-left bg-white rounded-2xl border border-gray-100 shadow-sm p-4 md:p-5
                           active:bg-indigo-50 active:border-indigo-200 transition-colors"
              >
                <p className="font-semibold text-indigo-700 text-lg md:text-xl mb-1">{p.title}</p>
                <p className="text-gray-500 text-sm md:text-base line-clamp-2">{p.text}</p>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Adventure mode ──
  if (step === 'adventure' && demoLevel) {
    return (
      <AdventureMode
        readingLevel={demoLevel.grade}
        levelEmoji={demoLevel.emoji}
        levelLabel={demoLevel.label}
        onReset={handleReset}
      />
    );
  }

  // ── Camera: fullscreen viewfinder ──
  if (step === 'camera') {
    return (
      <div className="fixed inset-0 bg-black z-50 flex flex-col">
        <canvas ref={canvasRef} className="hidden" />
        <video
          ref={videoRef}
          className="flex-1 object-cover w-full"
          playsInline
          muted
        />
        {/* Capture button overlay at bottom */}
        <div className="absolute bottom-0 inset-x-0 flex items-center justify-center pb-10 pt-6
                        bg-gradient-to-t from-black/60 to-transparent">
          <button
            type="button"
            onClick={capture}
            className="w-20 h-20 rounded-full bg-white border-4 border-indigo-400
                       flex items-center justify-center shadow-2xl
                       active:scale-90 transition-transform"
          >
            <div className="w-16 h-16 rounded-full bg-indigo-500" />
          </button>
        </div>
        {/* Cancel */}
        <button
          type="button"
          onClick={handleReset}
          aria-label="Close camera"
          className="absolute top-4 left-4 text-white text-3xl bg-black/40 rounded-full w-10 h-10
                     flex items-center justify-center"
        >
          ✕
        </button>
      </div>
    );
  }

  // ── Processing: spinner while OCR runs ──
  if (step === 'processing') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex flex-col items-center justify-center gap-4">
        <div className="w-14 h-14 md:w-18 md:h-18 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-indigo-600 font-medium text-lg md:text-xl">Reading your text…</p>
      </div>
    );
  }

  // ── Reading session ──
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      <main className="pb-8 pt-2 md:pt-6">
        <ReadingSession text={assignmentText} momentCacheKey={momentCacheKey} onReset={handleReset} />
      </main>
    </div>
  );
}
