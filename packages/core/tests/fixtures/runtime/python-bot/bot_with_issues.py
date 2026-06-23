"""
Python bot fixture — multiple runtime issues for detection.
Contains: hardcoded token, infinite loop without shutdown,
bare except pass, blocking in async, webhook+polling ambiguity.
"""

import time
import asyncio
import os
import logging
from telegram import Bot
from telegram.ext import Application, CommandHandler

# HARDCODED SECRET — for testing detection
BOT_TOKEN = "sk-abcdefghijklmnopqrstuvwxyz1234567890abcdef"

logger = logging.getLogger(__name__)

bot_token = os.environ.get("BOT_TOKEN", "123456789:FAKE_TOKEN")

# INFINITE LOOP without break or shutdown
while True:
    time.sleep(1)
    print("bot running")


class BotHandler:
    def __init__(self):
        self.bot = Bot(token=bot_token)

    async def handle_message(self, message):
        # BLOCKING in async — time.sleep instead of asyncio.sleep
        time.sleep(0.1)
        # BARE EXCEPT PASS — swallows all errors silently
        try:
            await self.bot.send_message(chat_id=message["chat"], text="ok")
        except:
            pass


async def main():
    app = Application.builder().token(bot_token).build()
    await app.initialize()

    # webhook_url set unconditionally to ensure detection
    webhook_url = os.environ.get("WEBHOOK_URL", "https://example.com/bot")

    await app.start()
    await app.updater.start_polling()  # polling enabled
    # set_webhook called — both active = ambiguity
    await app.bot.set_webhook(webhook_url)


def run_bot():
    handler = BotHandler()
    logger.info(f"bot initialized with token prefix: {bot_token[:10]}...")


if __name__ == "__main__":
    run_bot()
