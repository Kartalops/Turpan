"""
Python bot fixture — valid syntax, real structure, fake token.
Used for runtime analyzer tests.
"""

import os
import logging
import asyncio
from telegram import Bot

# Fake token — intentionally fake, never real
# (uses sk- prefix to match hardcoded-secret detector)
OPENAI_API_KEY = "sk-abcdefghijklmnopqrstuvwxyz1234567890abcdef"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class TelegramBot:
    def __init__(self, token: str):
        self.bot = Bot(token=token)
        self.dispatcher = None

    async def start(self):
        logger.info("Bot starting...")
        # await self.bot.start()


def main():
    token = os.environ.get("BOT_TOKEN", BOT_TOKEN)
    bot = TelegramBot(token)
    asyncio.run(bot.start())


if __name__ == "__main__":
    main()
