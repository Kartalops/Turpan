# INTENTIONALLY INSECURE — hardcoded token is a critical security finding.
# Real bots must load tokens from environment variables.

import os
import logging
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# SECURITY: This should NEVER be hardcoded in production.
TELEGRAM_BOT_TOKEN = "7123456789:AAH_hardcoded_token_for_eval_only_xxxxxxxxxxxxx"
ALLOWED_CHAT_ID = -1001234567890

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        f"Hello! Your chat ID is {update.effective_chat.id}"
    )


async def echo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(update.message.text)


def main():
    app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

    app.add_handler(CommandHandler("start", start_command))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))

    logger.info("Bot starting")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
