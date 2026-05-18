import { Hono }  from 'hono'
import { cors }   from 'hono/cors'

// ─── Route modules ────────────────────────────────────────────────────────────
import auth         from './routes/auth'
import baby         from './routes/baby'
import chat         from './routes/chat'
import dashboard    from './routes/dashboard'
import activity     from './routes/activity'
import growth       from './routes/growth'
import vaccinations from './routes/vaccinations'
import milestones   from './routes/milestones'
import journal      from './routes/journal'
import diet from './routes/diet_plan'

// ─── Types ────────────────────────────────────────────────────────────────────
type Bindings = {
  DB: D1Database
  GOOGLE_CLIENT_ID?: string
}

// ─── App ──────────────────────────────────────────────────────────────────────
const app = new Hono<{ Bindings: Bindings }>()

// Allowed origins — add any new deployment URLs here
const ALLOWED_ORIGINS = [
  'http://localhost:5173',   // Vite dev server
  'http://localhost:5174',   // Vite dev server
  'http://localhost:5175',   // Vite dev server
  'http://localhost:8787',   // Vite dev server
  'http://localhost:3000',   // Alt local dev
  'http://localhost:8000',   // Alt local dev
  'https://mumaa-api.srisumit96-1ca.workers.dev', // Production worker
]

// Global CORS
// NOTE: `origin: '*'` + `credentials: true` is forbidden by the CORS spec.
// Use an explicit origin allowlist instead.
app.use('*', cors({
  origin: (origin) => ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Staff-ID'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  // credentials: true is only needed for cookie-based auth.
  // This API uses Authorization headers, so it is intentionally omitted.
}))

// Health check
app.get('/', (c) => c.json({ message: 'Welcome to Mumaa AI API', status: 'online' }))

// ─── Mount Routers ────────────────────────────────────────────────────────────
app.route('/auth',         auth)
app.route('/baby',         baby)
app.route('/chat',         chat)
app.route('/dashboard',    dashboard)
app.route('/logs/activity',activity)
app.route('/growth',       growth)
app.route('/vaccinations', vaccinations)
app.route('/milestones',   milestones)
app.route('/journal',      journal)
app.route('/journal',      diet)


export default app
