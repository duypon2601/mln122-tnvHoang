# Hanh Trinh Kham Pha Kinh Te

Single-page app with a Vercel API endpoint for the Supabase leaderboard.

## Project Structure

```txt
index.html              Static single-page app
api/leaderboard.js      Vercel Serverless Function for leaderboard read/write
server.js               Local-only dev server that mirrors /api/leaderboard
.env.example            Example env file, safe to commit
.env                    Local secrets, do not commit
vercel.json             SPA rewrite config for Vercel
```

## Environment Variables

Create `.env` locally from `.env.example`:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Use the Supabase `service_role` key only on the server. Never put it in `index.html`.

## Supabase Table

Run this in Supabase SQL Editor if the table does not exist:

```sql
create table public.leaderboard (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  time_str text not null,
  score integer not null,
  errors integer not null default 0,
  created_at timestamptz not null default now()
);
```

RLS can stay disabled if all Supabase access goes through the server endpoint.

## Local Development

Do not use VS Code Live Server on port `5500`; it cannot run `/api/leaderboard`.

If PowerShell blocks `npm.ps1`, use `npm.cmd`:

```powershell
npm.cmd run local
```

Then open:

```txt
http://localhost:3000
```

## Deploy To Vercel

1. Push this project to GitHub.

2. In Vercel, import the GitHub repository.

3. In **Project Settings -> Environment Variables**, add:

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

4. Deploy.

5. After deploy, open:

```txt
https://your-project.vercel.app/api/leaderboard
```

Expected response is an array:

```json
[]
```

or existing leaderboard records.

## Security Notes

`.env` is ignored by Git. If it was committed before, remove it from Git tracking:

```powershell
git rm --cached .env
git add .gitignore
git commit -m "Stop tracking env file"
```

If a service role key was ever pushed to GitHub, rotate it in Supabase and update Vercel env variables.
