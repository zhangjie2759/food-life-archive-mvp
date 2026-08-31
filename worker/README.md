# Gemini Worker

This Worker is the production-only secret boundary for the public GitHub Pages PWA. It accepts requests only from the published Pages origin and local development, enforces an 8 MB JSON limit and a per-isolate request-rate guard, and forwards one compressed image to Gemini for objective classification.

The Gemini key must be stored with `wrangler secret put AI_API_KEY`. Never place it in `wrangler.jsonc`, a Vite variable, GitHub Pages, or a tracked file.

Deployment from the repository root:

```bash
npx wrangler deploy --config worker/wrangler.jsonc
npx wrangler secret put AI_API_KEY --config worker/wrangler.jsonc
```

After deployment, verify `/health`, call `/api/analyze` from the published Pages origin, then set the public Worker origin as `VITE_AI_API_URL` for the Pages production build.
