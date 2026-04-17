import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import { errorHandler, notFoundHandler } from './middleware/error-handler.js'
import authRouter from './routes/auth.js'
import spotifyRouter from './routes/spotify.js'

dotenv.config()

const app = express()
const port = process.env.PORT || 3000

app.use(
  cors({
    origin: process.env.FRONTEND_URI || 'http://localhost:5173',
    credentials: true,
  }),
)
app.use(express.json())

app.use('/api/auth', authRouter)
app.use('/api/spotify', spotifyRouter)

app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend is running' })
})

app.use(notFoundHandler)
app.use(errorHandler)

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`)
})
