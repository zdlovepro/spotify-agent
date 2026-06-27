export function assert(condition, message, status = 400, details = undefined) {
  if (condition) {
    return
  }

  const error = new Error(message)
  error.status = status

  if (details !== undefined) {
    error.details = details
  }

  throw error
}

export default assert
