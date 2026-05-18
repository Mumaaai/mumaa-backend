# Mumaa Backend Development Guidelines

Welcome to the Mumaa Backend repository. To maintain code quality and prevent deployment issues, please follow these guidelines strictly.

## 1. Project Structure & Routing

*   **Framework**: We use [Hono](https://hono.dev/) for our API.
*   **Modular Routes**: Keep `src/index.ts` clean. All feature routes must be placed in the `src/routes/` directory and mounted in `src/index.ts`.
*   **Mounting Routes**: When mounting a router in `index.ts`, ensure you use a unique path. 
    *   *Bad*: Mounting two different routers on the same path (e.g., `app.route('/journal', journal)` and `app.route('/journal', diet)`). This causes conflicts.
    *   *Good*: `app.route('/diet', diet)`.
*   **No Duplicate Logic**: If you move logic to a separate route file, **delete the old code** in `index.ts`. Do not leave competing implementations.

## 2. CORS (Cross-Origin Resource Sharing)

*   We do **not** use `origin: '*'` because it conflicts with certain auth patterns and is a security risk.
*   All allowed frontend origins must be added to the `ALLOWED_ORIGINS` array in `src/index.ts`.
*   If you deploy the frontend to a new domain (e.g., Vercel, Cloudflare Pages, custom domain), you **must** add that URL to `ALLOWED_ORIGINS` and redeploy the backend.

## 3. Database (Cloudflare D1)

*   **Schema**: The main schema is in `database/schema.sql`.
*   **Migrations**: If you add new tables or columns, create a migration file in the `database/` folder (e.g., `migration_v6.sql`).
*   **Applying Migrations**:
    *   To apply locally: `npx wrangler d1 execute mumaa --local --file=./database/migration_xxx.sql`
    *   To apply to production: `npx wrangler d1 execute mumaa --remote --file=./database/migration_xxx.sql`
*   **Verification**: Always check if the table/columns exist in production before deploying code that relies on them!

## 4. Environment Variables

*   Variables like `GOOGLE_CLIENT_ID` are defined in `wrangler.toml` under `[vars]`.
*   Remember that the frontend also needs these variables (prefixed with `VITE_`) in a `.env` file during the build process.

## 5. Local Development & Testing

*   Always run `npm install` after pulling changes to ensure you have the latest dependencies.
*   To start the development server: `npx wrangler dev --config wrangler.toml`
*   Test your endpoints locally before pushing. If a command fails due to config paths, use the `--config wrangler.toml` flag explicitly.

## 6. Committing Code

*   **Do not commit broken code**. If it doesn't run locally, don't push it.
*   **Stage carefully**: Use `git status` and `git diff` to see what you are committing. Don't accidentally commit untracked test files or delete files without reason.
*   Write descriptive commit messages (e.g., `feat: add diet plan routes` instead of `stuff`).
