export const ENV = {
  appId: process.env.VITE_APP_ID ?? "",
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  handoffSecret: process.env.PORTAL_HANDOFF_SECRET ?? process.env.JWT_SECRET ?? "",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  devAuthEnabled: process.env.NODE_ENV !== "production" && process.env.DEV_AUTH_ENABLED === "true",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  mlProctoringUrl: process.env.ML_PROCTORING_URL ?? "",
  mlProctoringApiKey: process.env.ML_PROCTORING_API_KEY ?? "",
};
