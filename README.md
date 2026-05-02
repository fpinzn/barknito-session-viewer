# Session Viewer

Browser-based session viewer built with React, TypeScript, Vite, and `react-three-fiber`.

## Local Development

Requirements:
- Node.js 20+
- npm

Commands:

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Deployment

This app is a static frontend. The simplest deployment target for the current codebase is Cloudflare Pages.

### Cloudflare Pages settings

- Framework preset: `Vite`
- Build command: `npm run build`
- Build output directory: `dist`
- Root directory: `/`
- Node.js version: `20`

You can deploy by connecting the repository in the Cloudflare Pages dashboard, or by using Wrangler externally if you already have it installed.

### Important: Google OAuth allowed origins

The app loads Google Identity Services in the browser and uses the OAuth client ID hardcoded in [src/features/gcs-browser/auth.ts](/Users/francisco/dev/barknito/session-viewer/src/features/gcs-browser/auth.ts:1).

After Pages gives you a domain, add that exact origin to the Google Cloud Console for this OAuth client:

- Authorized JavaScript origins: `https://<your-pages-domain>`

If you use a custom domain, add that origin too:

- Authorized JavaScript origins: `https://<your-custom-domain>`

Without this, `Sign in with Google` will fail in production even if the site itself deploys correctly.

### Deploy steps

1. Push this repository to GitHub.
2. In Cloudflare, create a new Pages project from the repo.
3. Use the build settings listed above.
4. Deploy once and note the generated production URL.
5. Add that URL to the OAuth client allowed origins in Google Cloud Console.
6. Redeploy if needed after updating OAuth settings.

## Notes

- The app does not currently use client-side routing, so no SPA fallback rule is required.
- The current production build succeeds, but the main JS bundle is large enough for Vite to warn about chunk size during build.
