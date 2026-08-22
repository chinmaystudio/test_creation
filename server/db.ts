import { eq } from "drizzle-orm";
import postgres from 'postgres';
import { drizzle } from "drizzle-orm/postgres-js";
import { InsertUser, User, users } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;
let _sql: ReturnType<typeof postgres> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      const client = postgres(process.env.DATABASE_URL);
      _db = drizzle(client);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onConflictDoUpdate({
      target: users.openId,
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

export function getSql() {
  if (!_sql && process.env.DATABASE_URL) {
    try {
      _sql = postgres(process.env.DATABASE_URL, { max: 5, prepare: false });
    } catch (error) {
      console.warn("[Database] Failed to create shared SQL client:", error);
      _sql = null;
    }
  }
  return _sql;
}

// TODO: add feature queries here as your schema grows.


export async function upsertHandoffUser(input: { openId: string; email: string; name: string; role: "teacher" | "student" | "admin" }) {
  // Question and assessment records reference tc_users.id. Handoff users must
  // therefore be materialized in the portal database instead of using a
  // synthetic id:0, while the Supabase identity remains the source of auth.
  const db = await getDb();
  if (!db) throw new Error("Portal database is unavailable.");
  const now = new Date();
  const [record] = await db.insert(users).values({
    openId: input.openId,
    email: input.email,
    name: input.name,
    loginMethod: "supabase-handoff",
    role: input.role,
    lastSignedIn: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: users.openId,
    set: {
      email: input.email,
      name: input.name,
      loginMethod: "supabase-handoff",
      role: input.role,
      lastSignedIn: now,
      updatedAt: now,
    },
  }).returning();
  if (!record) throw new Error("Unable to persist the authenticated portal user.");
  return record;
}
