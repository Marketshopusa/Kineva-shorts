import Dexie from 'dexie'

const db = new Dexie('scenarix')

db.version(1).stores({
  series:     '++id, title, theme, createdAt, updatedAt',
  episodes:   '++id, seriesId, episodeNumber, status, createdAt',
  characters: '++id, seriesId, name, role',
  images:     '++id, episodeId, sceneIndex',
})

db.version(2).stores({
  series:     '++id, title, theme, createdAt, updatedAt',
  episodes:   '++id, seriesId, [seriesId+episodeNumber], status, createdAt',
  characters: '++id, seriesId, name, role',
  images:     '++id, episodeId, [episodeId+sceneIndex]',
})

export default db
