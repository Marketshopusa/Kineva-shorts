import db from './db'

// ─── Series CRUD ────────────────────────────────────────────

export async function createSeries(data) {
  const now = new Date().toISOString()
  const id = await db.series.add({
    ...data,
    ongoingPlotThreads: [],
    lastCliffhanger: '',
    episodeSummaries: [],
    seriesBible: { locations: [], keyEvents: [], worldRules: [] },
    createdAt: now,
    updatedAt: now,
  })
  return id
}

export async function loadAllSeries() {
  const allSeries = await db.series.orderBy('updatedAt').reverse().toArray()
  const result = []
  for (const s of allSeries) {
    const episodeCount = await db.episodes.where('seriesId').equals(s.id).count()
    result.push({ ...s, episodeCount })
  }
  return result
}

export async function loadSeries(id) {
  return db.series.get(id)
}

export async function updateSeries(id, updates) {
  await db.series.update(id, { ...updates, updatedAt: new Date().toISOString() })
}

export async function deleteSeries(id) {
  const episodes = await db.episodes.where('seriesId').equals(id).toArray()
  for (const ep of episodes) {
    await db.images.where('episodeId').equals(ep.id).delete()
  }
  await db.episodes.where('seriesId').equals(id).delete()
  await db.characters.where('seriesId').equals(id).delete()
  await db.series.delete(id)
}

// ─── Characters CRUD ────────────────────────────────────────

export async function createCharacter(data) {
  const id = await db.characters.add({
    ...data,
    createdAt: new Date().toISOString(),
  })
  return id
}

export async function loadCharacters(seriesId) {
  return db.characters.where('seriesId').equals(seriesId).toArray()
}

export async function updateCharacter(id, updates) {
  await db.characters.update(id, updates)
}

export async function deleteCharacter(id) {
  await db.characters.delete(id)
}

// ─── Episodes CRUD ──────────────────────────────────────────

export async function createEpisode(data) {
  const id = await db.episodes.add({
    ...data,
    createdAt: new Date().toISOString(),
  })
  return id
}

export async function loadEpisodes(seriesId) {
  return db.episodes.where('seriesId').equals(seriesId).sortBy('episodeNumber')
}

export async function loadEpisode(id) {
  return db.episodes.get(id)
}

export async function loadEpisodeByNumber(seriesId, episodeNumber) {
  return db.episodes
    .where({ seriesId, episodeNumber })
    .first()
}

export async function updateEpisode(id, updates) {
  await db.episodes.update(id, updates)
}

export async function deleteEpisode(id) {
  await db.images.where('episodeId').equals(id).delete()
  await db.episodes.delete(id)
}

// ─── Images CRUD ────────────────────────────────────────────

export async function saveImage(episodeId, sceneIndex, blob, prompt) {
  const existing = await db.images
    .where({ episodeId, sceneIndex })
    .first()

  if (existing) {
    await db.images.update(existing.id, { blob, prompt })
    return existing.id
  }

  return db.images.add({
    episodeId,
    sceneIndex,
    blob,
    prompt,
    width: 1080,
    height: 1920,
  })
}

export async function loadImages(episodeId) {
  return db.images.where('episodeId').equals(episodeId).sortBy('sceneIndex')
}

export async function loadImage(episodeId, sceneIndex) {
  return db.images.where({ episodeId, sceneIndex }).first()
}

// ─── Series Finalization ────────────────────────────────────

export async function finalizeEpisode(episodeId, summaryData) {
  const episode = await db.episodes.get(episodeId)
  if (!episode) return

  await db.episodes.update(episodeId, {
    status: 'completed',
    summary: summaryData.summary,
    cliffhanger: summaryData.cliffhanger,
    plotThreadsIntroduced: summaryData.plotThreadsIntroduced || [],
    plotThreadsResolved: summaryData.plotThreadsResolved || [],
  })

  const series = await db.series.get(episode.seriesId)
  if (!series) return

  const newSummaries = [
    ...(series.episodeSummaries || []),
    {
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      summary: summaryData.summary,
    },
  ]

  const resolvedSet = new Set(summaryData.plotThreadsResolved || [])
  const existingThreads = (series.ongoingPlotThreads || []).filter(t => !resolvedSet.has(t))
  const newThreads = [...existingThreads, ...(summaryData.plotThreadsIntroduced || [])]

  // Merge locations and key events into series bible
  const bible = series.seriesBible || { locations: [], keyEvents: [], worldRules: [] }
  if (summaryData.locationsUsed?.length) {
    const existingNames = new Set(bible.locations.map((l) => l.name.toLowerCase()))
    for (const loc of summaryData.locationsUsed) {
      if (!existingNames.has(loc.name.toLowerCase())) {
        bible.locations.push({ ...loc, firstMentioned: episode.episodeNumber })
        existingNames.add(loc.name.toLowerCase())
      }
    }
  }
  if (summaryData.keyEvents?.length) {
    for (const evt of summaryData.keyEvents) {
      bible.keyEvents.push({ ...evt, episodeNumber: episode.episodeNumber })
    }
  }

  await updateSeries(episode.seriesId, {
    episodeSummaries: newSummaries,
    lastCliffhanger: summaryData.cliffhanger || '',
    ongoingPlotThreads: newThreads,
    seriesBible: bible,
  })

  if (summaryData.characterArcUpdates) {
    const characters = await loadCharacters(episode.seriesId)
    for (const [charName, arcUpdate] of Object.entries(summaryData.characterArcUpdates)) {
      const char = characters.find(c => c.name === charName)
      if (char) {
        const arcProgression = [
          ...(char.personality?.arcProgression || []),
          { episode: episode.episodeNumber, state: arcUpdate },
        ]
        await updateCharacter(char.id, {
          personality: { ...char.personality, arcProgression },
        })
      }
    }
  }
}

// ─── Backup / Restore ───────────────────────────────────────

export async function exportSeriesBackup(seriesId) {
  const series = await db.series.get(seriesId)
  const characters = await loadCharacters(seriesId)
  const episodes = await loadEpisodes(seriesId)

  const episodesWithImages = []
  for (const ep of episodes) {
    const images = await loadImages(ep.id)
    const imagesData = []
    for (const img of images) {
      const base64 = img.blob ? await blobToBase64(img.blob) : null
      imagesData.push({ ...img, blob: base64 })
    }
    episodesWithImages.push({ ...ep, images: imagesData })
  }

  return { series, characters, episodes: episodesWithImages, exportedAt: new Date().toISOString() }
}

export async function importSeriesBackup(backup) {
  const seriesId = await createSeries(backup.series)

  for (const char of backup.characters) {
    const { id, ...charData } = char
    await createCharacter({ ...charData, seriesId })
  }

  for (const ep of backup.episodes) {
    const { id, images, ...epData } = ep
    const episodeId = await createEpisode({ ...epData, seriesId })

    if (images) {
      for (const img of images) {
        const blob = img.blob ? base64ToBlob(img.blob) : null
        if (blob) {
          await saveImage(episodeId, img.sceneIndex, blob, img.prompt)
        }
      }
    }
  }

  return seriesId
}

function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(reader.result)
    reader.readAsDataURL(blob)
  })
}

function base64ToBlob(dataUrl) {
  const [header, data] = dataUrl.split(',')
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png'
  const bytes = atob(data)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  return new Blob([arr], { type: mime })
}
