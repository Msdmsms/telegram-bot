import { db, botUsers, configPool, userConfigs, botSettings } from "@workspace/db";
import { eq, and, count, sql, desc, asc } from "drizzle-orm";

export async function getOrCreateUser(
  telegramId: number,
  firstName: string,
  username?: string,
  lastName?: string,
  referrerTelegramId?: number,
) {
  const existing = await db.select().from(botUsers).where(eq(botUsers.telegramId, telegramId)).limit(1);
  if (existing.length > 0) return existing[0]!;

  const [created] = await db
    .insert(botUsers)
    .values({ telegramId, firstName, username, lastName, coins: 0, isBanned: false, referrerTelegramId })
    .returning();

  if (referrerTelegramId && referrerTelegramId !== telegramId) {
    const setting = await getSetting("coin_per_referral");
    const reward = parseInt(setting ?? "1", 10);
    await db.update(botUsers)
      .set({ coins: sql`${botUsers.coins} + ${reward}` })
      .where(eq(botUsers.telegramId, referrerTelegramId));
  }

  return created!;
}

export async function getUser(telegramId: number) {
  const rows = await db.select().from(botUsers).where(eq(botUsers.telegramId, telegramId)).limit(1);
  return rows[0] ?? null;
}

export async function getReferralCount(telegramId: number) {
  const rows = await db.select({ c: count() }).from(botUsers).where(eq(botUsers.referrerTelegramId, telegramId));
  return rows[0]?.c ?? 0;
}

export async function getUserConfigs(telegramId: number) {
  return db.select().from(userConfigs).where(eq(userConfigs.telegramId, telegramId));
}

export async function getUserConfigCount(telegramId: number) {
  const rows = await db.select({ c: count() }).from(userConfigs).where(eq(userConfigs.telegramId, telegramId));
  return rows[0]?.c ?? 0;
}

export async function getAvailableConfig(sizeMb: number, costCoins: number) {
  const rows = await db.select().from(configPool)
    .where(and(eq(configPool.isUsed, false), eq(configPool.packageSizeMb, sizeMb), eq(configPool.costCoins, costCoins)))
    .limit(1);
  return rows[0] ?? null;
}

export async function giveConfig(telegramId: number, configId: number, configLink: string, sizeMb: number, cost: number) {
  await db.update(configPool).set({ isUsed: true }).where(eq(configPool.id, configId));
  await db.update(botUsers).set({ coins: sql`${botUsers.coins} - ${cost}` }).where(eq(botUsers.telegramId, telegramId));
  await db.insert(userConfigs).values({ telegramId, configLink, packageSizeMb: sizeMb, coinsSpent: cost });
}

export async function giveConfigManual(telegramId: number, configId: number, configLink: string, sizeMb: number, cost: number) {
  await db.update(configPool).set({ isUsed: true }).where(eq(configPool.id, configId));
  await db.insert(userConfigs).values({ telegramId, configLink, packageSizeMb: sizeMb, coinsSpent: cost });
}

export async function addConfigToPool(configLink: string, sizeMb: number, costCoins: number, addedBy: string) {
  const [row] = await db.insert(configPool).values({ configLink, packageSizeMb: sizeMb, costCoins, isUsed: false, addedBy }).returning();
  return row!;
}

export async function countAvailableConfigs(sizeMb: number) {
  const rows = await db.select({ c: count() }).from(configPool)
    .where(and(eq(configPool.isUsed, false), eq(configPool.packageSizeMb, sizeMb)));
  return rows[0]?.c ?? 0;
}

export async function getTotalStats() {
  const [users] = await db.select({ c: count() }).from(botUsers);
  const [configs] = await db.select({ c: count() }).from(userConfigs);
  const [pool] = await db.select({ c: count() }).from(configPool).where(eq(configPool.isUsed, false));
  return { totalUsers: users?.c ?? 0, totalConfigsGiven: configs?.c ?? 0, availableInPool: pool?.c ?? 0 };
}

export async function getRecentUsers(limit = 10) {
  return db.select().from(botUsers).orderBy(desc(botUsers.joinedAt)).limit(limit);
}

export async function getTopReferrers(limit = 10) {
  const rows = await db.select({
    telegramId: botUsers.referrerTelegramId,
    cnt: count(),
  }).from(botUsers)
    .where(sql`${botUsers.referrerTelegramId} IS NOT NULL`)
    .groupBy(botUsers.referrerTelegramId)
    .orderBy(desc(count()))
    .limit(limit);
  return rows;
}

export async function getRichestUsers(limit = 10) {
  return db.select().from(botUsers).orderBy(desc(botUsers.coins)).limit(limit);
}

export async function getMostServiceUsers(limit = 10) {
  const rows = await db.select({
    telegramId: userConfigs.telegramId,
    cnt: count(),
  }).from(userConfigs)
    .groupBy(userConfigs.telegramId)
    .orderBy(desc(count()))
    .limit(limit);
  return rows;
}

export async function getAllUsers(limit = 200) {
  return db.select().from(botUsers).orderBy(asc(botUsers.id)).limit(limit);
}

export async function searchUserByIdOrUsername(query: string) {
  const id = parseInt(query, 10);
  if (!isNaN(id)) {
    return db.select().from(botUsers).where(eq(botUsers.telegramId, id)).limit(1);
  }
  const uname = query.replace("@", "");
  return db.select().from(botUsers).where(eq(botUsers.username, uname)).limit(1);
}

export async function banUser(telegramId: number) {
  await db.update(botUsers).set({ isBanned: true }).where(eq(botUsers.telegramId, telegramId));
}

export async function unbanUser(telegramId: number) {
  await db.update(botUsers).set({ isBanned: false }).where(eq(botUsers.telegramId, telegramId));
}

export async function deleteUser(telegramId: number) {
  await db.delete(userConfigs).where(eq(userConfigs.telegramId, telegramId));
  await db.delete(botUsers).where(eq(botUsers.telegramId, telegramId));
}

export async function setUserCoins(telegramId: number, coins: number) {
  await db.update(botUsers).set({ coins }).where(eq(botUsers.telegramId, telegramId));
}

export async function addUserCoins(telegramId: number, amount: number) {
  await db.update(botUsers).set({ coins: sql`${botUsers.coins} + ${amount}` }).where(eq(botUsers.telegramId, telegramId));
}

export async function resetUserCoins(telegramId: number) {
  await db.update(botUsers).set({ coins: 0 }).where(eq(botUsers.telegramId, telegramId));
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export async function getSetting(key: string): Promise<string | null> {
  const rows = await db.select().from(botSettings).where(eq(botSettings.key, key)).limit(1);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await db.insert(botSettings).values({ key, value })
    .onConflictDoUpdate({ target: botSettings.key, set: { value } });
}

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await db.select().from(botSettings);
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}
