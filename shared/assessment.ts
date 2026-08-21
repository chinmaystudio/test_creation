export const QUESTION_TYPES = [
  "mcq",
  "multiple_select",
  "true_false",
  "fill_blank",
  "short_answer",
  "long_answer",
  "numerical",
  "coding",
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];

export const TEST_STATUSES = [
  "draft",
  "scheduled",
  "live",
  "completed",
  "archived",
] as const;

export type TestStatus = (typeof TEST_STATUSES)[number];

export type SecurityConfiguration = {
  cameraMonitoring: boolean;
  faceVerification: boolean;
  tabSwitchDetection: boolean;
  fullscreenMode: boolean;
  copyPasteRestriction: boolean;
  multipleFaceDetection: boolean;
  unknownFaceDetection: boolean;
  suspiciousBehaviourLogging: boolean;
};

export const DEFAULT_SECURITY_CONFIGURATION: SecurityConfiguration = {
  cameraMonitoring: false,
  faceVerification: false,
  tabSwitchDetection: true,
  fullscreenMode: false,
  copyPasteRestriction: false,
  multipleFaceDetection: false,
  unknownFaceDetection: false,
  suspiciousBehaviourLogging: true,
};

export type TestConfiguration = {
  durationMinutes: number;
  passingPercentage: number;
  attemptLimit: number;
  navigationMode: "sequential" | "free";
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  negativeMarking: boolean;
  autoSubmit: boolean;
  allowBackNavigation: boolean;
  showResultsImmediately: boolean;
  showCorrectAnswers: boolean;
  allowAnswerReview: boolean;
  resultsReleased: boolean;
  adaptiveAssessment: boolean;
};

export const DEFAULT_TEST_CONFIGURATION: TestConfiguration = {
  durationMinutes: 60,
  passingPercentage: 40,
  attemptLimit: 1,
  navigationMode: "free",
  shuffleQuestions: false,
  shuffleOptions: false,
  negativeMarking: false,
  autoSubmit: true,
  allowBackNavigation: true,
  showResultsImmediately: false,
  showCorrectAnswers: false,
  allowAnswerReview: false,
  resultsReleased: false,
  adaptiveAssessment: false,
};

export type CandidateQuestion = {
  questionText: string;
  type: QuestionType;
  options: Array<{ text: string; isCorrect: boolean }>;
  correctAnswer: string;
  explanation: string;
  marks: number;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
  learningObjective: string;
  qualityWarnings: string[];
};
