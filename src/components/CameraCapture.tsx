import React, { useRef, useState, useCallback } from 'react';

interface CameraCaptureProps {
  onCapture: (dataUrl: string) => void;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = useCallback(async () => {
    setError(null);

    // Try progressively simpler constraints so more devices succeed.
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
      } catch {
        // try next set of constraints
      }
    }

    if (!stream) {
      setError('Unable to access camera. Please allow camera permissions and try again.');
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      try {
        await videoRef.current.play();
      } catch {
        // play() can reject if the element is removed before playback starts — safe to ignore.
      }
      setStreaming(true);
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setStreaming(false);
  }, []);

  const capturePhoto = useCallback(() => {
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
    onCapture(dataUrl);
  }, [onCapture, stopCamera]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const dataUrl = evt.target?.result as string;
      if (dataUrl) onCapture(dataUrl);
    };
    reader.readAsDataURL(file);
  }, [onCapture]);

  return (
    <div className="flex flex-col items-center gap-4 w-full max-w-lg mx-auto p-4">
      <h2 className="text-2xl font-bold text-indigo-700 text-center">
        📖 Capture Reading Assignment
      </h2>
      <p className="text-gray-500 text-sm text-center">
        Point your camera at a printed text and tap <strong>Capture</strong>, or upload a photo from your gallery.
      </p>

      {/* Video preview */}
      <div className="relative w-full rounded-2xl overflow-hidden bg-black shadow-lg">
        <video
          ref={videoRef}
          className="w-full aspect-video object-cover"
          playsInline
          muted
        />
        {!streaming && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/70">
            <span className="text-white text-4xl">📷</span>
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />

      {error && (
        <p className="text-red-600 text-sm text-center bg-red-50 rounded-lg p-3 w-full">{error}</p>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3 w-full">
        {!streaming ? (
          <button
            type="button"
            onClick={startCamera}
            className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-semibold text-lg
                       active:bg-indigo-700 transition-colors shadow"
          >
            📷 Open Camera
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={capturePhoto}
              className="flex-1 py-3 rounded-xl bg-green-500 text-white font-semibold text-lg
                         active:bg-green-600 transition-colors shadow"
            >
              📸 Capture
            </button>
            <button
              type="button"
              onClick={stopCamera}
              className="flex-1 py-3 rounded-xl bg-gray-200 text-gray-700 font-semibold text-lg
                         active:bg-gray-300 transition-colors"
            >
              ✕ Cancel
            </button>
          </>
        )}
      </div>

      <div className="flex items-center gap-2 w-full">
        <hr className="flex-1 border-gray-200" />
        <span className="text-gray-400 text-sm">or</span>
        <hr className="flex-1 border-gray-200" />
      </div>

      <label className="w-full py-3 rounded-xl bg-gray-100 text-gray-600 font-medium text-center
                         cursor-pointer active:bg-gray-200 transition-colors">
        🖼️ Upload from Gallery
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileUpload}
          className="hidden"
        />
      </label>
    </div>
  );
};

export default CameraCapture;
