const API_KEY = import.meta.env.VITE_TMDB_KEY
const BASE_URL = 'https://api.themoviedb.org/3'
const OMDB_KEY = import.meta.env.VITE_OMDB_KEY // optional fallback

export const IMAGE_BASE = 'https://image.tmdb.org/t/p/w300'
export const IMAGE_BASE_LARGE = 'https://image.tmdb.org/t/p/w780'
export const IMAGE_BASE_ORIGINAL = 'https://image.tmdb.org/t/p/original'

// ── TVDB helper (uses TMDB's external IDs + TVDB's open metadata) ──────────
// We use TMDB as the primary source and OMDB as a fallback for episode names/info
async function getOMDBData(imdbId) {
  if (!OMDB_KEY || !imdbId) return null
  try {
    const res = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_KEY}`)
    return await res.json()
  } catch { return null }
}

async function getIMDBId(type, id) {
  try {
    const res = await fetch(`${BASE_URL}/${type}/${id}/external_ids?api_key=${API_KEY}`)
    const data = await res.json()
    return data.imdb_id || null
  } catch { return null }
}

// Enrich episode data with OMDB fallback for missing names/overviews
export async function enrichEpisodeData(showId, seasonNum, episodeNum, tmdbEp) {
  // If TMDB already has good data, return it
  const hasGoodName = tmdbEp.name && tmdbEp.name !== `Episode ${episodeNum}`
  const hasOverview = tmdbEp.overview && tmdbEp.overview.length > 10
  if (hasGoodName && hasOverview) return tmdbEp

  // Try OMDB fallback
  try {
    const imdbId = await getIMDBId('tv', showId)
    if (!imdbId || !OMDB_KEY) return tmdbEp
    const res = await fetch(
      `https://www.omdbapi.com/?i=${imdbId}&Season=${seasonNum}&Episode=${episodeNum}&apikey=${OMDB_KEY}`
    )
    const omdb = await res.json()
    if (omdb.Response === 'True') {
      return {
        ...tmdbEp,
        name: hasGoodName ? tmdbEp.name : (omdb.Title || tmdbEp.name),
        overview: hasOverview ? tmdbEp.overview : (omdb.Plot !== 'N/A' ? omdb.Plot : tmdbEp.overview),
        still_path: tmdbEp.still_path, // always prefer TMDB images
      }
    }
  } catch {}
  return tmdbEp
}

export async function searchMedia(query, page = 1) {
  const response = await fetch(
    `${BASE_URL}/search/multi?api_key=${API_KEY}&query=${query}&page=${page}`
  )
  const data = await response.json()
  return {
    results: data.results,
    totalPages: data.total_pages
  }
}

export async function getDetails(type, id) {
  const response = await fetch(
    `${BASE_URL}/${type}/${id}?api_key=${API_KEY}&append_to_response=credits,release_dates,content_ratings`
  )
  return response.json()
}

export async function getTrending() {
  const response = await fetch(
    `${BASE_URL}/trending/all/week?api_key=${API_KEY}`
  )
  const data = await response.json()
  return data.results
}

export async function getPopularMovies() {
  const response = await fetch(
    `${BASE_URL}/movie/popular?api_key=${API_KEY}`
  )
  const data = await response.json()
  return data.results
}

export async function getPopularShows() {
  const response = await fetch(
    `${BASE_URL}/tv/popular?api_key=${API_KEY}`
  )
  const data = await response.json()
  return data.results
}

export async function getUpcomingMovies() {
  const response = await fetch(
    `${BASE_URL}/movie/upcoming?api_key=${API_KEY}`
  )
  const data = await response.json()
  return data.results
}

export async function getSeasonDetails(showId, seasonNum) {
  const response = await fetch(
    `${BASE_URL}/tv/${showId}/season/${seasonNum}?api_key=${API_KEY}`
  )
  return response.json()
}

export async function getPersonDetails(personId) {
  const response = await fetch(
    `${BASE_URL}/person/${personId}?api_key=${API_KEY}&append_to_response=combined_credits`
  )
  return response.json()
}

export async function getEpisodeDetails(showId, seasonNum, episodeNum) {
  const tmdbRes = await fetch(
    `${BASE_URL}/tv/${showId}/season/${seasonNum}/episode/${episodeNum}?api_key=${API_KEY}&append_to_response=credits`
  )
  const tmdbEp = await tmdbRes.json()
  // Try to enrich with OMDB if data is sparse
  return enrichEpisodeData(showId, seasonNum, episodeNum, tmdbEp)
}

export function getAgeRating(item, type) {
  if (type === 'movie') {
    const results = item.release_dates?.results || []
    const us = results.find(r => r.iso_3166_1 === 'US')
    return us?.release_dates?.[0]?.certification || null
  } else {
    const results = item.content_ratings?.results || []
    const us = results.find(r => r.iso_3166_1 === 'US')
    return us?.rating || null
  }
}

export function getMediaMeta(item) {
  const type = item.media_type || (item.first_air_date ? 'tv' : 'movie')
  if (type === 'movie') {
    if (item.runtime) return `${item.runtime} min`
    return null
  } else {
    const seasons = item.number_of_seasons
    const episodes = item.number_of_episodes
    if (!seasons) return null
    if (seasons === 1) return episodes ? `${episodes} episodes` : '1 season'
    return `${seasons} seasons`
  }
}

// Returns display meta for Start Watching cards
export function getStartWatchingMeta(item) {
  const type = item.media_type || (item.first_air_date ? 'tv' : 'movie')
  if (type === 'movie') {
    if (item.runtime) return `${item.runtime} min`
    return null
  } else {
    const seasons = item.number_of_seasons
    const episodes = item.number_of_episodes
    if (!seasons && !episodes) return null
    if (seasons === 1) return episodes ? `${episodes} eps` : '1 season'
    return `${seasons} seasons`
  }
}

export function getReleaseStatus(item) {
  const type = item.media_type || (item.first_air_date ? 'tv' : 'movie')
  const dateStr = type === 'movie' ? item.release_date : item.first_air_date
  if (!dateStr) return null
  const release = new Date(dateStr)
  const now = new Date()
  const daysSince = (now - release) / (1000 * 60 * 60 * 24)
  if (type === 'movie') {
    if (daysSince < 0) return null
    if (daysSince <= 30) return 'JUST RELEASED'
  } else {
    if (daysSince >= 0 && daysSince <= 30) return 'NEW'
  }
  return null
}

export async function getVideos(type, id) {
  const response = await fetch(
    `${BASE_URL}/${type}/${id}/videos?api_key=${API_KEY}`
  )
  const data = await response.json()
  return data.results?.filter(v => v.site === 'YouTube') || []
}

export async function getSimilar(type, id) {
  const response = await fetch(
    `${BASE_URL}/${type}/${id}/similar?api_key=${API_KEY}`
  )
  const data = await response.json()
  return data.results?.filter(r => r.poster_path) || []
}

export async function getWatchProviders(type, id) {
  const response = await fetch(
    `${BASE_URL}/${type}/${id}/watch/providers?api_key=${API_KEY}`
  )
  const data = await response.json()
  return data.results?.SK || data.results?.US || null
}

export async function getPersonalizedRecommendations(watchedItems) {
  if (!watchedItems || watchedItems.length === 0) return []

  const topWatched = watchedItems
    .filter(i => i.id && i.media_type)
    .sort((a, b) => {
      const ratingScore = (b.rating || 0) - (a.rating || 0)
      const dateScore = new Date(b.watchedAt || 0) - new Date(a.watchedAt || 0)
      return ratingScore * 2 + dateScore
    })
    .slice(0, 8)

  const seen = new Set(watchedItems.map(i => `${i.media_type}-${i.id}`))
  const recommendations = new Map()

  for (const item of topWatched) {
    try {
      const response = await fetch(
        `${BASE_URL}/${item.media_type}/${item.id}/recommendations?api_key=${API_KEY}`
      )
      const data = await response.json()
      for (const rec of (data.results || [])) {
        const recType = rec.media_type || item.media_type
        const recKey = `${recType}-${rec.id}`
        if (seen.has(recKey)) continue
        if (!rec.poster_path) continue
        if (rec.vote_count < 50) continue
        const existing = recommendations.get(recKey)
        const reason = `Because you watched ${item.title || item.name}`
        if (existing) {
          existing.score += (item.rating || 5) + rec.popularity / 100
        } else {
          recommendations.set(recKey, {
            ...rec,
            media_type: recType,
            reason,
            score: (item.rating || 5) + rec.popularity / 100
          })
        }
      }
    } catch (e) {}
  }

  return Array.from(recommendations.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
}