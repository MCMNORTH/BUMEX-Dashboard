# BUMEX IT Dashboard

Internal workspace dashboard for BUMEX teams. The application combines authentication, entity-aware workspace navigation, ticket and project views, team workload tracking, and finance-related document generation.

## Stack

- Next.js 16
- React 19
- TypeScript
- Tailwind CSS 4
- Supabase
- Nodemailer

## Local setup

1. Install dependencies:

```bash
npm install
```

2. Create a local environment file from the example:

```bash
cp .env.example .env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env.local
```

3. Fill in the required values in `.env.local`.

4. Start the development server:

```bash
npm run dev
```

5. Open `http://localhost:3000`.

## Environment variables

Core application:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `APP_URL`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SITE_URL`

Feature flags:

- `NEXT_PUBLIC_ENABLE_SELF_SIGNUP`
- `ENABLE_SELF_SIGNUP`
- `ENABLE_ENTITY_SCOPING`
- `ENABLE_LOCAL_PREVIEW_AUTH`

Admin and email:

- `BUMEX_SUPER_ADMIN_EMAIL`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM`

Billing and invoice metadata:

- `BUMEX_BILLING_COMPANY`
- `BUMEX_BILLING_ADDRESS`
- `BUMEX_BILLING_ADDRESS_LINE_2`
- `BUMEX_BILLING_CITY`
- `BUMEX_BILLING_COUNTRY`
- `BUMEX_BILLING_EMAIL`
- `BUMEX_BILLING_PHONE`
- `BUMEX_BILLING_WEBSITE`
- `BUMEX_BILLING_TAX_ID`
- `BUMEX_BILLING_BANK_NAME`
- `BUMEX_BILLING_ACCOUNT_OWNER`
- `BUMEX_BILLING_IBAN`
- `BUMEX_BILLING_BIC`
- `BUMEX_BILLING_CAPITAL`
- `BUMEX_BILLING_FOOTER`

## Available scripts

- `npm run dev`: start the development server with Turbopack
- `npm run dev:turbo`: explicit Turbopack dev mode
- `npm run dev:webpack`: fallback dev mode with Webpack
- `npm run build`: production build
- `npm run start`: serve the production build
- `npm run lint`: run ESLint

## Collaboration notes

- Never commit `.env.local` or any production secrets.
- Use `.env.example` as the reference for required configuration.
- Before opening a pull request, run `npm run lint` and `npm run build`.
- Store logos and static assets in `public/`.

## Deployment

The project is designed for Vercel production deployment. Production environment variables must be configured in the hosting platform before promoting a build.
