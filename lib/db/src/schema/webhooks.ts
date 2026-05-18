import { pgTable, serial, integer, varchar, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";

export const webhooksTable = pgTable("webhooks", {
  id:          serial("id").primaryKey(),
  tenantId:    integer("tenant_id").default(1),
  name:        varchar("name", { length: 120 }).notNull(),
  url:         text("url").notNull(),
  events:      jsonb("events").$type<string[]>().notNull().default([]),
  secret:      varchar("secret", { length: 128 }),
  isActive:    boolean("is_active").notNull().default(true),
  lastTriggeredAt: timestamp("last_triggered_at"),
  failCount:   integer("fail_count").notNull().default(0),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
  updatedAt:   timestamp("updated_at").notNull().defaultNow(),
});

export const webhookLogsTable = pgTable("webhook_logs", {
  id:          serial("id").primaryKey(),
  webhookId:   integer("webhook_id").notNull(),
  event:       varchar("event", { length: 80 }).notNull(),
  payload:     jsonb("payload"),
  statusCode:  integer("status_code"),
  response:    text("response"),
  durationMs:  integer("duration_ms"),
  success:     boolean("success").notNull().default(false),
  createdAt:   timestamp("created_at").notNull().defaultNow(),
});
