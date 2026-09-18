export const IMAGE_PROVIDERS = Object.freeze(["gemini", "fal", "leonardo", "openai", "qwen"])

/**
 * Honor the requested provider. Never silently fall back to a paid backend.
 * @param {string} requested
 * @returns {string}
 */
export function resolveImageProvider(requested) {
  const id = String(requested || "").toLowerCase().trim()
  if (!id) throw new Error("Image provider is required")
  if (!IMAGE_PROVIDERS.includes(id)) {
    throw new Error(`Unknown image provider: ${id}`)
  }
  return id
}

export function isQuotaError(err) {
  const msg = String(err?.message || err || "")
  const status = err?.status || err?.code
  return status === 429 || /429|RESOURCE_EXHAUSTED|quota/i.test(msg)
}

export function quotaBlockMessage(provider) {
  return `BLOQUEADO POR CUOTA (${provider}): no fallback to another image provider`
}

export async function dispatchStill(requested, adapters) {
  const provider = resolveImageProvider(requested)
  const fn = adapters[provider]
  if (typeof fn !== "function") {
    throw new Error(`No adapter for image provider: ${provider}`)
  }
  return { provider, dataUrl: await fn() }
}

