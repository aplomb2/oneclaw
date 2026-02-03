# OneClaw 🦞

**One-click deployment for your AI assistant.**

Deploy [OpenClaw](https://github.com/openclaw/openclaw) to the cloud with zero CLI knowledge.

## Quick Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/oneclaw)

## Features

- 🚀 One-click cloud deployment
- 💬 Telegram & Discord support (WhatsApp coming soon)
- 🧠 Multi-model support (Claude, GPT, DeepSeek)
- ☁️ Runs on your own cloud account (BYOC)
- 🔒 Your data stays yours

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes* | Claude API key |
| `OPENAI_API_KEY` | Yes* | OpenAI API key |
| `TELEGRAM_BOT_TOKEN` | No | For Telegram integration |
| `DISCORD_BOT_TOKEN` | No | For Discord integration |

*At least one AI provider key is required.

## Self-Hosting

```bash
# Clone this repo
git clone https://github.com/aplomb2/oneclaw.git
cd oneclaw

# Set environment variables
cp .env.example .env
# Edit .env with your API keys

# Run with Docker
docker-compose up -d
```

## License

MIT

---

Built with ❤️ by [Bo](https://github.com/aplomb2)
