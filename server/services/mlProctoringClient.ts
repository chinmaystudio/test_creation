import { z } from "zod";
import { ENV } from "../_core/env";

const severitySchema = z.enum(["low", "medium", "high"]);
const responseSchema = z.object({
  anomaly_score: z.number().min(0).max(100),
  risk_score: z.number().min(0).max(100),
  risk_level: z.enum(["low", "medium", "high"]),
  confidence: z.number().min(0).max(1),
  events: z.array(z.object({
    event_type: z.enum(["face_missing", "multiple_faces", "unknown_face", "head_away", "gaze_deviation", "camera_obstructed", "behavior_anomaly"]),
    severity: severitySchema,
    confidence: z.number().min(0).max(1),
    duration_seconds: z.number().min(0),
    evidence: z.record(z.string(), z.unknown()),
  })),
  baseline: z.record(z.string(), z.unknown()),
  temporal_state: z.record(z.string(), z.unknown()),
  model_version: z.string().min(1).max(100),
  baseline_ready: z.boolean(),
});

export type MlFeatureVector = {
  facePresent?: boolean;
  faceCount?: number;
  faceBboxArea?: number;
  faceCenterX?: number;
  faceCenterY?: number;
  headPoseYaw?: number;
  headPosePitch?: number;
  headPoseRoll?: number;
  gazeHorizontal?: number;
  gazeVertical?: number;
  landmarkStability?: number;
  faceQuality?: number;
  frameQuality?: number;
  movementScore?: number;
  provider?: string;
};

export type MlPolicy = {
  baselineSeconds: number;
  minimumEventSeconds: number;
  eventCooldownSeconds: number;
};

export const isMlProctoringConfigured = () => Boolean(ENV.mlProctoringUrl && ENV.mlProctoringApiKey);

function serviceUrl(path: string) {
  return `${ENV.mlProctoringUrl.replace(/\/$/, "")}${path}`;
}

function snakeFeatures(features: MlFeatureVector) {
  return {
    face_present: features.facePresent,
    face_count: features.faceCount,
    face_bbox_area: features.faceBboxArea,
    face_center_x: features.faceCenterX,
    face_center_y: features.faceCenterY,
    head_pose_yaw: features.headPoseYaw,
    head_pose_pitch: features.headPosePitch,
    head_pose_roll: features.headPoseRoll,
    gaze_horizontal: features.gazeHorizontal,
    gaze_vertical: features.gazeVertical,
    landmark_stability: features.landmarkStability,
    face_quality: features.faceQuality,
    frame_quality: features.frameQuality,
    movement_score: features.movementScore,
    provider: features.provider ?? "browser_native",
  };
}

function snakePolicy(policy: MlPolicy) {
  return {
    baseline_seconds: policy.baselineSeconds,
    minimum_event_seconds: policy.minimumEventSeconds,
    event_cooldown_seconds: policy.eventCooldownSeconds,
  };
}

async function request(path: string, body?: Record<string, unknown>) {
  if (!isMlProctoringConfigured()) throw new Error("The ML proctoring service is not configured.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(serviceUrl(path), {
      method: body ? "POST" : "GET",
      headers: { "X-Proctoring-Service-Key": ENV.mlProctoringApiKey, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`ML service responded ${response.status}.`);
    return await response.json() as unknown;
  } finally {
    clearTimeout(timer);
  }
}

export async function mlServiceHealth() {
  if (!isMlProctoringConfigured()) return { ready: false, reason: "The ML service URL and service key have not been configured." };
  try {
    const response = await request("/ready");
    const parsed = z.object({ ready: z.boolean(), model_version: z.string().optional() }).parse(response);
    return { ready: parsed.ready, modelVersion: parsed.model_version, reason: parsed.ready ? undefined : "The deployed ML service is not ready." };
  } catch {
    return { ready: false, reason: "The ML service could not be reached." };
  }
}

export async function startMlBaseline(attemptId: string) {
  return await request("/v1/proctoring/baseline/start", { attempt_id: attemptId }) as Record<string, unknown>;
}

export async function updateMlBaseline(attemptId: string, baseline: Record<string, unknown>, features: MlFeatureVector) {
  return await request("/v1/proctoring/baseline/update", { attempt_id: attemptId, baseline, features: snakeFeatures(features) }) as Record<string, unknown>;
}

export async function finalizeMlBaseline(attemptId: string, baseline: Record<string, unknown>, features: MlFeatureVector) {
  return await request("/v1/proctoring/baseline/finalize", { attempt_id: attemptId, baseline, features: snakeFeatures(features) }) as Record<string, unknown>;
}

export async function analyzeMlFeatures(input: { attemptId: string; studentId: number; baseline: Record<string, unknown>; temporalState: Record<string, unknown>; features: MlFeatureVector; faceVerified?: boolean; policy: MlPolicy }) {
  const raw = await request("/v1/proctoring/analyze", {
    attempt_id: input.attemptId,
    student_id: String(input.studentId),
    timestamp: new Date().toISOString(),
    features: snakeFeatures(input.features),
    face_verified: input.faceVerified,
    baseline: input.baseline,
    temporal_state: input.temporalState,
    policy: snakePolicy(input.policy),
  });
  return responseSchema.parse(raw);
}
