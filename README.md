# NeuroClass Test Portal

This project is a full-stack assessment module for NeuroClass. It provides test authoring, teacher-reviewed AI question generation, student delivery with a server-validated deadline, offline-safe answer synchronization, conservative proctoring event logging, and results views sourced from actual submissions.

The required user-facing routes are `/teacher/tests`, `/teacher/question-bank`, `/student/tests`, and `/teacher/tests/:testId/results`. Read [the architecture document](docs/architecture.md) for the domain model, security boundaries, and reliability design.

## Local development

Run `pnpm dev` to start the development service, `pnpm check` for TypeScript validation, and `pnpm test` to run the Vitest suite. Database changes are represented in `drizzle/schema.ts`; generated migrations must be applied through the managed database workflow.

## AI configuration

The bundled server-side AI provider uses the platform-provisioned model gateway. No AI credential is sent to the browser. Generated questions are candidates only and require explicit teacher approval before they can become assessment content.
