/**
 * Hook: manages App-level navigation steps with history support.
 * Provides a simple state machine for screen navigation.
 */

import { useState, useCallback, useRef } from 'react';

export type AppStep = 'home' | 'camera' | 'processing' | 'reading' | 'demo-pick' | 'adventure' | 'dashboard' | 'my-stories';

export function useAppStep(initial: AppStep = 'home') {
  const [step, setStep] = useState<AppStep>(initial);
  const historyRef = useRef<AppStep[]>([]);

  const navigate = useCallback((to: AppStep) => {
    setStep((current) => {
      historyRef.current = [...historyRef.current, current];
      return to;
    });
  }, []);

  const goBack = useCallback(() => {
    const prev = historyRef.current;
    if (prev.length === 0) {
      setStep('home');
    } else {
      const newHistory = [...prev];
      const previous = newHistory.pop()!;
      historyRef.current = newHistory;
      setStep(previous);
    }
  }, []);

  const goHome = useCallback(() => {
    setStep('home');
    historyRef.current = [];
  }, []);

  return { step, navigate, goBack, goHome };
}
