import app from "./app";
import { logger } from "./lib/logger";
import { createBot } from "./bot";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// Only start the bot on Railway (or when BOT_ENABLED=true is set explicitly).
// On Replit dev, RAILWAY_ENVIRONMENT is not set, so the bot stays off — prevents 409 conflict.
const botEnabled =
  process.env["BOT_ENABLED"] === "true" ||
  typeof process.env["RAILWAY_ENVIRONMENT"] === "string";

const botToken = process.env["TELEGRAM_BOT_TOKEN"];
if (!botEnabled) {
  logger.info("Bot disabled on this instance (set BOT_ENABLED=true or deploy to Railway to enable)");
} else if (!botToken) {
  logger.error("TELEGRAM_BOT_TOKEN is not set — bot will not start");
} else {
  const bot = createBot(botToken);
  bot.launch({ dropPendingUpdates: true }).then(() => {
    logger.info("Telegram bot started (long polling)");
  }).catch((err) => {
    logger.error({ err }, "Failed to start Telegram bot");
  });

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
}
