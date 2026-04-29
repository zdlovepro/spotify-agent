import express from 'express'
import cors from 'cors'
import env from './config/env.js'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'
import agentRouter from './routes/agent.js'
import authRouter from './routes/auth.js'
import historyRouter from './routes/history.js'
import spotifyRouter from './routes/spotify.js'

const app = express()
const allowedOrigins = new Set([
  env.frontendUri,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
])

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
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
app.use('/api/history', historyRouter)
app.use('/api/spotify', spotifyRouter)

app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is running' })
})

app.use(notFoundHandler)
app.use(errorHandler)

app.listen(env.port, () => {
  console.log(`Server is running on http://127.0.0.1:${env.port}`)
})
