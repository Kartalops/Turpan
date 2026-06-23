"""Telegram bot for automated tasks."""
import os
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")


async def start(update: Update, context):
    """Handle /start command."""
    await update.message.reply_text("Hello! I'm a Telegram bot.")


async def help_command(update: Update, context):
    """Handle /help command."""
    await update.message.reply_text("Available commands: /start, /help")


def main():
    """Start the bot."""
    application = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))

    application.run_polling()


if __name__ == "__main__":
    main()
