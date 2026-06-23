"""
Telegram bot that silently swallows all exceptions — errors are hidden
from operators and users cannot tell when something fails.
"""

import logging
import sys
from telegram import Update
from telegram.ext import ApplicationBuilder, CommandHandler, MessageHandler, filters, ContextTypes

# Configure logging to stdout so we can see errors
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO,
)
logger = logging.getLogger(__name__)


async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text('Hello! I am your assistant bot.')


async def echo(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(update.message.text)


async def get_user_profile(update: Update, context: ContextTypes.DEFAULT_TYPE):
    """Fetch and display user profile information."""
    user = update.message.from_user
    # This could fail if the user has restricted profile access
    try:
        profile = await context.bot.get_user_profile_photos(user.id)
        await update.message.reply_text(f"Your ID: {user.id}\nName: {user.full_name}")
    except Exception:
        # SECURITY FLAW: silently swallow — operator never knows this failed
        pass


def main():
    TOKEN = "123456:ABCdefGHIjklMNOpqrsTUVwxyz"  # hardcoded token

    app = ApplicationBuilder().token(TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, echo))
    app.add_handler(CommandHandler("profile", get_user_profile))

    # BROAD EXCEPT PASS — main issue for this fixture
    try:
        logger.info("Starting bot...")
        app.run_polling()
    except Exception:
        # All exceptions are silently swallowed here
        # Operator has no idea the bot crashed or why
        pass


if __name__ == "__main__":
    main()
