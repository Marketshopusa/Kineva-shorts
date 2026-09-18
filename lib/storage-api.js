// Storage adapter — replaces Dexie/IndexedDB with API calls to Prisma backend

async function apiFetch(url, options = {}) {
  const res = await fetch(url, options)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(data.error || `API error: ${res.status}`)
  }
  return res.json()
}

// ─── Series CRUD ────────────────────────────────────────────

export async function createSeries(data) {
  const result = await apiFetch("/api/admin/series", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return result.id
}

export async function loadAllSeries() {
  return apiFetch("/api/admin/series")
}

export async function loadSeries(id) {
  return apiFetch(`/api/admin/series/${id}`)
}

export async function updateSeries(id, updates) {
  return apiFetch(`/api/admin/series/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  })
}

export async function deleteSeries(id) {
  await apiFetch(`/api/admin/series/${id}`, { method: "DELETE" })
}

// ─── Characters CRUD ────────────────────────────────────────

export async function createCharacter(data) {
  const result = await apiFetch("/api/admin/characters", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return result.id
}

export async function loadCharacters(seriesId) {
  return apiFetch(`/api/admin/characters?seriesId=${seriesId}`)
}

export async function updateCharacter(id, updates) {
  await apiFetch(`/api/admin/characters/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  })
}

export async function deleteCharacter(id) {
  await apiFetch(`/api/admin/characters/${id}`, { method: "DELETE" })
}

// ─── Episodes CRUD ──────────────────────────────────────────

export async function createEpisode(data) {
  const result = await apiFetch("/api/admin/episodes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  })
  return result.id
}

export async function loadEpisodes(seriesId) {
  return apiFetch(`/api/admin/episodes/by-series?seriesId=${seriesId}`)
}

export async function loadEpisode(id) {
  return apiFetch(`/api/admin/episodes/${id}`)
}

export async function loadEpisodeByNumber(seriesId, episodeNumber) {
  return apiFetch(`/api/admin/episodes/by-number?seriesId=${seriesId}&episodeNumber=${episodeNumber}`)
}

export async function updateEpisode(id, updates) {
  await apiFetch(`/api/admin/episodes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  })
}

export async function deleteEpisode(id) {
  await apiFetch(`/api/admin/episodes/${id}`, { method: "DELETE" })
}

// ─── Images CRUD ────────────────────────────────────────────

export async function saveImage(episodeId, sceneIndex, imageData, prompt) {
  // imageData can be a base64 data URL string or a Blob
  let dataUrl = imageData
  if (imageData instanceof Blob) {
    dataUrl = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.readAsDataURL(imageData)
    })
  }

  const result = await apiFetch("/api/admin/images", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ episodeId, sceneIndex, imageData: dataUrl, prompt }),
  })
  // Returns { id, filePath, url } — url is the versioned CDN URL with no cache issues
  return result
}

export async function loadImages(episodeId) {
  const images = await apiFetch(`/api/admin/images/by-episode?episodeId=${episodeId}`)
  // Append a cache-buster so the browser always fetches the latest file
  // (avoids stale immutable-cached responses after image regeneration)
  const v = Date.now()
  return images.map((img) => ({
    ...img,
    url: `/api/admin/images/${img.id}?v=${v}`,
  }))
}

export async function loadImage(episodeId, sceneIndex) {
  const images = await apiFetch(`/api/admin/images/by-episode?episodeId=${episodeId}`)
  const img = images.find((i) => i.sceneIndex === sceneIndex)
  if (!img) return null
  return { ...img, url: `/api/admin/images/${img.id}` }
}

// ─── Series Finalization ────────────────────────────────────

export async function finalizeEpisode(episodeId, summaryData) {
  await apiFetch("/api/admin/finalize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ episodeId, summaryData }),
  })
}

// ─── Backup / Restore ───────────────────────────────────────

export async function exportSeriesBackup(seriesId) {
  return apiFetch(`/api/admin/backup?seriesId=${seriesId}`)
}

export async function importSeriesBackup(backup) {
  const result = await apiFetch("/api/admin/backup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(backup),
  })
  return result.id
}
