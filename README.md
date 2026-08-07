# Sistem Ujian Karyawan & Dashboard Admin

Aplikasi web untuk ujian karyawan, dashboard admin, dan integrasi Supabase.

## Deployment stack
- GitHub untuk version control
- Vercel untuk hosting frontend + API serverless
- Supabase untuk database

## Environment variables
Copy [.env.example](.env.example) to `.env.local` and fill in the values:

```bash
cp .env.example .env.local
```

Required variables:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `GEMINI_API_KEY` (optional for AI features)

## Local development
```bash
npm install
npm run dev
```

## Production deployment
1. Push the repository to GitHub.
2. Import the repo in Vercel.
3. Add the environment variables in Vercel.
4. Connect the GitHub repository to Vercel for automatic deployments.
5. Run the SQL schema from [src/lib/supabase.ts](src/lib/supabase.ts) in Supabase SQL Editor.
