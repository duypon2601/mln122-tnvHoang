# Local Development

This app uses an API endpoint at `/api/leaderboard`.

Do not test it with VS Code Live Server on port `5500`, because Live Server only serves static files and cannot run `/api/leaderboard`.

## Run locally

1. Install Node.js LTS if `npm` is not available:

```txt
https://nodejs.org
```

After installing Node.js, close PowerShell/VS Code and open it again so the `npm` command is added to PATH.

If PowerShell blocks `npm.ps1` with an Execution Policy error, either use the `.cmd` shim:

```powershell
npm.cmd -v
npm.cmd install
npm.cmd run local
```

Or allow local scripts for the current Windows user:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

2. Fill `.env` with real Supabase values:

```env
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

3. Install dependencies:

```bash
npm install
```

4. Start the local Node server:

```bash
npm run local
```

5. Open:

```txt
http://localhost:3000
```

## Vercel CLI

The project also has a Vercel CLI script:

```bash
npm run vercel:dev
```

If Vercel CLI crashes on Windows with `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`, use `npm run local` for local testing instead. Deployment to Vercel can still use the `api/leaderboard.js` serverless function.
