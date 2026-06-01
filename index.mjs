import { Bot } from "grammy";

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is required");

  const bot = new Bot(token);

  bot.command("start", (ctx) => ctx.reply("سلام! 👋"));
  bot.on("message", (ctx) => ctx.reply("سلام! 👋"));

  bot.catch((err) => console.error("Bot error:", err));

  bot.start({ onStart: (info) => console.log("Bot started:", info.username) });
  