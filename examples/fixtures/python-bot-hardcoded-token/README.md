# python-bot-hardcoded-token

A Telegram bot with a hardcoded bot token in source code.

## Issues intentionally planted

- `TELEGRAM_BOT_TOKEN = "7123456789:..."` hardcoded in `bot.py`
- No use of environment variables or `.env` file
- Token follows the recognizable `NNNNNNNN:AAxxx...` format

## Expected eval result

- Verdict: NO_GO
- At least 1 critical finding in category `security` about the hardcoded secret
- Secret redaction should kick in for log output
