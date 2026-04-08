import { useState, useRef, useCallback, useEffect } from 'react';
import ReadingSession from './components/ReadingSession';
import { recognizeText } from './services/ocrService';

type AppStep = 'home' | 'camera' | 'processing' | 'reading';

export default function App() {
  const [step, setStep] = useState<AppStep>('home');
  const [assignmentText, setAssignmentText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const openCamera = useCallback(async () => {
    setError(null);
    setStep('camera');

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
      setStep('home');
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      try { await videoRef.current.play(); } catch { /* safe to ignore */ }
    }
  }, []);

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
    setStep('processing');

    try {
      const result = await recognizeText(dataUrl);
      if (result.text.trim()) {
        setAssignmentText(result.text);
        setStep('reading');
      } else {
        setError('No text found — try again with clearer text.');
        setStep('home');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('home');
    }
  }, [stopCamera]);

  const handleReset = useCallback(() => {
    stopCamera();
    setAssignmentText('');
    setError(null);
    setStep('home');
  }, [stopCamera]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, []);

  // ── Home: just a big camera button ──
  if (step === 'home') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white flex flex-col items-center justify-center gap-6 p-6">
        <canvas ref={canvasRef} className="hidden" />
        <h1 className="text-3xl font-bold text-indigo-700">📖 Reading Assistant</h1>

        {error && (
          <p className="text-red-600 text-sm text-center bg-red-50 rounded-xl p-3 max-w-xs">{error}</p>
        )}

        <button
          type="button"
          onClick={openCamera}
          className="w-32 h-32 rounded-full bg-indigo-600 text-white text-6xl
                     flex items-center justify-center shadow-xl
                     active:bg-indigo-700 active:scale-95 transition-all"
        >
          📷
        </button>
        <p className="text-gray-400 text-sm">Tap to scan your reading</p>
      </div>
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
        <div className="w-14 h-14 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-indigo-600 font-medium text-lg">Reading your text…</p>
      </div>
    );
  }

  // ── Reading session ──
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      <main className="pb-8 pt-2">
        <ReadingSession text={assignmentText} onReset={handleReset} />
      </main>
    </div>
  );
}
