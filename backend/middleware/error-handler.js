export function notFoundHandler(req, res) {
  res.status(404).json({
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  })
}

export function errorHandler(error, req, res, next) {
  void next

  const status = error.status || error.response?.status || 500
  const message =
    error.message || error.response?.data?.error?.message || 'Internal server error'

  const payload = { error: message }

  if (error.details) {
    payload.details = error.details
  }

  res.status(status).json(payload)
}
