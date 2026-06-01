import { pgTable, bigint, text, integer, boolean, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botUsers = pgTable("bot_users", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull().unique(),
  username: text("username"),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  coins: integer("coins").notNull().default(0),
  referrerTelegramId: bigint("referrer_telegram_id", { mode: "number" }),
  isBanned: boolean("is_banned").notNull().default(false),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const configPool = pgTable("config_pool", {
  id: serial("id").primaryKey(),
  configLink: text("config_link").notNull(),
  packageSizeMb: integer("package_size_mb").notNull(),
  costCoins: integer("cost_coins").notNull(),
  isUsed: boolean("is_used").notNull().default(false),
  addedBy: text("added_by"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const userConfigs = pgTable("user_configs", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  configLink: text("config_link").notNull(),
  packageSizeMb: integer("package_size_mb").notNull(),
  coinsSpent: integer("coins_spent").notNull(),
  receivedAt: timestamp("received_at").notNull().defaultNow(),
});

export const botSettings = pgTable("bot_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const insertBotUserSchema = createInsertSchema(botUsers).omit({ id: true, joinedAt: true });
export const insertConfigPoolSchema = createInsertSchema(configPool).omit({ id: true, createdAt: true });
export const insertUserConfigSchema = createInsertSchema(userConfigs).omit({ id: true, receivedAt: true });

export type BotUser = typeof botUsers.$inferSelect;
export type ConfigPool = typeof configPool.$inferSelect;
export type UserConfig = typeof userConfigs.$inferSelect;
export type BotSetting = typeof botSettings.$inferSelect;
export type InsertBotUser = z.infer<typeof insertBotUserSchema>;
