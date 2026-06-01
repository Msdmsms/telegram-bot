import { Telegraf, Context } from "telegraf";
import { logger } from "../lib/logger";
import {
  getUser, getRecentUsers, getTopReferrers, getRichestUsers, getMostServiceUsers,
  getTotalStats, countAvailableConfigs, getAllUsers,
  searchUserByIdOrUsername, banUser, unbanUser, deleteUser,
  setUserCoins, addUserCoins, resetUserCoins, giveConfigManual,
  getAvailableConfig, addConfigToPool,
} from "./db";
import { updateSetting, refreshSettings, getSettings } from "./settings";

// ─── Admin state machine ───────────────────────────────────────────────────────
type Step =
  | "idle"
  | "search_query"
  | "user_info_query"
  | "ban_id"
  | "unban_id"
  | "coin_set_id"   | "coin_set_amount"
  | "coin_add_id"   | "coin_add_amount"
  | "coin_reset_id"
  | "delete_user_id"
  | "msg_user_id"   | "msg_user_text"
  | "broadcast_text"
  | "service_user_id" | "service_size"
  | "welcome_text"
  | "welcome_text_ref"
  | "channel_action"  | "channel_add_value"
  | "coin_per_ref_value"
  | "pkg_cost_select"  | "pkg_cost_value"
  | "btn_select"  | "btn_label" | "btn_style"
  | "pkg_label_select" | "pkg_label_value";

interface AdminState {
  step: Step;
  data: Record<string, string | number>;
}

const states = new Map<number, AdminState>();

function setState(id: number, step: Step, data: Record<string, string | number> = {}) {
  states.set(id, { step, data });
}
function clearState(id: number) { states.delete(id); }

// ─── Keyboards ────────────────────────────────────────────────────────────────
export const ADMIN_MENU = {
  keyboard: [
    [{ text: "📊 وضعیت ربات" },   { text: "🎰 آمار کامل" }],
    [{ text: "🔎 آخرین کاربران" }, { text: "🥇 برترین دعوت‌ها" }],
    [{ text: "📢 بیشترین سرویس" }, { text: "💎 ثروتمندترین‌ها" }],
    [{ text: "📦 پیام به کاربر" }, { text: "📣 پیام همگانی" }],
    [{ text: "🔍 جستجوی کاربر" }, { text: "🎉 اطلاعات کاربر" }],
    [{ text: "⚠️ مسدود کردن" },   { text: "🚫 رفع مسدودی" }],
    [{ text: "🎮 تنظیم سکه" },    { text: "🔗 افزودن سکه" }],
    [{ text: "📆 سرویس دستی" },   { text: "🎰 ری‌ست سکه" }],
    [{ text: "🗑 حذف کاربر" },    { text: "🔴 متن خوش‌آمد" }],
    [{ text: "🔔 کانال‌های اجباری" }, { text: "👝 تنظیمات سکه‌ها" }],
    [{ text: "🖊 مدیریت دکمه‌ها" }, { text: "✉️ ویرایش پیام‌ها" }],
    [{ text: "🟢 گزارش کامل" },   { text: "📒 مدیریت کانفیگ" }],
    [{ text: "📊 آمار ماهانه" },  { text: "👥 همه کاربران" }],
    [{ text: "🔧 حالت تعمیر" }],
    [{ text: "🔙 بازگشت به منوی اصلی" }],
  ],
  resize_keyboard: true,
};

const ADMIN_BUTTONS = new Set(ADMIN_MENU.keyboard.flat().map(b => b.text));
const CANCEL_BTN = "❌ لغو";
const cancelKb = { keyboard: [[{ text: CANCEL_BTN }]], resize_keyboard: true };

function ask(ctx: Context, text: string) {
  return ctx.replyWithHTML(text, { reply_markup: cancelKb } as object);
}

// ─── Main entry: called by bot for admin messages ─────────────────────────────
export async function handleAdminMessage(ctx: Context, telegramId: number): Promise<boolean> {
  const text = (ctx.message as { text?: string } | undefined)?.text ?? "";

  // Cancel
  if (text === CANCEL_BTN) {
    clearState(telegramId);
    await ctx.replyWithHTML("لغو شد.", { reply_markup: ADMIN_MENU } as object);
    return true;
  }

  // Admin menu button pressed
  if (ADMIN_BUTTONS.has(text)) {
    clearState(telegramId);
    await handleAdminButton(ctx, text, telegramId);
    return true;
  }

  // Multi-step state
  const state = states.get(telegramId);
  if (state && state.step !== "idle") {
    await handleAdminStep(ctx, text, state, telegramId);
    return true;
  }

  return false;
}

// ─── Button handlers ──────────────────────────────────────────────────────────
async function handleAdminButton(ctx: Context, text: string, adminId: number) {
  const s = getSettings();

  switch (text) {

    case "📊 وضعیت ربات": {
      const stats = await getTotalStats();
      const [a1, a2, a5] = await Promise.all([
        countAvailableConfigs(1000),
        countAvailableConfigs(2000),
        countAvailableConfigs(5000),
      ]);
      const maint = s.maintenanceMode ? "🔴 حالت تعمیر فعال" : "🟢 ربات فعال";
      await ctx.replyWithHTML(
        `<b>📊 وضعیت ربات</b>\n\n${maint}\n\n👥 کاربران: <b>${stats.totalUsers}</b>\n📦 کانفیگ داده شده: <b>${stats.totalConfigsGiven}</b>\n\n<b>موجودی استخر:</b>\n• 1000MB: <b>${a1}</b> عدد\n• 2000MB: <b>${a2}</b> عدد\n• 5000MB: <b>${a5}</b> عدد`,
        { reply_markup: ADMIN_MENU } as object,
      );
      break;
    }

    case "🎰 آمار کامل": {
      const stats = await getTotalStats();
      const [a1, a2, a5] = await Promise.all([
        countAvailableConfigs(1000),
        countAvailableConfigs(2000),
        countAvailableConfigs(5000),
      ]);
      await ctx.replyWithHTML(
        `<b>🎰 آمار کامل</b>\n\n👥 کل کاربران: <b>${stats.totalUsers}</b>\n📦 کل کانفیگ داده شده: <b>${stats.totalConfigsGiven}</b>\n🪙 سکه در دست کاربران: در حال محاسبه...\n\n<b>استخر کانفیگ:</b>\n🟢 موجود 1000MB: <b>${a1}</b>\n🟢 موجود 2000MB: <b>${a2}</b>\n🟢 موجود 5000MB: <b>${a5}</b>\n\n🔑 دعوت هر کاربر: <b>${s.coinPerReferral} سکه</b>`,
        { reply_markup: ADMIN_MENU } as object,
      );
      break;
    }

    case "🔎 آخرین کاربران": {
      const users = await getRecentUsers(10);
      const lines = users.map((u, i) =>
        `${i + 1}. <b>${u.firstName}</b> ${u.username ? `(@${u.username})` : ""} — 🪙${u.coins} — <code>${u.telegramId}</code>`,
      ).join("\n");
      await ctx.replyWithHTML(`<b>🔎 آخرین ۱۰ کاربر</b>\n\n${lines || "—"}`, { reply_markup: ADMIN_MENU } as object);
      break;
    }

    case "🥇 برترین دعوت‌ها": {
      const top = await getTopReferrers(10);
      const lines = top.map((r, i) =>
        `${i + 1}. <code>${r.telegramId}</code> — <b>${r.cnt}</b> دعوت`,
      ).join("\n");
      await ctx.replyWithHTML(`<b>🥇 برترین دعوت‌کنندگان</b>\n\n${lines || "—"}`, { reply_markup: ADMIN_MENU } as object);
      break;
    }

    case "📢 بیشترین سرویس": {
      const top = await getMostServiceUsers(10);
      const lines = top.map((r, i) =>
        `${i + 1}. <code>${r.telegramId}</code> — <b>${r.cnt}</b> کانفیگ`,
      ).join("\n");
      await ctx.replyWithHTML(`<b>📢 بیشترین سرویس گرفته‌ها</b>\n\n${lines || "—"}`, { reply_markup: ADMIN_MENU } as object);
      break;
    }

    case "💎 ثروتمندترین‌ها": {
      const top = await getRichestUsers(10);
      const lines = top.map((u, i) =>
        `${i + 1}. <b>${u.firstName}</b> — 🪙 <b>${u.coins}</b> سکه — <code>${u.telegramId}</code>`,
      ).join("\n");
      await ctx.replyWithHTML(`<b>💎 بیشترین سکه</b>\n\n${lines || "—"}`, { reply_markup: ADMIN_MENU } as object);
      break;
    }

    case "📦 پیام به کاربر":
      setState(adminId, "msg_user_id");
      await ask(ctx, "🆔 آیدی تلگرام کاربر را وارد کنید:");
      break;

    case "📣 پیام همگانی":
      setState(adminId, "broadcast_text");
      await ask(ctx, "📣 متن پیام همگانی را بنویسید (HTML پشتیبانی می‌شود):");
      break;

    case "🔍 جستجوی کاربر":
      setState(adminId, "search_query");
      await ask(ctx, "🔍 آیدی عددی یا @یوزرنیم کاربر را وارد کنید:");
      break;

    case "🎉 اطلاعات کاربر":
      setState(adminId, "user_info_query");
      await ask(ctx, "🆔 آیدی عددی یا @یوزرنیم کاربر را وارد کنید:");
      break;

    case "⚠️ مسدود کردن":
      setState(adminId, "ban_id");
      await ask(ctx, "🆔 آیدی کاربری که می‌خواهید مسدود کنید:");
      break;

    case "🚫 رفع مسدودی":
      setState(adminId, "unban_id");
      await ask(ctx, "🆔 آیدی کاربری که می‌خواهید رفع مسدودی کنید:");
      break;

    case "🎮 تنظیم سکه":
      setState(adminId, "coin_set_id");
      await ask(ctx, "🆔 آیدی کاربر را وارد کنید (سکه روی مقدار مشخص تنظیم می‌شود):");
      break;

    case "🔗 افزودن سکه":
      setState(adminId, "coin_add_id");
      await ask(ctx, "🆔 آیدی کاربر را وارد کنید (سکه اضافه/کم می‌شود):");
      break;

    case "📆 سرویس دستی":
      setState(adminId, "service_user_id");
      await ask(ctx, "🆔 آیدی کاربری که می‌خواهید کانفیگ دستی بدهید:");
      break;

    case "🎰 ری‌ست سکه":
      setState(adminId, "coin_reset_id");
      await ask(ctx, "🆔 آیدی کاربر را وارد کنید (سکه به صفر می‌رسد):");
      break;

    case "🗑 حذف کاربر":
      setState(adminId, "delete_user_id");
      await ask(ctx, "⚠️ آیدی کاربری که می‌خواهید <b>کاملاً حذف</b> کنید:\n\n(این عمل قابل بازگشت نیست!)");
      break;

    case "🔴 متن خوش‌آمد":
      setState(adminId, "welcome_text");
      await ask(ctx,
        `✉️ متن جدید خوش‌آمدگویی را بنویسید.\nاز <code>{name}</code> برای نام کاربر استفاده کنید.\n\nمتن فعلی:\n<code>${s.welcomeText.replace(/</g, "&lt;")}</code>`,
      );
      break;

    case "🔔 کانال‌های اجباری": {
      const chs = s.mandatoryChannels;
      const list = chs.map((c, i) => `${i + 1}. ${c.id} — <a href="${c.link}">${c.name}</a>`).join("\n");
      setState(adminId, "channel_action");
      await ctx.replyWithHTML(
        `<b>🔔 کانال‌های اجباری</b>\n\n${list || "هیچ کانالی تنظیم نشده"}\n\nبرای افزودن، فرمت زیر را وارد کنید:\n<code>add @channelid https://t.me/channelid نام_کانال</code>\n\nبرای حذف:\n<code>remove @channelid</code>`,
        { reply_markup: cancelKb } as object,
      );
      break;
    }

    case "👝 تنظیمات سکه‌ها":
      setState(adminId, "coin_per_ref_value");
      await ask(ctx,
        `💰 تنظیمات سکه\n\nسکه فعلی به ازای هر دعوت: <b>${s.coinPerReferral}</b>\nهزینه 1000MB: <b>${s.pkg1000Cost}</b> سکه\nهزینه 2000MB: <b>${s.pkg2000Cost}</b> سکه\nهزینه 5000MB: <b>${s.pkg5000Cost}</b> سکه\n\n<b>برای تغییر سکه دعوت</b>، عدد جدید را وارد کنید:\n(برای ادامه بدون تغییر، همین عدد را وارد کنید)`,
      );
      break;

    case "🖊 مدیریت دکمه‌ها": {
      const btns = s.buttons;
      const list = [
        `1. دریافت کانفیگ → <b>${btns.getConfig.label}</b> [${btns.getConfig.style}]`,
        `2. کانفیگ‌های من → <b>${btns.myConfigs.label}</b> [${btns.myConfigs.style}]`,
        `3. حساب کاربری → <b>${btns.account.label}</b> [${btns.account.style}]`,
        `4. زیرمجموعه‌ها → <b>${btns.referrals.label}</b> [${btns.referrals.style}]`,
        `5. پکیج 1000MB → <b>${s.pkg1000Label}</b>`,
        `6. پکیج 2000MB → <b>${s.pkg2000Label}</b>`,
        `7. پکیج 5000MB → <b>${s.pkg5000Label}</b>`,
      ].join("\n");
      setState(adminId, "btn_select");
      await ctx.replyWithHTML(
        `<b>🖊 مدیریت دکمه‌ها</b>\n\n${list}\n\nشماره دکمه‌ای که می‌خواهید ویرایش کنید را وارد کنید (1-7):`,
        { reply_markup: cancelKb } as object,
      );
      break;
    }

    case "✉️ ویرایش پیام‌ها":
      setState(adminId, "welcome_text_ref");
      await ask(ctx,
        `✉️ <b>ویرایش متن خوش‌آمد (معرفی‌شده)</b>\nمتن برای کسی که از لینک دعوت وارد شده.\nاز <code>{name}</code> استفاده کنید.\n\nمتن فعلی:\n<code>${s.welcomeTextRef.replace(/</g, "&lt;")}</code>`,
      );
      break;

    case "🟢 گزارش کامل": {
      const stats = await getTotalStats();
      const [a1, a2, a5] = await Promise.all([
        countAvailableConfigs(1000),
        countAvailableConfigs(2000),
        countAvailableConfigs(5000),
      ]);
      const users = await getRecentUsers(5);
      const lastList = users.map(u => `• ${u.firstName} — 🪙${u.coins}`).join("\n");
      await ctx.replyWithHTML(
        `<b>🟢 گزارش کامل</b>\n\n👥 کاربران: <b>${stats.totalUsers}</b>\n📦 کانفیگ داده شده: <b>${stats.totalConfigsGiven}</b>\n\n<b>استخر موجود:</b>\n• 1000MB: ${a1} | 2000MB: ${a2} | 5000MB: ${a5}\n\n<b>آخرین کاربران:</b>\n${lastList}`,
        { reply_markup: ADMIN_MENU } as object,
      );
      break;
    }

    case "📒 مدیریت کانفیگ":
      setState(adminId, "search_query");
      await ctx.replyWithHTML(
        `<b>📒 مدیریت کانفیگ</b>\n\nبرای افزودن کانفیگ:\n<code>add vless://... 1000 5</code>\n(لینک | حجم MB | هزینه سکه)\n\nیا آیدی کانفیگ را وارد کنید:`,
        { reply_markup: cancelKb } as object,
      );
      setState(adminId, "channel_action");
      await ctx.replyWithHTML(
        `<b>📒 مدیریت کانفیگ</b>\n\nبرای افزودن کانفیگ جدید، در قالب زیر بنویسید:\n<code>add vless://... 1000 5</code>\n\nیعنی: add [لینک] [حجم_MB] [هزینه_سکه]`,
        { reply_markup: cancelKb } as object,
      );
      setState(adminId, "channel_action");
      break;

    case "📊 آمار ماهانه": {
      const stats = await getTotalStats();
      const now = new Date();
      await ctx.replyWithHTML(
        `<b>📊 آمار ماهانه</b>\n<i>${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}</i>\n\n👥 کل کاربران: <b>${stats.totalUsers}</b>\n📦 کل کانفیگ: <b>${stats.totalConfigsGiven}</b>\n\n(آمار جزئی ماهانه در نسخه بعدی)`,
        { reply_markup: ADMIN_MENU } as object,
      );
      break;
    }

    case "👥 همه کاربران": {
      const users = await getAllUsers(50);
      const lines = users.slice(0, 30).map((u, i) =>
        `${i + 1}. <code>${u.telegramId}</code> <b>${u.firstName}</b> 🪙${u.coins}${u.isBanned ? " 🚫" : ""}`,
      ).join("\n");
      await ctx.replyWithHTML(
        `<b>👥 کاربران (${users.length} نفر)</b>\n\n${lines}`,
        { reply_markup: ADMIN_MENU } as object,
      );
      break;
    }

    case "🔧 حالت تعمیر": {
      const newVal = !s.maintenanceMode;
      await updateSetting("maintenance_mode", String(newVal));
      await refreshSettings();
      await ctx.replyWithHTML(
        `<b>🔧 حالت تعمیر</b>\n\nوضعیت: ${newVal ? "🔴 فعال شد" : "🟢 غیرفعال شد"}`,
        { reply_markup: ADMIN_MENU } as object,
      );
      break;
    }

    case "🔙 بازگشت به منوی اصلی":
      clearState(adminId);
      break;
  }
}

// ─── Multi-step handler ────────────────────────────────────────────────────────
async function handleAdminStep(ctx: Context, text: string, state: AdminState, adminId: number) {
  const tg = ctx.telegram;

  switch (state.step) {

    case "search_query": {
      const results = await searchUserByIdOrUsername(text);
      clearState(adminId);
      if (!results.length) {
        await ctx.replyWithHTML("کاربری یافت نشد.", { reply_markup: ADMIN_MENU } as object);
      } else {
        const u = results[0]!;
        await ctx.replyWithHTML(
          `🔍 نتیجه جستجو:\n\n👤 <b>${u.firstName} ${u.lastName ?? ""}</b>\n🆔 <code>${u.telegramId}</code>\n📱 ${u.username ? "@" + u.username : "—"}\n🪙 سکه: <b>${u.coins}</b>\n${u.isBanned ? "🚫 مسدود" : "✅ فعال"}`,
          { reply_markup: ADMIN_MENU } as object,
        );
      }
      break;
    }

    case "user_info_query": {
      const results = await searchUserByIdOrUsername(text);
      clearState(adminId);
      if (!results.length) {
        await ctx.replyWithHTML("کاربری یافت نشد.", { reply_markup: ADMIN_MENU } as object);
      } else {
        const u = results[0]!;
        await ctx.replyWithHTML(
          `🎉 اطلاعات کاربر:\n\n👤 نام: <b>${u.firstName} ${u.lastName ?? ""}</b>\n🆔 آیدی: <code>${u.telegramId}</code>\n📱 یوزرنیم: ${u.username ? "@" + u.username : "—"}\n🪙 سکه: <b>${u.coins}</b>\n👥 معرف: ${u.referrerTelegramId ?? "—"}\n${u.isBanned ? "🚫 مسدود" : "✅ فعال"}\n📅 عضویت: ${new Date(u.joinedAt).toLocaleDateString("fa-IR")}`,
          { reply_markup: ADMIN_MENU } as object,
        );
      }
      break;
    }

    case "ban_id": {
      const id = parseInt(text, 10);
      if (isNaN(id)) { await ctx.reply("آیدی نامعتبر است."); return; }
      await banUser(id);
      clearState(adminId);
      await ctx.replyWithHTML(`✅ کاربر <code>${id}</code> مسدود شد.`, { reply_markup: ADMIN_MENU } as object);
      break;
    }

    case "unban_id": {
      const id = parseInt(text, 10);
      if (isNaN(id)) { await ctx.reply("آیدی نامعتبر است."); return; }
      await unbanUser(id);
      clearState(adminId);
      await ctx.replyWithHTML(`✅ مسدودی کاربر <code>${id}</code> رفع شد.`, { reply_markup: ADMIN_MENU } as object);
      break;
    }

    case "coin_set_id": {
      const id = parseInt(text, 10);
      if (isNaN(id)) { await ctx.reply("آیدی نامعتبر است."); return; }
      setState(adminId, "coin_set_amount", { id });
      await ask(ctx, `مقدار سکه جدید برای <code>${id}</code> را وارد کنید:`);
      break;
    }
    case "coin_set_amount": {
      const amount = parseInt(text, 10);
      if (isNaN(amount)) { await ctx.reply("مقدار نامعتبر است."); return; }
      await setUserCoins(state.data["id"] as number, amount);
      clearState(adminId);
      await ctx.replyWithHTML(`✅ سکه کاربر <code>${state.data["id"]}</code> به <b>${amount}</b> تنظیم شد.`, { reply_markup: ADMIN_MENU } as object);
      break;
    }

    case "coin_add_id": {
      const id = parseInt(text, 10);
      if (isNaN(id)) { await ctx.reply("آیدی نامعتبر است."); return; }
      setState(adminId, "coin_add_amount", { id });
      await ask(ctx, `مقدار سکه برای اضافه/کم کردن از کاربر <code>${id}</code>:\n(عدد منفی برای کم کردن)`);
      break;
    }
    case "coin_add_amount": {
      const amount = parseInt(text, 10);
      if (isNaN(amount)) { await ctx.reply("مقدار نامعتبر است."); return; }
      await addUserCoins(state.data["id"] as number, amount);
      clearState(adminId);
      const sign = amount >= 0 ? "+" : "";
      await ctx.replyWithHTML(`✅ ${sign}${amount} سکه برای <code>${state.data["id"]}</code> اعمال شد.`, { reply_markup: ADMIN_MENU } as object);
      break;
    }

    case "coin_reset_id": {
      const id = parseInt(text, 10);
      if (isNaN(id)) { await ctx.reply("آیدی نامعتبر است."); return; }
      await resetUserCoins(id);
      clearState(adminId);
      await ctx.replyWithHTML(`✅ سکه کاربر <code>${id}</code> صفر شد.`, { reply_markup: ADMIN_MENU } as object);
      break;
    }

    case "delete_user_id": {
      const id = parseInt(text, 10);
      if (isNaN(id)) { await ctx.reply("آیدی نامعتبر است."); return; }
      await deleteUser(id);
      clearState(adminId);
      await ctx.replyWithHTML(`✅ کاربر <code>${id}</code> کاملاً حذف شد.`, { reply_markup: ADMIN_MENU } as object);
      break;
    }

    case "msg_user_id": {
      const id = parseInt(text, 10);
      if (isNaN(id)) { await ctx.reply("آیدی نامعتبر است."); return; }
      setState(adminId, "msg_user_text", { id });
      await ask(ctx, `✏️ متن پیام برای <code>${id}</code> را بنویسید:`);
      break;
    }
    case "msg_user_text": {
      try {
        await tg.sendMessage(state.data["id"] as number, text, { parse_mode: "HTML" });
        clearState(adminId);
        await ctx.replyWithHTML(`✅ پیام به <code>${state.data["id"]}</code> ارسال شد.`, { reply_markup: ADMIN_MENU } as object);
      } catch {
        clearState(adminId);
        await ctx.replyWithHTML(`❌ ارسال ناموفق. کاربر ربات را بلاک کرده باشد.`, { reply_markup: ADMIN_MENU } as object);
      }
      break;
    }

    case "broadcast_text": {
      const { getAllUsers: fetchAll } = await import("./db");
      const users = await fetchAll(100000);
      clearState(adminId);
      await ctx.replyWithHTML(`📣 در حال ارسال به <b>${users.length}</b> کاربر...`, { reply_markup: ADMIN_MENU } as object);

      const token = process.env["TELEGRAM_BOT_TOKEN"];
      if (!token) break;
      let sent = 0, failed = 0;
      for (const u of users) {
        try {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chat_id: u.telegramId, text, parse_mode: "HTML" }),
          });
          sent++;
        } catch { failed++; }
        await new Promise(r => setTimeout(r, 50));
      }
      try {
        await tg.sendMessage(adminId, `✅ پیام همگانی ارسال شد.\nموفق: ${sent} | ناموفق: ${failed}`);
      } catch { }
      break;
    }

    case "service_user_id": {
      const id = parseInt(text, 10);
      if (isNaN(id)) { await ctx.reply("آیدی نامعتبر است."); return; }
      setState(adminId, "service_size", { id });
      await ask(ctx, `حجم پکیج را انتخاب کنید:\n<b>1</b> — 1000MB\n<b>2</b> — 2000MB\n<b>3</b> — 5000MB`);
      break;
    }
    case "service_size": {
      const sizeMap: Record<string, { size: number; cost: number }> = {
        "1": { size: 1000, cost: 5 },
        "2": { size: 2000, cost: 10 },
        "3": { size: 5000, cost: 20 },
      };
      const choice = sizeMap[text.trim()];
      if (!choice) { await ctx.reply("گزینه نامعتبر. 1، 2 یا 3 وارد کنید."); return; }
      const avail = await getAvailableConfig(choice.size, choice.cost);
      clearState(adminId);
      if (!avail) {
        await ctx.replyWithHTML(`❌ کانفیگ ${choice.size}MB موجود نیست.`, { reply_markup: ADMIN_MENU } as object);
        return;
      }
      const userId = state.data["id"] as number;
      await giveConfigManual(userId, avail.id, avail.configLink, choice.size, choice.cost);
      try {
        await tg.sendMessage(userId,
          `🎁 یک کانفیگ دستی توسط ادمین برای شما ارسال شد!\n\n📦 حجم: ${choice.size} مگابایت\n\n🌐 کانفیگ:\n<code>${avail.configLink}</code>`,
          { parse_mode: "HTML" },
        );
      } catch { }
      await ctx.replyWithHTML(`✅ کانفیگ ${choice.size}MB به کاربر <code>${userId}</code> داده شد.`, { reply_markup: ADMIN_MENU } as object);
      break;
    }

    case "welcome_text": {
      await updateSetting("welcome_text", text);
      await refreshSettings();
      clearState(adminId);
      await ctx.replyWithHTML("✅ متن خوش‌آمدگویی ذخیره شد.", { reply_markup: ADMIN_MENU } as object);
      break;
    }

    case "welcome_text_ref": {
      await updateSetting("welcome_text_ref", text);
      await refreshSettings();
      clearState(adminId);
      await ctx.replyWithHTML("✅ متن خوش‌آمد (معرفی‌شده) ذخیره شد.", { reply_markup: ADMIN_MENU } as object);
      break;
    }

    case "channel_action": {
      const s2 = getSettings();
      const channels = [...s2.mandatoryChannels];
      const lower = text.trim().toLowerCase();

      if (lower.startsWith("add ")) {
        const parts = text.trim().split(/\s+/);
        // add @id link name
        if (parts.length < 4) {
          await ctx.reply("فرمت نادرست. مثال:\nadd @mychannel https://t.me/mychannel نام");
          return;
        }
        const cid = parts[1]!, link = parts[2]!, name = parts.slice(3).join(" ");
        channels.push({ id: cid, link, name });
        await updateSetting("mandatory_channels", JSON.stringify(channels));
        await refreshSettings();
        clearState(adminId);
        await ctx.replyWithHTML(`✅ کانال <b>${cid}</b> اضافه شد.`, { reply_markup: ADMIN_MENU } as object);

      } else if (lower.startsWith("remove ")) {
        const cid = text.trim().split(/\s+/)[1];
        const filtered = channels.filter(c => c.id !== cid);
        await updateSetting("mandatory_channels", JSON.stringify(filtered));
        await refreshSettings();
        clearState(adminId);
        await ctx.replyWithHTML(`✅ کانال <b>${cid}</b> حذف شد.`, { reply_markup: ADMIN_MENU } as object);

      } else if (lower.startsWith("add ") && text.includes("vless://")) {
        // Config add shortcut
        const parts = text.trim().split(/\s+/);
        const link2 = parts[1]!, size = parseInt(parts[2] ?? "1000", 10), cost2 = parseInt(parts[3] ?? "5", 10);
        await addConfigToPool(link2, size, cost2, "admin-bot");
        clearState(adminId);
        await ctx.replyWithHTML(`✅ کانفیگ ${size}MB اضافه شد.`, { reply_markup: ADMIN_MENU } as object);
      } else {
        await ctx.reply("فرمت نادرست. از add یا remove استفاده کنید.");
      }
      break;
    }

    case "coin_per_ref_value": {
      const val = parseInt(text, 10);
      if (isNaN(val) || val < 0) { await ctx.reply("عدد نامعتبر است."); return; }
      await updateSetting("coin_per_referral", String(val));
      await refreshSettings();
      clearState(adminId);
      await ctx.replyWithHTML(`✅ سکه به ازای هر دعوت: <b>${val}</b> تنظیم شد.`, { reply_markup: ADMIN_MENU } as object);
      break;
    }

    case "btn_select": {
      const n = parseInt(text, 10);
      if (n < 1 || n > 7 || isNaN(n)) { await ctx.reply("شماره 1 تا 7 را وارد کنید."); return; }
      setState(adminId, "btn_label", { btn: n });
      const s2 = getSettings();
      const currentLabels: Record<number, string> = {
        1: s2.buttons.getConfig.label,
        2: s2.buttons.myConfigs.label,
        3: s2.buttons.account.label,
        4: s2.buttons.referrals.label,
        5: s2.pkg1000Label,
        6: s2.pkg2000Label,
        7: s2.pkg5000Label,
      };
      await ask(ctx, `متن جدید دکمه شماره ${n} را وارد کنید:\n(فعلی: <b>${currentLabels[n] ?? ""}</b>)`);
      break;
    }
    case "btn_label": {
      const btnNum = state.data["btn"] as number;
      setState(adminId, "btn_style", { btn: btnNum, label: text });
      if (btnNum <= 4) {
        await ask(ctx, `استایل دکمه را وارد کنید:\n<b>success</b> = سبز\n<b>primary</b> = آبی\n<b>danger</b> = قرمز`);
      } else {
        // Package buttons don't have style in Telegram inline keyboards
        await saveBtnLabel(btnNum, text, "primary");
        clearState(adminId);
        await ctx.replyWithHTML("✅ متن دکمه ذخیره شد.", { reply_markup: ADMIN_MENU } as object);
      }
      break;
    }
    case "btn_style": {
      const validStyles = ["success", "primary", "danger"];
      const style = validStyles.includes(text) ? text : "primary";
      await saveBtnLabel(state.data["btn"] as number, state.data["label"] as string, style);
      await refreshSettings();
      clearState(adminId);
      await ctx.replyWithHTML("✅ دکمه ذخیره شد.", { reply_markup: ADMIN_MENU } as object);
      break;
    }

    default:
      clearState(adminId);
  }
}

async function saveBtnLabel(btnNum: number, label: string, style: string) {
  const keyMap: Record<number, [string, string]> = {
    1: ["btn_getconfig_label", "btn_getconfig_style"],
    2: ["btn_myconfigs_label", "btn_myconfigs_style"],
    3: ["btn_account_label",   "btn_account_style"],
    4: ["btn_referrals_label", "btn_referrals_style"],
    5: ["pkg1000_label", ""],
    6: ["pkg2000_label", ""],
    7: ["pkg5000_label", ""],
  };
  const keys = keyMap[btnNum];
  if (!keys) return;
  await updateSetting(keys[0], label);
  if (keys[1]) await updateSetting(keys[1], style);
  await refreshSettings();
}

export function isAdminButton(text: string): boolean {
  return ADMIN_BUTTONS.has(text) || text === CANCEL_BTN;
}

export function isInAdminState(telegramId: number): boolean {
  const st = states.get(telegramId);
  return st !== undefined && st.step !== "idle";
}

// Called on /admin
export async function sendAdminPanel(ctx: Context) {
  const stats = await getTotalStats();
  await ctx.replyWithHTML(
    `<b>🔴 پنل مدیریت</b>\n\n👥 کاربران: <b>${stats.totalUsers}</b>\n📦 کانفیگ داده شده: <b>${stats.totalConfigsGiven}</b>\n📥 موجود در استخر: <b>${stats.availableInPool}</b>`,
    { reply_markup: ADMIN_MENU } as object,
  );
}

// Log admin actions
export { logger };
