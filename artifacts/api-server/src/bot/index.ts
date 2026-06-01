import { Telegraf, Context } from "telegraf";
import { logger } from "../lib/logger";
import {
  getOrCreateUser, getUser, getReferralCount,
  getUserConfigs, getUserConfigCount,
  getAvailableConfig, giveConfig,
  countAvailableConfigs,
} from "./db";
import { E, tge, mainMenuKeyboard, configInlineKeyboard, type PoolAvailability } from "./keyboards";
import { loadSettings, getSettings } from "./settings";
import {
  handleAdminMessage, isAdminButton, isInAdminState,
  sendAdminPanel, ADMIN_MENU,
} from "./admin";
import {
  generateCaptcha, setCaptcha, verifyCaptcha,
  hasPendingCaptcha, clearCaptcha,
} from "./captcha";

const ADMIN_USERNAME = "Mojeao";

function h(s: string | number): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const pendingReferrals = new Map<number, { referrerId: number; expiry: number }>();

async function getPoolAvailability(): Promise<PoolAvailability> {
  const [p1000, p2000, p5000] = await Promise.all([
    countAvailableConfigs(1000),
    countAvailableConfigs(2000),
    countAvailableConfigs(5000),
  ]);
  return { p1000, p2000, p5000 };
}

export function createBot(token: string) {
  const bot = new Telegraf(token);

  function isAdmin(ctx: Context) { return ctx.from?.username === ADMIN_USERNAME; }

  async function checkMembership(userId: number): Promise<boolean> {
    const s = getSettings();
    for (const ch of s.mandatoryChannels) {
      try {
        const m = await bot.telegram.getChatMember(ch.id, userId);
        if (!["member", "administrator", "creator"].includes(m.status)) return false;
      } catch { return false; }
    }
    return true;
  }

  async function sendJoinMessage(ctx: Context) {
    const s = getSettings();
    const chList = s.mandatoryChannels.map(c =>
      `${tge(E.myConfigs, "📣")} کانال: <b><a href="${c.link}">@${c.name}</a></b>`,
    ).join("\n");

    await ctx.replyWithHTML(
      `${tge(E.star, "⭐")} <b>برای استفاده از ربات باید در کانال‌های زیر عضو باشید:</b>\n\n${chList}\n\nپس از عضویت، دکمه ${tge(E.check, "✅")} <b>تایید عضویت</b> را بزنید.`,
      {
        reply_markup: {
          inline_keyboard: [
            ...s.mandatoryChannels.map(c => [{ text: `📣 عضویت در ${c.name}`, url: c.link }]),
            [{ text: "✅ تایید عضویت", callback_data: "verify_join" }],
          ],
        },
      } as object,
    );
  }

  async function sendCaptcha(ctx: Context) {
    const userId = ctx.from!.id;
    const challenge = generateCaptcha();
    setCaptcha(userId, challenge);

    await ctx.replyWithHTML(
      `${tge(E.star, "🔐")} <b>تأیید امنیتی</b>\n\nلطفاً نتیجه این حساب را بنویسید:\n\n` +
      `<b>${challenge.question} = ?</b>\n\n<i>⏳ این کد ۳ دقیقه اعتبار دارد</i>`,
      {
        reply_markup: { remove_keyboard: true },
      } as object,
    );
  }

  async function completeWelcome(ctx: Context, isNew: boolean) {
    const s = getSettings();
    let referrerId: number | undefined;

    if (isNew) {
      const pending = pendingReferrals.get(ctx.from!.id);
      if (pending && pending.expiry > Date.now()) {
        referrerId = pending.referrerId;
        pendingReferrals.delete(ctx.from!.id);
      }
    }

    await getOrCreateUser(
      ctx.from!.id, ctx.from!.first_name,
      ctx.from!.username, ctx.from!.last_name,
      isNew ? referrerId : undefined,
    );

    if (isNew && referrerId) {
      try {
        await ctx.telegram.sendMessage(
          referrerId,
          `${tge(E.joy, "🎉")} <b>مژده!</b>\nکاربر <b>${h(ctx.from!.first_name)}</b> از لینک دعوت شما وارد شد.\n${tge(E.coin, "🪙")} <b>${s.coinPerReferral} سکه</b> به حسابتان اضافه شد!`,
          { parse_mode: "HTML" },
        );
      } catch { }
    }

    const name = h(ctx.from!.first_name);
    const welcomeText = (isNew && referrerId ? s.welcomeTextRef : s.welcomeText)
      .replace("{name}", name);

    await ctx.replyWithHTML(welcomeText, { reply_markup: mainMenuKeyboard(s) } as object);
  }

  // ─── /start ───────────────────────────────────────────────────────────────
  bot.start(async (ctx) => {
    try {
      if (ctx.chat?.type !== "private") {
        const botInfo = await ctx.telegram.getMe();
        await ctx.reply("لطفاً در پیام خصوصی با ربات صحبت کنید.", {
          reply_markup: {
            inline_keyboard: [[{ text: "شروع در پیوی 💬", url: `https://t.me/${botInfo.username}` }]],
          },
        } as object);
        return;
      }

      const s = getSettings();

      if (s.maintenanceMode && !isAdmin(ctx)) {
        await ctx.reply("🔧 ربات در حال تعمیر است. لطفاً کمی بعد تلاش کنید.");
        return;
      }

      const startParam = ctx.startPayload;
      let referrerId: number | undefined;
      if (startParam?.startsWith("ref_")) {
        const id = parseInt(startParam.replace("ref_", ""), 10);
        if (!isNaN(id) && id !== ctx.from.id) referrerId = id;
      }

      const existingUser = await getUser(ctx.from.id);
      if (!existingUser && referrerId) {
        pendingReferrals.set(ctx.from.id, { referrerId, expiry: Date.now() + 3_600_000 });
      }

      const isMember = await checkMembership(ctx.from.id);
      if (!isMember) { await sendJoinMessage(ctx); return; }

      // کپچا فقط برای کاربران جدید
      if (!existingUser && !isAdmin(ctx)) {
        await sendCaptcha(ctx);
        return;
      }

      await completeWelcome(ctx, existingUser === null);
    } catch (err) { logger.error({ err }, "Error in /start"); }
  });

  // ─── تایید عضویت ─────────────────────────────────────────────────────────
  bot.action("verify_join", async (ctx) => {
    try {
      const isMember = await checkMembership(ctx.from.id);
      if (!isMember) {
        await ctx.answerCbQuery("هنوز عضو کانال نشدی! اول عضو شو سپس دکمه را بزن.", { show_alert: true });
        return;
      }
      await ctx.answerCbQuery("عضویت تأیید شد!");
      await ctx.deleteMessage().catch(() => { });
      const existingUser = await getUser(ctx.from.id);

      // کپچا برای کاربر جدید بعد از تأیید عضویت
      if (!existingUser && !isAdmin(ctx)) {
        await sendCaptcha(ctx);
        return;
      }

      await completeWelcome(ctx, existingUser === null);
    } catch (err) { logger.error({ err }, "Error in verify_join"); }
  });

  // ─── /admin ──────────────────────────────────────────────────────────────
  bot.command("admin", async (ctx) => {
    if (!isAdmin(ctx)) { await ctx.reply("دسترسی غیرمجاز"); return; }
    await sendAdminPanel(ctx);
  });

  // ─── تمام پیام‌های متنی ───────────────────────────────────────────────────
  bot.on("text", async (ctx) => {
    try {
      const text = ctx.message.text;
      const userId = ctx.from.id;

      if (ctx.chat?.type !== "private") return;

      // ادمین
      if (isAdmin(ctx)) {
        if (isAdminButton(text) || isInAdminState(userId)) {
          if (text === "🔙 بازگشت به منوی اصلی") {
            const s = getSettings();
            await ctx.replyWithHTML("منوی اصلی", { reply_markup: mainMenuKeyboard(s) } as object);
            return;
          }
          const handled = await handleAdminMessage(ctx, userId);
          if (handled) return;
        }
      }

      const s = getSettings();

      if (s.maintenanceMode && !isAdmin(ctx)) {
        await ctx.reply("🔧 ربات در حال تعمیر است. لطفاً کمی بعد تلاش کنید.");
        return;
      }

      // ─── پردازش کپچا ────────────────────────────────────────────────────
      if (hasPendingCaptcha(userId)) {
        const result = verifyCaptcha(userId, text);
        if (result === "ok") {
          await ctx.replyWithHTML(`${tge(E.check, "✅")} <b>تأیید شد!</b> خوش آمدید.`);
          const existingUser = await getUser(userId);
          await completeWelcome(ctx, existingUser === null);
        } else if (result === "wrong") {
          // کپچای جدید بده
          const challenge = generateCaptcha();
          setCaptcha(userId, challenge);
          await ctx.replyWithHTML(
            `${tge(E.back, "❌")} <b>جواب اشتباه بود!</b>\n\nدوباره امتحان کن:\n\n<b>${challenge.question} = ?</b>`,
          );
        } else if (result === "expired") {
          await sendCaptcha(ctx);
        }
        return;
      }

      if (!(await checkMembership(userId))) { await sendJoinMessage(ctx); return; }

      const user = await getUser(userId);
      if (!user) {
        clearCaptcha(userId);
        await ctx.reply("برای شروع /start را بزنید.");
        return;
      }

      if (user.isBanned) {
        await ctx.reply("حساب شما مسدود شده است.");
        return;
      }

      // ─── دریافت کانفیگ ──────────────────────────────────────────────────
      if (text === s.buttons.getConfig.label) {
        const avail = await getPoolAvailability();
        await ctx.replyWithHTML(
          `${tge(E.getConfig, "📦")} <b>دریافت کانفیگ</b>\n\nسکه فعلی شما: ${tge(E.coin, "🪙")} <b>${user.coins} سکه</b>\n\n${tge(E.check, "✅")} سبز = موجود  ${tge(E.back, "❌")} قرمز = ناموجود\n\nپکیج مورد نظر را انتخاب کنید:`,
          { reply_markup: configInlineKeyboard(user.coins, avail, s) } as object,
        );
        return;
      }

      // ─── کانفیگ‌های من ──────────────────────────────────────────────────
      if (text === s.buttons.myConfigs.label) {
        const configs = await getUserConfigs(userId);
        if (configs.length === 0) {
          await ctx.replyWithHTML(
            `${tge(E.myConfigs, "📋")} هنوز هیچ کانفیگی دریافت نکرده‌اید.\n\nاز «${s.buttons.getConfig.label}» اقدام کنید.`,
            { reply_markup: mainMenuKeyboard(s) } as object,
          );
          return;
        }
        const latest = configs[configs.length - 1]!;
        const d = new Date(latest.receivedAt);
        const dd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const tt = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
        await ctx.replyWithHTML(
          `${tge(E.myConfigs, "📋")} <b>آخرین کانفیگ شما</b>\n\n${tge(E.getConfig, "📦")} حجم: <b>${latest.packageSizeMb} مگابایت</b>\n${tge(E.back, "🗓")} تاریخ دریافت: <b>${dd} — ${tt}</b>\n\n${tge(E.myConfigs, "🌐")} لینک اتصال:\n<code>${h(latest.configLink)}</code>\n\n━━━━━━━━━━━━━━━━━━━━\n${tge(E.arrow, "👇")} مجموع دریافتی: <b>${configs.length} عدد</b>`,
          { reply_markup: { inline_keyboard: [[{ text: "بازگشت به منو", callback_data: "back_menu" }]] } } as object,
        );
        return;
      }

      // ─── حساب کاربری من ─────────────────────────────────────────────────
      if (text === s.buttons.account.label) {
        const [referralCount, configCount] = await Promise.all([
          getReferralCount(userId),
          getUserConfigCount(userId),
        ]);
        await ctx.replyWithHTML(
          `${tge(E.myAccount, "👤")} <b>حساب کاربری شما</b>\n\n━━━━━━━━━━━━━━━━━━━━\n${tge(E.myAccount, "🪪")} نام: <b>${h(user.firstName)}</b>\n${tge(E.myAccount, "🆔")} آیدی: <b>${user.telegramId}</b>\n━━━━━━━━━━━━━━━━━━━━\n${tge(E.coin, "🪙")} موجودی سکه: <b>${user.coins} عدد</b>\n${tge(E.subReferrals, "👥")} دعوت‌شدگان: <b>${referralCount} نفر</b>\n${tge(E.getConfig, "📦")} کانفیگ دریافتی: <b>${configCount} عدد</b>\n━━━━━━━━━━━━━━━━━━━━\n\n${tge(E.gift, "🎁")} با دعوت دوستان سکه بیشتری کسب کنید!`,
          { reply_markup: mainMenuKeyboard(s) } as object,
        );
        return;
      }

      // ─── زیرمجموعه‌ها ───────────────────────────────────────────────────
      if (text === s.buttons.referrals.label) {
        const [botInfo, referralCount] = await Promise.all([
          ctx.telegram.getMe(),
          getReferralCount(userId),
        ]);
        const refLink = `https://t.me/${botInfo.username}?start=ref_${userId}`;
        await ctx.replyWithHTML(
          `${tge(E.subReferrals, "👥")} <b>سیستم دعوت و کسب سکه</b>\n\n${tge(E.gift, "🎁")} به ازای هر دوستی که از لینک شما وارد شود، <b>${s.coinPerReferral} سکه</b> دریافت می‌کنید.\n\n${tge(E.coin, "🪙")} کل دعوت‌های شما: <b>${referralCount} نفر</b>\n\n━━━━━━━━━━━━━━━━━━━━\n${tge(E.arrow, "👇")} لینک اختصاصی شما:\n<code>${h(refLink)}</code>\n━━━━━━━━━━━━━━━━━━━━\n\nاین لینک را برای دوستانتان ارسال کنید!`,
          { reply_markup: mainMenuKeyboard(s) } as object,
        );
        return;
      }

      await ctx.replyWithHTML("از منوی زیر انتخاب کنید:", { reply_markup: mainMenuKeyboard(s) } as object);
    } catch (err) { logger.error({ err }, "Error in text handler"); }
  });

  // ─── inline callback: پکیج‌ها ────────────────────────────────────────────
  const PACKAGES = [
    { cb: "pkg_1000", sizeKey: "pkg1000Cost" as const, size: 1000 },
    { cb: "pkg_2000", sizeKey: "pkg2000Cost" as const, size: 2000 },
    { cb: "pkg_5000", sizeKey: "pkg5000Cost" as const, size: 5000 },
  ];

  for (const pkg of PACKAGES) {
    bot.action(pkg.cb, async (ctx) => {
      try {
        const s = getSettings();
        const cost = s[pkg.sizeKey];
        const user = await getUser(ctx.from.id);
        if (!user) { await ctx.answerCbQuery("لطفاً ابتدا /start را بزنید.", { show_alert: true }); return; }

        if (user.isBanned) { await ctx.answerCbQuery("حساب شما مسدود شده است.", { show_alert: true }); return; }

        if (user.coins < cost) {
          await ctx.answerCbQuery(
            `موجودی ناکافی! شما ${user.coins} سکه دارید ولی به ${cost} سکه نیاز است. از بخش زیرمجموعه‌ها سکه جمع کنید.`,
            { show_alert: true },
          );
          return;
        }

        const available = await getAvailableConfig(pkg.size, cost);
        if (!available) {
          await ctx.answerCbQuery(`موجودی پکیج ${pkg.size} مگابایتی تمام شده. لطفاً کمی بعد تلاش کنید.`, { show_alert: true });
          return;
        }

        await giveConfig(ctx.from.id, available.id, available.configLink, pkg.size, cost);
        await ctx.answerCbQuery("کانفیگ با موفقیت دریافت شد!");

        const [updatedUser, avail] = await Promise.all([getUser(ctx.from.id), getPoolAvailability()]);
        await ctx.replyWithHTML(
          `${tge(E.check, "✅")} <b>دریافت موفق!</b>\n\n${tge(E.getConfig, "📦")} حجم پکیج: <b>${pkg.size} مگابایت</b>\n${tge(E.coin, "🪙")} سکه کسر شده: <b>${cost} سکه</b>\n${tge(E.coin, "🪙")} موجودی باقی‌مانده: <b>${updatedUser?.coins ?? 0} سکه</b>\n\n${tge(E.myConfigs, "🌐")} کانفیگ اختصاصی شما:\n<code>${h(available.configLink)}</code>\n\nاین کانفیگ در بخش «${s.buttons.myConfigs.label}» ذخیره شد.`,
          { reply_markup: configInlineKeyboard(updatedUser?.coins ?? 0, avail, s) } as object,
        );
        logger.info({ telegramId: ctx.from.id, pkg: pkg.size }, "Config given");
      } catch (err) { logger.error({ err }, "Error giving config"); }
    });
  }

  // ─── back callback ────────────────────────────────────────────────────────
  bot.action("back_menu", async (ctx) => {
    try {
      const s = getSettings();
      await ctx.answerCbQuery();
      await ctx.replyWithHTML("منوی اصلی", { reply_markup: mainMenuKeyboard(s) } as object);
    } catch (err) { logger.error({ err }, "Error in back"); }
  });

  loadSettings().catch(err => logger.error({ err }, "Failed to load settings"));

  return bot;
}
