# NeuroClass Assessment Portal Architecture

## Product boundary

The assessment portal is a module for the existing NeuroClass experience rather than a separate quiz product. Its interface uses an ink-black workspace, precise electric-violet highlights, restrained cyan status indicators, compact technical labels, and rounded glass panels. This reflects the existing site’s dark, editorial, AI-native visual language while keeping high-risk examination actions legible and accessible.

## Runtime design

The application uses the supplied React, TypeScript, Express, tRPC, Drizzle, and MySQL-compatible database stack. The server is the source of truth for tests, access controls, answer persistence, attempt start and expiry timestamps, submissions, and proctoring events. The browser keeps only interaction state, a local offline answer queue, and UI preferences.

| Concern | Server authority | Client responsibility |
| --- | --- | --- |
| Assessment lifecycle | Test status, schedule, assignments, security settings, publish decision | Form drafting and optimistic navigation |
| Question quality | Approved questions only are attached to an assessment | Teacher reviews AI candidates before adding them |
| Attempt timing | `startedAt` and `expiresAt` are established and validated on every write | Countdown display calculated from server timestamps |
| Answers | Validated persisted answers and final submission lock | Debounced save and encrypted-by-origin local retry queue |
| Proctoring | Event log and a conservative review score | Browser capability signals only, with explicit consent-aware messaging |
| Analytics | Aggregated completed-attempt data | Charts and empty-state explanations |

## Domain model

Assessments own configuration and a teacher-approved ordering of questions. Assignments control who can access each assessment. An attempt is a time-bounded student session whose answers are saved independently. Proctoring events are evidence for teacher review, not cheating declarations. AI generation records candidate material and audit metadata; candidates are not associated with a live assessment until a teacher explicitly approves them.

```text
users ─┬─ classrooms ── classroom_members
       ├─ tests ── test_settings
       │          ├─ test_questions ── questions ── question_options
       │          ├─ test_assignments
       │          └─ test_attempts ── attempt_answers
       │                              └─ proctoring_events
       └─ ai_generation_logs
```

## API and authorization policy

The project exposes typed procedures beneath `appRouter.assessments`, `appRouter.questions`, `appRouter.attempts`, `appRouter.proctoring`, and `appRouter.results`. Teachers may create and manage only their own tests and question-bank records. Students may access only a currently assigned test and only their own attempt. Correct answers are never returned by student-facing procedures before an attempt is submitted and its teacher-selected result visibility permits feedback.

## AI provider abstraction

`AIProvider` accepts a structured question-generation request and returns candidate questions with answer keys and quality warnings. The default implementation calls the server-only built-in language-model helper using a strict JSON schema. A provider is selected in the service layer, not in React components, so a future OpenAI, Gemini, Anthropic, OpenRouter, or local-model implementation can conform to the same contract. Each candidate remains `pending_review`; no generation procedure writes directly to `test_questions`.

## State management and reliability

React Query via tRPC manages remote records and invalidation. React Hook Form manages the test wizard, with one local draft object across steps. The assessment-taking interface maintains answer and review state in a reducer; `useOfflineAnswerQueue` writes unsent answer payloads to `localStorage`, synchronizes on reconnect, and clears a queue item only after server acknowledgement. The countdown uses the API-provided `expiresAt`, recalculates from `Date.now()`, and is rehydrated by `attempts.getActive` after refresh. On any answer write or submission request, the server verifies expiry and rejects answers after the deadline.

## Honest monitoring posture

> AI monitoring provides review signals such as fullscreen exits, visibility changes, and optional camera-analysis events. It cannot guarantee that every form of misconduct, external device, or intent is detected. Teachers review accumulated, contextualized signals before making any decision.

Browser APIs can reliably report page visibility and fullscreen changes. Camera availability and model-driven face signals are possible only with permissions and compatible hardware. Detecting hidden phones, external displays, or a student’s intent is outside the platform’s guaranteed capabilities.
