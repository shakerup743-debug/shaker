import { pgTable, serial, integer, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

/**
 * Persistent refresh tokens — backbone of the persistent-login flow.
 *
 * The plaintext token is sent ONLY in an HttpOnly + Secure + SameSite=Lax
 * cookie. We store sha256(token) in the DB so leaking the table doesn't leak
 * usable tokens.
 *
 * Rotation policy:
 *   • Every successful /auth/refresh issues a NEW token and marks the old
 *     row as `revoked=true` with `replaced_by_id` pointing at the new row.
 *   • If a token that already has `replaced_by_id` is presented again
 *     (replay), we revoke the entire chain for that user — the original
 *     token has likely been stolen.
 */
export const refreshTokensTable = pgTable(
  "refresh_tokens",
  {
    id:            serial("id").primaryKey(),
    userId:        integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    tenantId:      integer("tenant_id").references(() => tenantsTable.id, { onDelete: "cascade" }),
    tokenHash:     text("token_hash").notNull(),                  // sha256 of the opaque random token
    expiresAt:     timestamp("expires_at", { withTimezone: true }).notNull(),
    revoked:       boolean("revoked").notNull().default(false),
    replacedById:  integer("replaced_by_id"),                     // set on rotation
    ipAddress:     text("ip_address"),
    userAgent:     text("user_agent"),
    createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt:    timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [
    index("refresh_tokens_user_idx").on(t.userId),
    index("refresh_tokens_hash_idx").on(t.tokenHash),
    index("refresh_tokens_expires_idx").on(t.expiresAt),
  ],
);

export type RefreshToken = typeof refreshTokensTable.$inferSelect;
