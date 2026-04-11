import { db } from './firebase'
import { doc, setDoc, deleteDoc, getDoc, collection, getDocs, writeBatch, arrayUnion, serverTimestamp } from 'firebase/firestore'

// ─────────────────────────────────────────────────────────
// In-memory cache — reduces Firestore reads dramatically
// Invalidated on every write operation
// ─────────────────────────────────────────────────────────
const _cache = new Map()

function cacheKey(uid, sub) { return `${uid}:${sub}` }

function invalidateUserCache(uid) {
  for (const key of _cache.keys()) {
    if (key.startsWith(`${uid}:`)) _cache.delete(key)
  }
}

async function getCachedCollection(uid, sub) {
  const key = cacheKey(uid, sub)
  if (_cache.has(key)) return _cache.get(key)
  const snap = await getDocs(collection(db, 'users', uid, sub))
  const result = {}
  snap.forEach(d => { result[d.id] = d.data() })
  _cache.set(key, result)
  return result
}

// ─────────────────────────────────────────────────────────
// Watch data
// ─────────────────────────────────────────────────────────
export async function addToWatched(user, item, watchedAt = 'now') {
  const ref = doc(db, 'users', user.uid, 'watched', `${item.media_type}-${item.id}`)
  const data = {
    id: item.id,
    media_type: item.media_type,
    title: item.title || item.name,
    poster_path: item.poster_path || null,
    rating: null,
    watchedAt: watchedAt === 'now' ? new Date().toISOString() : watchedAt === 'unknown' ? null : watchedAt,
    watchedAtUnknown: watchedAt === 'unknown',
  }
  await setDoc(ref, data)
  invalidateUserCache(user.uid)
}

export async function removeFromWatched(user, item) {
  const ref = doc(db, 'users', user.uid, 'watched', `${item.media_type}-${item.id}`)
  await deleteDoc(ref)
  if (item.media_type === 'tv') await unmarkAllShowEpisodes(user, item.id)
  invalidateUserCache(user.uid)
}

export async function unmarkAllShowEpisodes(user, showId) {
  const snap = await getDocs(collection(db, 'users', user.uid, 'episodes'))
  const batch = writeBatch(db)
  snap.forEach(d => { if (d.data().showId === parseInt(showId)) batch.delete(d.ref) })
  await batch.commit()
  invalidateUserCache(user.uid)
}

export async function addToWatchlist(user, item) {
  const ref = doc(db, 'users', user.uid, 'watchlist', `${item.media_type}-${item.id}`)
  await setDoc(ref, {
    id: item.id,
    media_type: item.media_type,
    title: item.title || item.name,
    poster_path: item.poster_path || null,
    addedAt: new Date().toISOString(),
  })
  invalidateUserCache(user.uid)
}

export async function removeFromWatchlist(user, item) {
  const ref = doc(db, 'users', user.uid, 'watchlist', `${item.media_type}-${item.id}`)
  await deleteDoc(ref)
  invalidateUserCache(user.uid)
}

export async function getUserData(user) {
  const [watched, watchlist, episodes] = await Promise.all([
    getCachedCollection(user.uid, 'watched'),
    getCachedCollection(user.uid, 'watchlist'),
    getCachedCollection(user.uid, 'episodes'),
  ])
  return { watched, watchlist, episodes }
}

export async function setRating(user, item, rating) {
  const ref = doc(db, 'users', user.uid, 'watched', `${item.media_type}-${item.id}`)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    const updated = { ...snap.data(), rating }
    await setDoc(ref, updated)
    const key = cacheKey(user.uid, 'watched')
    if (_cache.has(key)) _cache.get(key)[`${item.media_type}-${item.id}`] = updated
  }
}

export async function markEpisodeWatched(user, showId, seasonNum, episodeNum, watchedAt = 'now') {
  const ref = doc(db, 'users', user.uid, 'episodes', `tv-${showId}-s${seasonNum}e${episodeNum}`)
  await setDoc(ref, {
    showId, seasonNum, episodeNum,
    watchedAt: watchedAt === 'now' ? new Date().toISOString() : watchedAt === 'unknown' ? null : watchedAt,
    watchedAtUnknown: watchedAt === 'unknown',
  })
  invalidateUserCache(user.uid)
}

export async function unmarkEpisodeWatched(user, showId, seasonNum, episodeNum) {
  const ref = doc(db, 'users', user.uid, 'episodes', `tv-${showId}-s${seasonNum}e${episodeNum}`)
  await deleteDoc(ref)
  const showRef = doc(db, 'users', user.uid, 'watched', `tv-${showId}`)
  const showSnap = await getDoc(showRef)
  if (showSnap.exists()) await deleteDoc(showRef)
  invalidateUserCache(user.uid)
}

export async function unmarkSeasonWatched(user, showId, seasonNum, episodes) {
  const batch = writeBatch(db)
  for (const ep of episodes) {
    batch.delete(doc(db, 'users', user.uid, 'episodes', `tv-${showId}-s${seasonNum}e${ep.episode_number}`))
  }
  await batch.commit()
  const showSnap = await getDoc(doc(db, 'users', user.uid, 'watched', `tv-${showId}`))
  if (showSnap.exists()) await deleteDoc(doc(db, 'users', user.uid, 'watched', `tv-${showId}`))
  invalidateUserCache(user.uid)
}

export async function getShowEpisodes(user, showId) {
  const allEpisodes = await getCachedCollection(user.uid, 'episodes')
  const episodes = {}
  for (const [id, data] of Object.entries(allEpisodes)) {
    if (data.showId === showId) episodes[id] = data
  }
  return episodes
}

export async function markSeasonWatched(user, showId, seasonNum, episodes, watchedAt = 'now') {
  const batch = writeBatch(db)
  const ts = watchedAt === 'now' ? new Date().toISOString() : watchedAt === 'unknown' ? null : watchedAt
  for (const ep of episodes) {
    batch.set(doc(db, 'users', user.uid, 'episodes', `tv-${showId}-s${seasonNum}e${ep.episode_number}`), {
      showId, seasonNum, episodeNum: ep.episode_number,
      watchedAt: ts, watchedAtUnknown: watchedAt === 'unknown',
    })
  }
  await batch.commit()
  invalidateUserCache(user.uid)
}

export async function markAllSeasonsWatched(user, showId, seasons, watchedAt = 'now') {
  const BATCH_SIZE = 100
  const ts = watchedAt === 'now' ? new Date().toISOString() : watchedAt === 'unknown' ? null : watchedAt
  const allOps = []
  for (const { seasonNum, episodes } of seasons) {
    for (const ep of episodes) {
      allOps.push({
        ref: doc(db, 'users', user.uid, 'episodes', `tv-${showId}-s${seasonNum}e${ep.episode_number}`),
        data: { showId, seasonNum, episodeNum: ep.episode_number, watchedAt: ts, watchedAtUnknown: watchedAt === 'unknown' },
      })
    }
  }
  for (let i = 0; i < allOps.length; i += BATCH_SIZE) {
    const batch = writeBatch(db)
    allOps.slice(i, i + BATCH_SIZE).forEach(({ ref, data }) => batch.set(ref, data))
    await batch.commit()
  }
  invalidateUserCache(user.uid)
}

// ─────────────────────────────────────────────────────────
// Streak (uses cache — no extra reads)
// ─────────────────────────────────────────────────────────
export async function calculateStreak(user) {
  const [watchedData, episodesData] = await Promise.all([
    getCachedCollection(user.uid, 'watched'),
    getCachedCollection(user.uid, 'episodes'),
  ])
  const watchedDates = new Set()
  Object.values(watchedData).forEach(w => { if (w.watchedAt) watchedDates.add(new Date(w.watchedAt).toLocaleDateString()) })
  Object.values(episodesData).forEach(e => { if (e.watchedAt) watchedDates.add(new Date(e.watchedAt).toLocaleDateString()) })

  const today = new Date()
  const activatedToday = watchedDates.has(today.toLocaleDateString())
  const startFrom = activatedToday ? today : new Date(today - 86400000)

  let streak = 0
  let checking = new Date(startFrom)
  while (watchedDates.has(checking.toLocaleDateString())) {
    streak++
    checking = new Date(checking - 86400000)
  }

  const allDates = Array.from(watchedDates).map(d => new Date(d)).sort((a, b) => a - b)
  let longest = 0, current = 0
  for (let i = 0; i < allDates.length; i++) {
    current = i === 0 ? 1 : ((allDates[i] - allDates[i-1]) / 86400000 === 1 ? current + 1 : 1)
    if (current > longest) longest = current
  }
  return { streak, longest, activatedToday }
}

// ─────────────────────────────────────────────────────────
// Profile — with history tracking
// ─────────────────────────────────────────────────────────
export async function createUserProfile(user, username, acceptedTos) {
  const ref = doc(db, 'users', user.uid)
  const now = new Date().toISOString()
  await setDoc(ref, {
    uid: user.uid,
    username: username || null,
    displayName: user.displayName,
    photoURL: user.photoURL || null,
    customPhotoURL: null,
    email: user.email,
    acceptedTos,
    isPrivate: false,
    visibleFields: { watchHistory: true, ratings: true, watchlist: true, episodeProgress: true },
    createdAt: user.metadata?.creationTime ? new Date(user.metadata.creationTime).toISOString() : now,
    // History arrays — each entry: { value, changedAt }
    usernameHistory: username ? [{ value: username, changedAt: now }] : [],
    displayNameHistory: user.displayName ? [{ value: user.displayName, changedAt: now }] : [],
  }, { merge: true })
}

export async function getUserProfile(uid) {
  const ref = doc(db, 'users', uid)
  const snap = await getDoc(ref)
  return snap.exists() ? snap.data() : null
}

export async function updateUserProfile(uid, data) {
  const ref = doc(db, 'users', uid)
  await setDoc(ref, data, { merge: true })
}

// Update username and record history
export async function updateUsername(uid, newUsername) {
  const ref = doc(db, 'users', uid)
  const now = new Date().toISOString()
  await setDoc(ref, {
    username: newUsername,
    usernameHistory: arrayUnion({ value: newUsername, changedAt: now }),
  }, { merge: true })
}

// Update display name and record history
export async function updateDisplayName(uid, newDisplayName) {
  const ref = doc(db, 'users', uid)
  const now = new Date().toISOString()
  await setDoc(ref, {
    displayName: newDisplayName,
    displayNameHistory: arrayUnion({ value: newDisplayName, changedAt: now }),
  }, { merge: true })
}

// Update custom profile photo URL
export async function updateProfilePhoto(uid, photoURL) {
  await setDoc(doc(db, 'users', uid), { customPhotoURL: photoURL }, { merge: true })
}

export async function isUsernameTaken(username) {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.some(d => d.data().username?.toLowerCase() === username.toLowerCase())
}

export async function getUserByUsername(username) {
  const snap = await getDocs(collection(db, 'users'))
  const found = snap.docs.find(d => d.data().username?.toLowerCase() === username.toLowerCase())
  return found ? found.data() : null
}

// ─────────────────────────────────────────────────────────
// Export — comprehensive, well-structured
// ─────────────────────────────────────────────────────────
export async function exportUserData(user) {
  // Always read fresh for export (bypass cache)
  const [profileSnap, watchedSnap, watchlistSnap, episodesSnap] = await Promise.all([
    getDoc(doc(db, 'users', user.uid)),
    getDocs(collection(db, 'users', user.uid, 'watched')),
    getDocs(collection(db, 'users', user.uid, 'watchlist')),
    getDocs(collection(db, 'users', user.uid, 'episodes')),
  ])

  const p = profileSnap.exists() ? profileSnap.data() : {}

  const profile = {
    uid: p.uid || user.uid,
    username: p.username || null,
    displayName: p.displayName || null,
    email: p.email || null,
    photoURL: p.customPhotoURL || p.photoURL || null,
    isPrivate: p.isPrivate || false,
    visibleFields: p.visibleFields || {},
    acceptedTos: p.acceptedTos || null,
    createdAt: p.createdAt || null,
    linkedProviders: user.providerData?.map(pr => pr.providerId) || [],
    usernameHistory: p.usernameHistory || [],
    displayNameHistory: p.displayNameHistory || [],
  }

  const watched = watchedSnap.docs.map(d => {
    const w = d.data()
    return {
      id: w.id,
      media_type: w.media_type,
      title: w.title,
      poster_path: w.poster_path,
      rating: w.rating ?? null,
      watchedAt: w.watchedAt || null,
      watchedAtUnknown: w.watchedAtUnknown || false,
    }
  })

  const watchlist = watchlistSnap.docs.map(d => {
    const w = d.data()
    return { id: w.id, media_type: w.media_type, title: w.title, poster_path: w.poster_path, addedAt: w.addedAt || null }
  })

  const episodes = episodesSnap.docs.map(d => {
    const e = d.data()
    return {
      showId: e.showId,
      seasonNum: e.seasonNum,
      episodeNum: e.episodeNum,
      watchedAt: e.watchedAt || null,
      watchedAtUnknown: e.watchedAtUnknown || false,
      rating: e.rating ?? null,
    }
  })

  // Derived stats
  const movies = watched.filter(i => i.media_type === 'movie')
  const shows  = watched.filter(i => i.media_type === 'tv')
  const rated  = watched.filter(i => i.rating != null)

  // Group episodes by show
  const episodesByShow = {}
  episodes.forEach(ep => {
    if (!episodesByShow[ep.showId]) episodesByShow[ep.showId] = []
    episodesByShow[ep.showId].push(ep)
  })

  const stats = {
    totalMoviesWatched: movies.length,
    totalShowsWatched: shows.length,
    totalEpisodesWatched: episodes.length,
    totalRatings: rated.length,
    averageRating: rated.length > 0
      ? Math.round((rated.reduce((s, i) => s + i.rating, 0) / rated.length) * 10) / 10
      : null,
    watchlistSize: watchlist.length,
    exportedAt: new Date().toISOString(),
  }

  return {
    profile,
    stats,
    watched: {
      movies: movies.sort((a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || '')),
      shows:  shows.sort((a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || '')),
    },
    watchlist: {
      movies: watchlist.filter(i => i.media_type === 'movie').sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')),
      shows:  watchlist.filter(i => i.media_type === 'tv').sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')),
    },
    ratings: rated.map(i => ({ id: i.id, media_type: i.media_type, title: i.title, rating: i.rating, watchedAt: i.watchedAt }))
      .sort((a, b) => b.rating - a.rating),
    episodes: {
      byShow: episodesByShow,
      all: episodes.sort((a, b) => (b.watchedAt || '').localeCompare(a.watchedAt || '')),
    },
  }
}