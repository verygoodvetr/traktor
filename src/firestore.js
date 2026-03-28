import { db } from './firebase'
import { doc, setDoc, deleteDoc, getDoc, collection, getDocs, writeBatch } from 'firebase/firestore'

export async function addToWatched(user, item, watchedAt = 'now') {
  const ref = doc(db, 'users', user.uid, 'watched', `${item.media_type}-${item.id}`)
  await setDoc(ref, {
    id: item.id,
    media_type: item.media_type,
    title: item.title || item.name,
    poster_path: item.poster_path || null,
    rating: null,
    watchedAt: watchedAt === 'now' ? new Date().toISOString() : watchedAt === 'unknown' ? null : watchedAt,
    watchedAtUnknown: watchedAt === 'unknown'
  })
}

export async function removeFromWatched(user, item) {
  const ref = doc(db, 'users', user.uid, 'watched', `${item.media_type}-${item.id}`)
  await deleteDoc(ref)
  if (item.media_type === 'tv') {
    await unmarkAllShowEpisodes(user, item.id)
  }
}

export async function unmarkAllShowEpisodes(user, showId) {
  const snap = await getDocs(collection(db, 'users', user.uid, 'episodes'))
  const batch = writeBatch(db)
  snap.forEach(d => {
    if (d.data().showId === parseInt(showId)) {
      batch.delete(d.ref)
    }
  })
  await batch.commit()
}

export async function addToWatchlist(user, item) {
  const ref = doc(db, 'users', user.uid, 'watchlist', `${item.media_type}-${item.id}`)
  await setDoc(ref, {
    id: item.id,
    media_type: item.media_type,
    title: item.title || item.name,
    poster_path: item.poster_path || null,
    addedAt: new Date().toISOString()
  })
}

export async function removeFromWatchlist(user, item) {
  const ref = doc(db, 'users', user.uid, 'watchlist', `${item.media_type}-${item.id}`)
  await deleteDoc(ref)
}

export async function getUserData(user) {
  const watchedSnap = await getDocs(collection(db, 'users', user.uid, 'watched'))
  const watchlistSnap = await getDocs(collection(db, 'users', user.uid, 'watchlist'))
  const episodesSnap = await getDocs(collection(db, 'users', user.uid, 'episodes'))

  const watched = {}
  watchedSnap.forEach(doc => { watched[doc.id] = doc.data() })

  const watchlist = {}
  watchlistSnap.forEach(doc => { watchlist[doc.id] = doc.data() })

  const episodes = {}
  episodesSnap.forEach(doc => { episodes[doc.id] = doc.data() })

  return { watched, watchlist, episodes }
}

export async function setRating(user, item, rating) {
  const ref = doc(db, 'users', user.uid, 'watched', `${item.media_type}-${item.id}`)
  const snap = await getDoc(ref)
  if (snap.exists()) {
    await setDoc(ref, { ...snap.data(), rating })
  }
}

export async function markEpisodeWatched(user, showId, seasonNum, episodeNum, watchedAt = 'now') {
  const ref = doc(db, 'users', user.uid, 'episodes', `tv-${showId}-s${seasonNum}e${episodeNum}`)
  await setDoc(ref, {
    showId,
    seasonNum,
    episodeNum,
    watchedAt: watchedAt === 'now' ? new Date().toISOString() : watchedAt === 'unknown' ? null : watchedAt,
    watchedAtUnknown: watchedAt === 'unknown'
  })
}

export async function unmarkEpisodeWatched(user, showId, seasonNum, episodeNum) {
  const ref = doc(db, 'users', user.uid, 'episodes', `tv-${showId}-s${seasonNum}e${episodeNum}`)
  await deleteDoc(ref)
  // Also unmark show as fully watched
  const showRef = doc(db, 'users', user.uid, 'watched', `tv-${showId}`)
  const showSnap = await getDoc(showRef)
  if (showSnap.exists()) {
    await deleteDoc(showRef)
  }
}

export async function unmarkSeasonWatched(user, showId, seasonNum, episodes) {
  const batch = writeBatch(db)
  for (const ep of episodes) {
    const ref = doc(db, 'users', user.uid, 'episodes', `tv-${showId}-s${seasonNum}e${ep.episode_number}`)
    batch.delete(ref)
  }
  await batch.commit()
  // Also unmark show as fully watched since a season was unwatched
  const showRef = doc(db, 'users', user.uid, 'watched', `tv-${showId}`)
  const showSnap = await getDoc(showRef)
  if (showSnap.exists()) {
    await deleteDoc(showRef)
  }
}

export async function getShowEpisodes(user, showId) {
  const snap = await getDocs(collection(db, 'users', user.uid, 'episodes'))
  const episodes = {}
  snap.forEach(doc => {
    if (doc.data().showId === showId) {
      episodes[doc.id] = doc.data()
    }
  })
  return episodes
}

export async function markSeasonWatched(user, showId, seasonNum, episodes, watchedAt = 'now') {
  const batch = writeBatch(db)
  for (const ep of episodes) {
    const ref = doc(db, 'users', user.uid, 'episodes', `tv-${showId}-s${seasonNum}e${ep.episode_number}`)
    batch.set(ref, {
      showId,
      seasonNum,
      episodeNum: ep.episode_number,
      watchedAt: watchedAt === 'now' ? new Date().toISOString() : watchedAt === 'unknown' ? null : watchedAt,
      watchedAtUnknown: watchedAt === 'unknown'
    })
  }
  await batch.commit()
}

export async function markAllSeasonsWatched(user, showId, seasons, watchedAt = 'now') {
  for (const { seasonNum, episodes } of seasons) {
    await markSeasonWatched(user, showId, seasonNum, episodes, watchedAt)
  }
}

export async function calculateStreak(user) {
  const snap = await getDocs(collection(db, 'users', user.uid, 'watched'))
  const episodesSnap = await getDocs(collection(db, 'users', user.uid, 'episodes'))

  const watchedDates = new Set()

  snap.docs.forEach(d => {
    const w = d.data()
    if (w.watchedAt) {
      watchedDates.add(new Date(w.watchedAt).toLocaleDateString())
    }
  })

  episodesSnap.docs.forEach(d => {
    const e = d.data()
    if (e.watchedAt) {
      watchedDates.add(new Date(e.watchedAt).toLocaleDateString())
    }
  })

  const today = new Date()
  const todayStr = today.toLocaleDateString()
  const yesterdayStr = new Date(today - 86400000).toLocaleDateString()

  const activatedToday = watchedDates.has(todayStr)
  const startFrom = activatedToday ? today : new Date(today - 86400000)

  let streak = 0
  let longest = 0
  let current = 0
  let checking = new Date(startFrom)

  while (true) {
    const dateStr = checking.toLocaleDateString()
    if (watchedDates.has(dateStr)) {
      streak++
      checking = new Date(checking - 86400000)
    } else {
      break
    }
  }

  // Calculate longest streak
  const allDates = Array.from(watchedDates)
    .map(d => new Date(d))
    .sort((a, b) => a - b)

  current = 0
  for (let i = 0; i < allDates.length; i++) {
    if (i === 0) {
      current = 1
    } else {
      const diff = (allDates[i] - allDates[i-1]) / 86400000
      if (diff === 1) {
        current++
      } else {
        current = 1
      }
    }
    if (current > longest) longest = current
  }

  return { streak, longest, activatedToday }
}

export async function createUserProfile(user, username, acceptedTos) {
  const ref = doc(db, 'users', user.uid)
  await setDoc(ref, {
    uid: user.uid,
    username: username || null,
    displayName: user.displayName,
    photoURL: user.photoURL,
    email: user.email,
    acceptedTos,
    isPrivate: false,
    visibleFields: {
      watchHistory: true,
      ratings: true,
      watchlist: true,
      episodeProgress: true
    },
    createdAt: user.metadata?.creationTime 
      ? new Date(user.metadata.creationTime).toISOString() 
      : new Date().toISOString()
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

export async function isUsernameTaken(username) {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.some(d => d.data().username?.toLowerCase() === username.toLowerCase())
}

export async function getUserByUsername(username) {
  const snap = await getDocs(collection(db, 'users'))
  const found = snap.docs.find(d => d.data().username?.toLowerCase() === username.toLowerCase())
  return found ? found.data() : null
}

export async function exportUserData(user) {
  const exportData = {
    exportedAt: new Date().toISOString(),
    profile: {},
    watched: [],
    watchlist: [],
    episodes: []
  }

  const profileSnap = await getDoc(doc(db, 'users', user.uid))
  if (profileSnap.exists()) {
    const p = profileSnap.data()
    exportData.profile = {
      username: p.username || null,
      displayName: p.displayName || null,
      email: p.email || null,
      createdAt: p.createdAt || null,
      isPrivate: p.isPrivate || false,
      acceptedTos: p.acceptedTos || null,
      linkedProviders: user.providerData?.map(pr => pr.providerId) || []
    }
  }

  const watchedSnap = await getDocs(collection(db, 'users', user.uid, 'watched'))
  exportData.watched = watchedSnap.docs.map(d => {
    const w = d.data()
    return {
      id: w.id,
      media_type: w.media_type,
      title: w.title,
      poster_path: w.poster_path,
      rating: w.rating ?? null,
      watchedAt: w.watchedAt || null,
      watchedAtUnknown: w.watchedAtUnknown || false
    }
  })

  const watchlistSnap = await getDocs(collection(db, 'users', user.uid, 'watchlist'))
  exportData.watchlist = watchlistSnap.docs.map(d => {
    const w = d.data()
    return {
      id: w.id,
      media_type: w.media_type,
      title: w.title,
      poster_path: w.poster_path,
      addedAt: w.addedAt || null
    }
  })

  const episodesSnap = await getDocs(collection(db, 'users', user.uid, 'episodes'))
  exportData.episodes = episodesSnap.docs.map(d => {
    const e = d.data()
    return {
      showId: e.showId,
      seasonNum: e.seasonNum,
      episodeNum: e.episodeNum,
      watchedAt: e.watchedAt || null,
      watchedAtUnknown: e.watchedAtUnknown || false,
      rating: e.rating ?? null
    }
  })

  return exportData
}