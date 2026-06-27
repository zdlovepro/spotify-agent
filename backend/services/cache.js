const cacheStore = new Map()

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`
  }

  return JSON.stringify(value)
}

function pruneExpiredEntries() {
  const now = Date.now()

  for (const [key, entry] of cacheStore.entries()) {
    if (entry.expiresAt <= now) {
      cacheStore.delete(key)
    }
  }
}

export function buildCacheKey(parts) {
  return stableStringify(parts)
}

export async function getOrSetCache(key, ttlMs, loader) {
  if (!ttlMs || ttlMs <= 0) {
    return loader()
  }

  pruneExpiredEntries()

  const cached = cacheStore.get(key)

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value
  }

  const value = await loader()

  cacheStore.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  })

  return value
}

export function clearCache() {
  cacheStore.clear()
}
