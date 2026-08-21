# NeuroClass Test Creation Portal

This project is the independent assessment portal for NeuroClass. It provides classroom-scoped test authoring, teacher-reviewed question generation, student delivery, server-validated submissions, conservative proctoring event logging, and results views sourced from actual submissions.

## Production authentication

Production authentication does **not** use Manus WebDev OAuth. `OAUTH_SERVER_URL`, Manus `openId` callbacks, `ExchangeToken`, `GetUserInfo`, `GetUserInfoWithJwt`, and Manus session-storage bearer fallbacks are not required by the production runtime.

The production flow is:

```text
NeuroClass Supabase session
  -> NeuroClass/Vercel validates the Supabase bearer token
  -> NeuroClass checks classroom ownership or student enrollment
  -> NeuroClass signs a 60-second handoff JWT
  -> test_creation exchanges the handoff at /api/auth/handoff
  -> test_creation validates issuer, audience, signature, expiry, and identity
  -> test_creation establishes its own Secure, HttpOnly, SameSite=None session
  -> every tRPC request authorizes the classroom against Supabase PostgreSQL
```

The handoff contains only the authenticated identity and optional classroom context: `userId`, `email`, `name`, `role`, and `classroomId`. It never contains a Supabase service-role key, database password, AI secret, or face embedding. The token is short-lived and is removed from the visible browser URL by the redirect performed by `/api/auth/handoff`.

`PORTAL_HANDOFF_SECRET` must be a long random secret shared only between the NeuroClass Vercel backend and the test_creation Render service. It must be identical in both deployments. Do not put this secret in Cloudflare frontend variables or iframe URLs.

## Required Render variables

```env
DATABASE_URL=<the shared Supabase PostgreSQL connection string>
PORTAL_HANDOFF_SECRET=<random secret, identical to NeuroClass Vercel>
ML_PROCTORING_URL=https://neuroclass-ai-kktd.onrender.com
ML_PROCTORING_API_KEY=<the existing AI service secret>
NODE_ENV=production
```

Do **not** configure `OAUTH_SERVER_URL` in production. The service should start without it and should not attempt to contact Manus authentication infrastructure.

## Local development

Set `NODE_ENV=development`, `DEV_AUTH_ENABLED=true`, `DATABASE_URL`, and a local `PORTAL_HANDOFF_SECRET`. Start the service with `pnpm dev`. The client’s local sign-in action calls the explicitly development-only `POST /api/auth/dev` endpoint; that endpoint is not registered in production. For integration testing, the NeuroClass backend can call `POST /api/test-portal/handoff` with a Supabase bearer token and a classroom UUID.

## Classroom and biometric authorization

The `/classroom/:classroomId` route does not trust the URL parameter by itself. Teacher access requires ownership of the corresponding NeuroClass classroom. Student access requires an enrollment row in `public.students` for the corresponding classroom. Tests, attempts, submissions, and proctoring state use the shared NeuroClass PostgreSQL data model.

Face verification is server-side. The browser sends a camera image to the portal backend, the portal backend forwards it to the Render Proctor AI service, and the AI service matches it against the student’s registered face profile. Biometric embeddings and service credentials are never returned to or stored in browser code.

## Local commands

Run `pnpm dev` to start the development service, `pnpm run build` to produce the production client and server bundles, `pnpm check` for TypeScript validation, and `pnpm test` to run the Vitest suite. Database changes are represented in `drizzle/schema.ts` and the shared NeuroClass schema; generated migrations must be applied through the managed Supabase workflow.

## AI configuration

The bundled server-side AI provider uses the configured model gateway. No AI credential is sent to the browser. Generated questions are candidates only and require explicit teacher approval before they can become assessment content.
