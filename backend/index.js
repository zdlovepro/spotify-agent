import express from 'express'
import cors from 'cors'
import env from './config/env.js'
import { migrateDatabase } from './db/migrate.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'
import agentRouter from './routes/agent.js'
import authRouter from './routes/auth.js'
import catalogRouter from './routes/catalog.js'
import historyRouter from './routes/history.js'
import libraryRouter from './routes/library.js'
import localAuthRouter from './routes/local-auth.js'
import mediaRouter from './routes/media.js'
import playerRouter from './routes/player.js'
import providersRouter from './routes/providers.js'
import spotifyRouter from './routes/spotify.js'

migrateDatabase()

const app = express()
const allowedOrigins = new Set([
  env.frontendUri,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

function isLoopbackViteOrigin(origin) {
  try {
    const url = new URL(origin)
    const isLoopbackHost =
      url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    const isVitePort = Number(url.port) >= 5173 && Number(url.port) <= 5179

    return url.protocol === 'http:' && isLoopbackHost && isVitePort
  } catch {
    return false
  }
}

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin) || isLoopbackViteOrigin(origin)) {
        callback(null, true)
        return
      }

      callback(new Error(`Origin not allowed by CORS: ${origin}`))
    },
    credentials: true,
  }),
)
app.use(express.json())

app.use('/api/auth', authRouter)
app.use('/api/agent', agentRouter)
app.use('/api/catalog', catalogRouter)
app.use('/api/history', historyRouter)
app.use('/api/library', libraryRouter)
app.use('/api/local-auth', localAuthRouter)
app.use('/api/media', mediaRouter)
app.use('/api/player', playerRouter)
app.use('/api/providers', providersRouter)
app.use('/api/spotify', spotifyRouter)

app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is running' })
})

app.use(notFoundHandler)
app.use(errorHandler)

app.listen(env.port, () => {
  console.log(`Server is running on http://127.0.0.1:${env.port}`)
})
