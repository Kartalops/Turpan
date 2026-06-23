# Fake SaaS App

A SaaS application with auth, billing, and dashboard.

## Features

- **Authentication**: Built-in JWT auth with login/logout
- **Billing**: Stripe integration for payments and subscriptions
- **Dashboard**: Real-time analytics dashboard with charts
- **Database**: Prisma ORM with PostgreSQL
- **Email**: SendGrid email notifications

## Setup

1. Clone the repo
2. Run `npm install`
3. Configure `.env` with your API keys
4. Run `npm run dev`

## API Endpoints

- `POST /api/auth/login` — Authenticate user
- `GET /api/users` — List users
- `POST /api/billing/checkout` — Create Stripe checkout session

## Tech Stack

- Next.js 14 (App Router)
- TypeScript
- Prisma + PostgreSQL
- Stripe for payments
- SendGrid for emails
