import crypto from 'crypto'

const SCRYPT_KEYLEN = 64

function normalizePassword(password) {
  return typeof password === 'string' ? password : ''
}

export function hashPassword(password) {
  const normalizedPassword = normalizePassword(password)
  const salt = crypto.randomBytes(16).toString('hex')
  const derivedKey = crypto
    .scryptSync(normalizedPassword, salt, SCRYPT_KEYLEN)
    .toString('hex')

  return `scrypt:${salt}:${derivedKey}`
}

export function verifyPassword(password, storedHash) {
  const normalizedPassword = normalizePassword(password)

  if (!storedHash || typeof storedHash !== 'string') {
    return false
  }

  const [algorithm, salt, derivedKey] = storedHash.split(':')

  if (algorithm !== 'scrypt' || !salt || !derivedKey) {
    return false
  }

  const computedKey = crypto
    .scryptSync(normalizedPassword, salt, SCRYPT_KEYLEN)
    .toString('hex')

  const expected = Buffer.from(derivedKey, 'hex')
  const actual = Buffer.from(computedKey, 'hex')

  if (expected.length !== actual.length) {
    return false
  }

  return crypto.timingSafeEqual(expected, actual)
}

export default {
  hashPassword,
  verifyPassword,
}
