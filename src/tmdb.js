const API_KEY = import.meta.env.VITE_TMDB_KEY
const BASE_URL = 'https://api.themoviedb.org/3'

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
  const response = await fetch(
    `${BASE_URL}/tv/${showId}/season/${seasonNum}/episode/${episodeNum}?api_key=${API_KEY}&append_to_response=credits`
  )
  return response.json()
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

  // Get the 5 most recently watched with highest ratings
  const topWatched = watchedItems
    .filter(i => i.id && i.media_type)
    .sort((a, b) => {
      const ratingScore = (b.rating || 0) - (a.rating || 0)
      const dateScore = new Date(b.watchedAt || 0) - new Date(a.watchedAt || 0)
      return ratingScore * 2 + dateScore
    })
    .slice(0, 5)

  const seen = new Set(watchedItems.map(i => `${i.media_type}-${i.id}`))
  const recommendations = new Map()

  for (const item of topWatched) {
    try {
      const response = await fetch(
        `${BASE_URL}/${item.media_type}/${item.id}/recommendations?api_key=${API_KEY}`
      )
      const data = await response.json()
      for (const rec of (data.results || [])) {
        const recKey = `${rec.media_type || item.media_type}-${rec.id}`
        if (seen.has(recKey)) continue
        if (!rec.poster_path) continue
        if (rec.vote_count < 50) continue
        const existing = recommendations.get(rec.id)
        if (existing) {
          existing.score += (item.rating || 5) + rec.popularity / 100
        } else {
          recommendations.set(rec.id, {
            ...rec,
            media_type: rec.media_type || item.media_type,
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

export const IMAGE_BASE = 'https://image.tmdb.org/t/p/w300'
export const IMAGE_BASE_LARGE = 'https://image.tmdb.org/t/p/w780'
export const IMAGE_BASE_ORIGINAL = 'https://image.tmdb.org/t/p/original'