import { useCallback, useEffect, useRef, useState } from "react";

export type ProctoringFeatureVector = {
  facePresent?: boolean; faceCount?: number; faceBboxArea?: number; faceCenterX?: number; faceCenterY?: number;
  frameQuality?: number; movementScore?: number; provider: string;
};

type FaceRecord = { boundingBox: DOMRectReadOnly };
type FaceDetectorLike = { detect: (source: ImageBitmapSource) => Promise<FaceRecord[]> };
type FaceDetectorConstructor = new (options?: { fastMode?: boolean; maxDetectedFaces?: number }) => FaceDetectorLike;

export function useProctoringFeatures({ enabled, samplingHz = 1, onFeatures }: { enabled: boolean; samplingHz?: number; onFeatures: (features: ProctoringFeatureVector) => void }) {
  const [status, setStatus] = useState<"idle" | "starting" | "ready" | "unavailable">("idle");
  const streamRef = useRef<MediaStream | undefined>(undefined); const videoRef = useRef<HTMLVideoElement | undefined>(undefined); const timerRef = useRef<number | undefined>(undefined); const previousBrightness = useRef<number | undefined>(undefined); const callback = useRef(onFeatures);
  callback.current = onFeatures;
  const stop = useCallback(() => { if (timerRef.current) window.clearInterval(timerRef.current); timerRef.current = undefined; streamRef.current?.getTracks().forEach(track => track.stop()); streamRef.current = undefined; videoRef.current = undefined; setStatus("idle"); }, []);
  const sample = useCallback(async () => {
    const video = videoRef.current; if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
    const canvas = document.createElement("canvas"); canvas.width = 64; canvas.height = 48; const context = canvas.getContext("2d", { willReadFrequently: true }); if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height); const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let total = 0; let squared = 0; for (let index = 0; index < pixels.length; index += 4) { const value = (pixels[index] + pixels[index + 1] + pixels[index + 2]) / 3; total += value; squared += value * value; }
    const brightness = total / (pixels.length / 4); const variance = Math.max(0, squared / (pixels.length / 4) - brightness * brightness); const frameQuality = Math.min(1, Math.sqrt(variance) / 64);
    const movementScore = previousBrightness.current === undefined ? 0 : Math.min(1, Math.abs(brightness - previousBrightness.current) / 48); previousBrightness.current = brightness;
    const detectorConstructor = (window as unknown as { FaceDetector?: FaceDetectorConstructor }).FaceDetector;
    if (!detectorConstructor) { callback.current({ frameQuality, movementScore, provider: "camera_quality_only" }); return; }
    try {
      const faces = await new detectorConstructor({ fastMode: true, maxDetectedFaces: 3 }).detect(video); const face = faces[0]?.boundingBox;
      callback.current({ facePresent: faces.length > 0, faceCount: faces.length, faceBboxArea: face ? (face.width * face.height) / Math.max(1, video.videoWidth * video.videoHeight) : undefined, faceCenterX: face ? (face.x + face.width / 2) / Math.max(1, video.videoWidth) : undefined, faceCenterY: face ? (face.y + face.height / 2) / Math.max(1, video.videoHeight) : undefined, frameQuality, movementScore, provider: "browser_native_face_detector" });
    } catch { callback.current({ frameQuality, movementScore, provider: "camera_quality_only" }); }
  }, []);
  useEffect(() => { if (!enabled) { stop(); return; } let cancelled = false; const begin = async () => { setStatus("starting"); try { const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: Math.min(10, samplingHz * 2) } }, audio: false }); if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; } const video = document.createElement("video"); video.muted = true; video.playsInline = true; video.srcObject = stream; await video.play(); streamRef.current = stream; videoRef.current = video; setStatus("ready"); await sample(); timerRef.current = window.setInterval(() => { void sample(); }, Math.round(1000 / Math.max(1, Math.min(5, samplingHz)))); } catch { setStatus("unavailable"); } }; void begin(); return () => { cancelled = true; stop(); }; }, [enabled, sample, samplingHz, stop]);
  return { status, stop };
}
