"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Contrast,
  Hand,
  Mic,
  MicOff,
  Sparkles,
  WandSparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type LayoutMode = "focus" | "balanced" | "community";

interface AdaptiveCommandCenterProps {
  processTitle: string;
  taskCount: number;
  tipCount: number;
  isAuthenticated: boolean;
}

interface BehaviorSignals {
  taskToggle: number;
  tipSubmit: number;
  vote: number;
}

type SpeechRecognitionInstance = any;

const STORAGE_KEYS = {
  mode: "gvt-layout-mode",
  contrast: "gvt-high-contrast",
  motion: "gvt-full-motion",
};

export function AdaptiveCommandCenter({
  processTitle,
  taskCount,
  tipCount,
  isAuthenticated,
}: AdaptiveCommandCenterProps) {
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("balanced");
  const [highContrast, setHighContrast] = useState(false);
  const [fullMotion, setFullMotion] = useState(true);
  const [voiceListening, setVoiceListening] = useState(false);
  const [message, setMessage] = useState("AI deck initialized.");
  const [signals, setSignals] = useState<BehaviorSignals>({
    taskToggle: 0,
    tipSubmit: 0,
    vote: 0,
  });

  const pointerStartX = useRef<number | null>(null);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  const totalInteractions = useMemo(
    () => signals.taskToggle + signals.tipSubmit + signals.vote,
    [signals],
  );

  useEffect(() => {
    const storedMode = readStorage(STORAGE_KEYS.mode);
    if (storedMode === "focus" || storedMode === "balanced" || storedMode === "community") {
      setLayoutMode(storedMode);
      applyLayoutMode(storedMode);
    }

    const storedContrast = readStorage(STORAGE_KEYS.contrast);
    const storedMotion = readStorage(STORAGE_KEYS.motion);

    const contrastValue = storedContrast === "true";
    const motionValue = storedMotion !== "false";

    setHighContrast(contrastValue);
    setFullMotion(motionValue);
    applyContrast(contrastValue);
    applyMotion(motionValue);
  }, []);

  useEffect(() => {
    const listener = (event: Event) => {
      const customEvent = event as CustomEvent<{ type?: string }>;
      const type = customEvent.detail?.type;

      if (!type) {
        return;
      }

      setSignals((previous) => ({
        ...previous,
        [type]: (previous[type as keyof BehaviorSignals] ?? 0) + 1,
      }));
    };

    window.addEventListener("gvt-behavior", listener as EventListener);

    return () => {
      window.removeEventListener("gvt-behavior", listener as EventListener);
    };
  }, []);

  useEffect(() => {
    const nextMode = inferModeFromBehavior(signals);

    if (nextMode !== layoutMode) {
      updateLayoutMode(nextMode, "Adaptive layout updated from live behavior.");
    }
  }, [signals]);

  const updateLayoutMode = (mode: LayoutMode, status: string) => {
    setLayoutMode(mode);
    setMessage(status);
    applyLayoutMode(mode);
    window.localStorage.setItem(STORAGE_KEYS.mode, mode);
  };

  const toggleContrast = () => {
    const next = !highContrast;
    setHighContrast(next);
    applyContrast(next);
    window.localStorage.setItem(STORAGE_KEYS.contrast, String(next));
    setMessage(next ? "High-contrast mode enabled." : "Default contrast restored.");
  };

  const toggleMotion = () => {
    const next = !fullMotion;
    setFullMotion(next);
    applyMotion(next);
    window.localStorage.setItem(STORAGE_KEYS.motion, String(next));
    setMessage(next ? "Full motion enabled." : "Reduced motion enabled.");
  };

  const toggleVoice = () => {
    if (voiceListening) {
      recognitionRef.current?.stop();
      setVoiceListening(false);
      setMessage("Voice listener stopped.");
      return;
    }

    const RecognitionClass =
      (window as typeof window & {
        webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
        SpeechRecognition?: new () => SpeechRecognitionInstance;
      }).SpeechRecognition ||
      (window as typeof window & {
        webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
      }).webkitSpeechRecognition;

    if (!RecognitionClass) {
      setMessage("Voice commands are not available in this browser.");
      return;
    }

    const recognition = new RecognitionClass();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = false;

    recognition.onresult = (event: any) => {
      const transcript =
        event.results[event.results.length - 1]?.[0]?.transcript?.toLowerCase().trim() ?? "";

      if (!transcript) {
        return;
      }

      if (transcript.includes("focus mode")) {
        updateLayoutMode("focus", "Voice: switched to focus mode.");
      } else if (transcript.includes("community mode")) {
        updateLayoutMode("community", "Voice: switched to community mode.");
      } else if (transcript.includes("balanced mode")) {
        updateLayoutMode("balanced", "Voice: switched to balanced mode.");
      } else if (transcript.includes("open feedback")) {
        window.dispatchEvent(new Event("gvt-open-feedback"));
        setMessage("Voice: opening feedback dialog.");
      } else if (transcript.includes("high contrast")) {
        if (!highContrast) {
          toggleContrast();
        }
      } else if (transcript.includes("normal contrast")) {
        if (highContrast) {
          toggleContrast();
        }
      } else if (transcript.includes("reduce motion")) {
        if (fullMotion) {
          toggleMotion();
        }
      } else if (transcript.includes("full motion")) {
        if (!fullMotion) {
          toggleMotion();
        }
      } else if (transcript.includes("sign in")) {
        window.location.href = "/sign-in";
      } else {
        setMessage(`Voice heard: "${transcript}"`);
      }
    };

    recognition.onend = () => {
      setVoiceListening(false);
    };

    recognition.onerror = () => {
      setVoiceListening(false);
      setMessage("Voice recognition encountered an error.");
    };

    recognitionRef.current = recognition;
    recognition.start();
    setVoiceListening(true);
    setMessage("Voice listener started. Try: 'focus mode' or 'open feedback'.");
  };

  const cycleModeByGesture = (direction: "left" | "right") => {
    const modes: LayoutMode[] = ["focus", "balanced", "community"];
    const currentIndex = modes.indexOf(layoutMode);
    const nextIndex =
      direction === "left"
        ? (currentIndex + 1) % modes.length
        : (currentIndex - 1 + modes.length) % modes.length;

    const nextMode = modes[nextIndex];
    updateLayoutMode(nextMode, `Gesture: ${direction} swipe -> ${nextMode} mode.`);
  };

  return (
    <Card
      className="bento-card texture-surface space-y-4 p-4"
      onPointerDown={(event) => {
        pointerStartX.current = event.clientX;
      }}
      onPointerUp={(event) => {
        if (pointerStartX.current === null) {
          return;
        }

        const delta = event.clientX - pointerStartX.current;
        pointerStartX.current = null;

        if (Math.abs(delta) < 48) {
          return;
        }

        cycleModeByGesture(delta < 0 ? "left" : "right");
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Adaptive AI Deck</p>
          <h3 className="text-base font-semibold text-foreground">{processTitle}</h3>
        </div>
        <Brain className="h-5 w-5 text-primary" />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="border border-border bg-card/60 p-2 text-muted-foreground">Tasks: {taskCount}</div>
        <div className="border border-border bg-card/60 p-2 text-muted-foreground">Tips: {tipCount}</div>
        <div className="border border-border bg-card/60 p-2 text-muted-foreground">
          Interactions: {totalInteractions}
        </div>
        <div className="border border-border bg-card/60 p-2 text-muted-foreground">
          Auth: {isAuthenticated ? "signed in" : "guest"}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={layoutMode === "focus" ? "secondary" : "outline"}
          onClick={() => updateLayoutMode("focus", "Manual: focus mode.")}
        >
          Focus
        </Button>
        <Button
          size="sm"
          variant={layoutMode === "balanced" ? "secondary" : "outline"}
          onClick={() => updateLayoutMode("balanced", "Manual: balanced mode.")}
        >
          Balanced
        </Button>
        <Button
          size="sm"
          variant={layoutMode === "community" ? "secondary" : "outline"}
          onClick={() => updateLayoutMode("community", "Manual: community mode.")}
        >
          Community
        </Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={toggleVoice}>
          {voiceListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          Voice
        </Button>
        <Button size="sm" variant="outline" onClick={toggleContrast}>
          <Contrast className="h-4 w-4" />
          Contrast
        </Button>
        <Button size="sm" variant="outline" onClick={toggleMotion}>
          <WandSparkles className="h-4 w-4" />
          Motion
        </Button>
      </div>

      <div className="border border-border bg-card/40 p-3 text-xs text-muted-foreground" aria-live="polite">
        <p className="flex items-center gap-2 text-foreground">
          <Hand className="h-4 w-4 text-primary" />
          Gesture enabled: swipe left/right on this panel to cycle layouts.
        </p>
        <p className="mt-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          {message}
        </p>
      </div>
    </Card>
  );
}

function inferModeFromBehavior(signals: BehaviorSignals): LayoutMode {
  if (signals.tipSubmit + signals.vote > signals.taskToggle + 1) {
    return "community";
  }

  if (signals.taskToggle >= 4) {
    return "focus";
  }

  return "balanced";
}

function applyLayoutMode(mode: LayoutMode) {
  document.documentElement.dataset.layout = mode;
  window.dispatchEvent(
    new CustomEvent("gvt-layout-mode", {
      detail: { mode },
    }),
  );
}

function applyContrast(highContrast: boolean) {
  document.documentElement.dataset.contrast = highContrast ? "high" : "normal";
}

function applyMotion(fullMotion: boolean) {
  document.documentElement.dataset.motion = fullMotion ? "full" : "reduced";
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}
