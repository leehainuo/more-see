import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useSessionStore } from "@/store/useSessionStore";

type VoiceCaptureOptions = {
  sessionId: string | null;
  inputSource: "camera" | "screen";
  visionEnabled: boolean;
  onBargeInProbe?: (sessionId: string) => void;
  onUserSpeechActivity?: (active: boolean) => void;
  sendAudioChunk: (payload: {
    sessionId: string;
    chunkId: string;
    mimeType: string;
    base64Audio: string;
    durationMs: number;
  }) => void;
  commitTurn: (payload: {
    sessionId: string;
    turnId: string;
    frameId?: string;
    silenceMs: number;
    includeVision: boolean;
  }) => void;
  captureFrameForTurn: (payload: { sessionId: string; inputSource: "camera" | "screen" }) => Promise<string | null>;
};

const SILENCE_THRESHOLD = 0.02;
const ECHO_START_THRESHOLD_MULTIPLIER = 3.8;
const EARLY_ASSISTANT_ECHO_START_THRESHOLD_MULTIPLIER = 8.5;
const ASSISTANT_ECHO_GUARD_MS = 1800;
const ASSISTANT_EARLY_TRIGGER_REQUIRED_HITS = 2;
const AUTO_COMMIT_MS = 700;
const TARGET_SAMPLE_RATE = 16000;
// 8192 samples at common browser input rates lands around 170-185ms,
// which is closer to the ASR doc recommendation of 100-200ms per chunk.
const PROCESSOR_BUFFER_SIZE = 8192;
const PRE_ROLL_CHUNKS = 2;
const TAIL_SILENCE_MS = 500;

function arrayBufferToBase64(arrayBuffer: ArrayBufferLike) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function downsampleToPcm16(input: Float32Array, sourceRate: number, targetRate: number): Int16Array {
  if (sourceRate < targetRate) {
    throw new Error(`无法将 ${sourceRate}Hz 上采样到 ${targetRate}Hz。`);
  }

  const ratio = sourceRate / targetRate;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const result = new Int16Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;

  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.min(input.length, Math.round((offsetResult + 1) * ratio));
    let accum = 0;
    let count = 0;
    for (let index = offsetBuffer; index < nextOffsetBuffer; index += 1) {
      accum += input[index];
      count += 1;
    }
    const sample = count > 0 ? accum / count : 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    result[offsetResult] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }

  return result;
}

export function useVoiceCapture({
  sessionId,
  inputSource,
  visionEnabled,
  onBargeInProbe,
  onUserSpeechActivity,
  sendAudioChunk,
  commitTurn,
  captureFrameForTurn,
}: VoiceCaptureOptions) {
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const muteGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const chunkCountRef = useRef(0);
  const recordedDurationMsRef = useRef(0);
  const isTurnActiveRef = useRef(false);
  const committingTurnRef = useRef(false);
  const visionCaptureRequestedRef = useRef(false);
  const bargeInTriggeredRef = useRef(false);
  const speechActiveRef = useRef(false);
  const lastSpeechAtRef = useRef<number | null>(null);
  const preRollChunksRef = useRef<Int16Array[]>([]);
  const assistantSpeechProbeRef = useRef<{ active: boolean; loggedAtMs: number | null }>({
    active: false,
    loggedAtMs: null,
  });
  const assistantSpeechWindowRef = useRef<{
    active: boolean;
    startedAtMs: number | null;
    overThresholdHits: number;
  }>({
    active: false,
    startedAtMs: null,
    overThresholdHits: 0,
  });
  const [isCapturing, setIsCapturing] = useState(false);
  const inputLevel = useSessionStore((state) => state.inputLevel);
  const recordedChunks = useSessionStore((state) => state.recordedChunks);

  const setRecordingState = useMemo(() => useSessionStore.getState().setRecordingState, []);
  const setRecordedChunks = useMemo(() => useSessionStore.getState().setRecordedChunks, []);

  const cleanupSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const resetTurnState = useCallback(() => {
    isTurnActiveRef.current = false;
    bargeInTriggeredRef.current = false;
    lastSpeechAtRef.current = null;
    preRollChunksRef.current = [];
    if (speechActiveRef.current) {
      speechActiveRef.current = false;
      onUserSpeechActivity?.(false);
    }
    chunkCountRef.current = 0;
    recordedDurationMsRef.current = 0;
    visionCaptureRequestedRef.current = false;
    setRecordedChunks(0);
    setRecordingState("ready", 0);
  }, [onUserSpeechActivity, setRecordedChunks, setRecordingState]);

  const finalizeTurn = useCallback(
    async (activeSessionId: string) => {
      const turnId = crypto.randomUUID();
      let frameId: string | undefined;
      if (visionEnabled) {
        visionCaptureRequestedRef.current = true;
        frameId = (await captureFrameForTurn({ sessionId: activeSessionId, inputSource })) ?? undefined;
      }
      const hasAnyStoredFrame = Boolean(useSessionStore.getState().lastFrameStoredId);
      const includeVision = Boolean(visionEnabled && (frameId || hasAnyStoredFrame));

      commitTurn({
        sessionId: activeSessionId,
        turnId,
        frameId,
        silenceMs: AUTO_COMMIT_MS,
        includeVision,
      });
    },
    [captureFrameForTurn, commitTurn, inputSource, visionEnabled],
  );

  const commitCurrentTurn = useCallback(() => {
    if (committingTurnRef.current) {
      return;
    }
    cleanupSilenceTimer();

    const activeSessionId = sessionId;
    if (!activeSessionId || !isTurnActiveRef.current || recordedDurationMsRef.current <= 0) {
      resetTurnState();
      return;
    }

    committingTurnRef.current = true;
    isTurnActiveRef.current = false;
    bargeInTriggeredRef.current = false;
    if (speechActiveRef.current) {
      speechActiveRef.current = false;
      onUserSpeechActivity?.(false);
    }
    setRecordingState("recognizing", 0);

    void finalizeTurn(activeSessionId).finally(() => {
      committingTurnRef.current = false;
      chunkCountRef.current = 0;
      recordedDurationMsRef.current = 0;
      bargeInTriggeredRef.current = false;
      if (speechActiveRef.current) {
        speechActiveRef.current = false;
        onUserSpeechActivity?.(false);
      }
      visionCaptureRequestedRef.current = false;
      setRecordedChunks(0);
    });
  }, [
    cleanupSilenceTimer,
    finalizeTurn,
    onUserSpeechActivity,
    resetTurnState,
    sessionId,
    setRecordedChunks,
    setRecordingState,
  ]);

  const stopCapture = useCallback(() => {
    cleanupSilenceTimer();
    isTurnActiveRef.current = false;
    committingTurnRef.current = false;
    bargeInTriggeredRef.current = false;
    if (speechActiveRef.current) {
      speechActiveRef.current = false;
      onUserSpeechActivity?.(false);
    }
    analyserRef.current = null;
    processorRef.current?.disconnect();
    processorRef.current = null;
    sourceNodeRef.current?.disconnect();
    sourceNodeRef.current = null;
    muteGainRef.current?.disconnect();
    muteGainRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setIsCapturing(false);
    setRecordedChunks(0);
    setRecordingState("ready", 0);
  }, [cleanupSilenceTimer, onUserSpeechActivity, setRecordedChunks, setRecordingState]);

  const monitorVolume = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) {
      return;
    }

    const dataArray = new Uint8Array(analyser.fftSize);
    const tick = () => {
      if (!processorRef.current || !streamRef.current) {
        return;
      }

      analyser.getByteTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let index = 0; index < dataArray.length; index += 1) {
        const normalized = (dataArray[index] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / dataArray.length);
      const normalizedLevel = Math.min(1, rms * 10);
      if (isTurnActiveRef.current) {
        setRecordingState("recording", normalizedLevel);
      }

      if (rms > SILENCE_THRESHOLD) {
        cleanupSilenceTimer();
      } else if (isTurnActiveRef.current && !silenceTimerRef.current) {
        silenceTimerRef.current = window.setTimeout(() => {
          commitCurrentTurn();
        }, AUTO_COMMIT_MS);
      }

      window.requestAnimationFrame(tick);
    };

    window.requestAnimationFrame(tick);
  }, [cleanupSilenceTimer, commitCurrentTurn, setRecordingState]);

  const startCapture = useCallback(async () => {
    if (!sessionId || isCapturing) {
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      useSessionStore.setState({
        sessionStatus: "error",
        systemMessage: "当前浏览器不支持麦克风采集，请更换到支持 getUserMedia 的环境。",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
        video: false,
      });

      streamRef.current = stream;
      resetTurnState();
      setIsCapturing(true);

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      const processor = audioContext.createScriptProcessor(PROCESSOR_BUFFER_SIZE, 1, 1);
      const muteGain = audioContext.createGain();
      muteGain.gain.value = 0;

      analyser.fftSize = 1024;
      source.connect(analyser);
      source.connect(processor);
      processor.connect(muteGain);
      muteGain.connect(audioContext.destination);

      audioContextRef.current = audioContext;
      sourceNodeRef.current = source;
      processorRef.current = processor;
      muteGainRef.current = muteGain;
      analyserRef.current = analyser;

      processor.onaudioprocess = (event) => {
        if (!sessionId || committingTurnRef.current) {
          return;
        }

        const channelData = event.inputBuffer.getChannelData(0);
        const pcm16 = downsampleToPcm16(channelData, audioContext.sampleRate, TARGET_SAMPLE_RATE);
        if (pcm16.byteLength === 0) {
          return;
        }

        let sumSquares = 0;
        for (let index = 0; index < channelData.length; index += 1) {
          sumSquares += channelData[index] * channelData[index];
        }
        const rms = Math.sqrt(sumSquares / channelData.length);
        const storeState = useSessionStore.getState();
        const assistantSpeaking = storeState.assistantAudioStatus === "speaking";
        const canStartTurn = ["ready", "recording", "streaming"].includes(storeState.sessionStatus);
        const now = performance.now();

        if (assistantSpeaking) {
          if (!assistantSpeechWindowRef.current.active) {
            assistantSpeechWindowRef.current = {
              active: true,
              startedAtMs: now,
              overThresholdHits: 0,
            };
          }
        } else {
          assistantSpeechProbeRef.current = {
            active: false,
            loggedAtMs: null,
          };
          assistantSpeechWindowRef.current = {
            active: false,
            startedAtMs: null,
            overThresholdHits: 0,
          };
        }

        const sendPcmChunk = (pcm: Int16Array) => {
          const durationMs = Math.round((pcm.length / TARGET_SAMPLE_RATE) * 1000);
          chunkCountRef.current += 1;
          recordedDurationMsRef.current += durationMs;
          setRecordedChunks(chunkCountRef.current);
          sendAudioChunk({
            sessionId,
            chunkId: crypto.randomUUID(),
            mimeType: "audio/pcm;rate=16000",
            base64Audio: arrayBufferToBase64(pcm.buffer),
            durationMs,
          });
        };

        if (!isTurnActiveRef.current) {
          if (!canStartTurn) {
            return;
          }
          if (!assistantSpeaking) {
            preRollChunksRef.current = [...preRollChunksRef.current, pcm16].slice(-PRE_ROLL_CHUNKS);
          } else {
            preRollChunksRef.current = [];
          }

          const assistantWarmupElapsedMs = assistantSpeaking
            ? now - (assistantSpeechWindowRef.current.startedAtMs ?? now)
            : 0;
          const inAssistantEchoGuardWindow = assistantSpeaking && assistantWarmupElapsedMs < ASSISTANT_ECHO_GUARD_MS;
          const startThreshold = assistantSpeaking
            ? SILENCE_THRESHOLD *
              (inAssistantEchoGuardWindow
                ? EARLY_ASSISTANT_ECHO_START_THRESHOLD_MULTIPLIER
                : ECHO_START_THRESHOLD_MULTIPLIER)
            : SILENCE_THRESHOLD;
          if (
            assistantSpeaking &&
            (!assistantSpeechProbeRef.current.active || assistantSpeechProbeRef.current.loggedAtMs === null)
          ) {
            assistantSpeechProbeRef.current = {
              active: true,
              loggedAtMs: now,
            };
            // #region debug-point A:first-speaking-chunk
            fetch("http://127.0.0.1:7777/event", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: "self-barge-in",
                runId: "post-fix",
                hypothesisId: "A",
                location: "frontend/src/hooks/useVoiceCapture.ts:onaudioprocess:first-speaking-chunk",
                msg: "[DEBUG] first mic chunk observed while assistantSpeaking",
                data: {
                  sessionId,
                  rms,
                  startThreshold,
                  assistantWarmupElapsedMs,
                  sessionStatus: storeState.sessionStatus,
                  assistantAudioStatus: storeState.assistantAudioStatus,
                  recordedDurationMs: recordedDurationMsRef.current,
                  chunkCount: chunkCountRef.current,
                },
                ts: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
          }
          if (rms <= startThreshold) {
            if (assistantSpeaking) {
              assistantSpeechWindowRef.current.overThresholdHits = 0;
            }
            return;
          }

          if (assistantSpeaking && !bargeInTriggeredRef.current) {
            assistantSpeechWindowRef.current.overThresholdHits += 1;
            const requiredHits = inAssistantEchoGuardWindow ? ASSISTANT_EARLY_TRIGGER_REQUIRED_HITS : 1;
            if (assistantSpeechWindowRef.current.overThresholdHits < requiredHits) {
              return;
            }
            assistantSpeechWindowRef.current.overThresholdHits = 0;
            // #region debug-point A:barge-trigger
            fetch("http://127.0.0.1:7777/event", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionId: "self-barge-in",
                runId: "post-fix",
                hypothesisId: "A",
                location: "frontend/src/hooks/useVoiceCapture.ts:onaudioprocess:barge-trigger",
                msg: "[DEBUG] mic audio crossed assistant speaking threshold",
                data: {
                  sessionId,
                  rms,
                  startThreshold,
                  assistantWarmupElapsedMs,
                  inAssistantEchoGuardWindow,
                  requiredHits,
                  echoMultiplier: ECHO_START_THRESHOLD_MULTIPLIER,
                  sessionStatus: storeState.sessionStatus,
                  assistantAudioStatus: storeState.assistantAudioStatus,
                },
                ts: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
            bargeInTriggeredRef.current = true;
            onBargeInProbe?.(sessionId);
          }
          if (!speechActiveRef.current) {
            speechActiveRef.current = true;
            onUserSpeechActivity?.(true);
          }

          isTurnActiveRef.current = true;
          chunkCountRef.current = 0;
          recordedDurationMsRef.current = 0;
          lastSpeechAtRef.current = now;
          cleanupSilenceTimer();

          if (!assistantSpeaking && preRollChunksRef.current.length > 0) {
            preRollChunksRef.current.forEach((chunk) => {
              sendPcmChunk(chunk);
            });
          }
          preRollChunksRef.current = [];
        }

        if (rms > SILENCE_THRESHOLD) {
          lastSpeechAtRef.current = now;
        }
        const lastSpeechAt = lastSpeechAtRef.current ?? now;
        if (now - lastSpeechAt > TAIL_SILENCE_MS) {
          return;
        }

        sendPcmChunk(pcm16);
      };

      setRecordingState("ready", 0);
      monitorVolume();
    } catch (error) {
      const message = error instanceof Error ? error.message : "未知错误";
      useSessionStore.setState({
        sessionStatus: "error",
        systemMessage: `麦克风启动失败：${message}`,
      });
      setIsCapturing(false);
    }
  }, [
    captureFrameForTurn,
    isCapturing,
    inputSource,
    monitorVolume,
    cleanupSilenceTimer,
    resetTurnState,
    sendAudioChunk,
    sessionId,
    setRecordedChunks,
    setRecordingState,
    visionEnabled,
    onBargeInProbe,
    onUserSpeechActivity,
  ]);

  useEffect(() => {
    return () => {
      cleanupSilenceTimer();
      processorRef.current?.disconnect();
      sourceNodeRef.current?.disconnect();
      muteGainRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      audioContextRef.current?.close();
    };
  }, [cleanupSilenceTimer]);

  return {
    inputLevel,
    recordedChunks,
    isCapturing,
    startCapture,
    stopCapture,
    commitCurrentTurn,
  };
}
