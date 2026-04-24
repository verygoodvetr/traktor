/**
 * TVDB API Integration - Primary data source for TV Shows in Traktor app
 * API v4 - https://api.thetvdb.com/api/v4
 *
 * Use TVDB as primary source for TV shows (better episode metadata)
 * Use TMDB for movies (better movie data)
 */

const TVDB_KEY = import.meta.env.VITE_TVDB_KEY
const BASE_URL = 'https://api.thetvdb.com/v4'

// TVDB Image base
export const IMAGE_BASE = 'https://artworks.thetvdb.com/banners/'
export const IMAGE_BASE_LARGE = 'https://artworks.thetvdb.com/banners/'
export const IMAGE_BASE_ORIGINAL = 'https://artworks.thetvdb.com/banners/'

// ── Authentication ────────────────────────────────────────────
let _authToken = null
let _tokenExpiry = 0

async function getAuthToken() {
  if (_authToken && Date.now() < _tokenExpiry) return _authToken
  if (!TVDB_KEY) {
    console.warn('TVDB API key not configured')
    return null
  }

  try {
    const res = await fetch(`${BASE_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apikey: TVDB_KEY })
    })
    const data = await res.json()
    if (data.token) {
      _authToken = data.token
      _tokenExpiry = Date.now() + 23 * 60 * 60 * 1000
      return _authToken
    }
    throw new Error('No TVDB token returned')
  } catch (e) {
    console.error('TVDB auth failed:', e)
    return null
  }
}

async function tvdbFetch(endpoint, options = {}) {
  const token = await getAuthToken()
  if (!token) return null

  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers || {})
      }
    })

    if (res.status === 401) {
      _authToken = null
      _tokenExpiry = 0
      const newToken = await getAuthToken()
      if (!newToken) return null

      const retryRes = await fetch(`${BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${newToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(options.headers || {})
        }
      })
      return retryRes.ok ? retryRes.json() : null
    }

    return res.ok ? res.json() : null
  } catch (e) {
    console.error('TVDB fetch error:', e)
    return null
  }
}

// ── Image helpers ─────────────────────────────────────────────
export function getImageUrl(path) {
  if (!path) return null
  return IMAGE_BASE + path
}

export function getPosterUrl(path) {
  if (!path) return null
  if (path.includes('/posters/')) return IMAGE_BASE + path
  return IMAGE_BASE + 'posters/' + path
}

export function getBackdropUrl(path) {
  if (!path) return null
  if (path.includes('/backgrounds/')) return IMAGE_BASE + path
  return IMAGE_BASE + 'backgrounds/' + path
}

export function getSeasonUrl(path) {
  if (!path) return null
  if (path.includes('/seasons/')) return IMAGE_BASE + path
  return IMAGE_BASE + 'seasons/' + path
}

export function getEpisodeImageUrl(path) {
  if (!path) return null
  if (path.includes('/episodes/')) return IMAGE_BASE + path
  return IMAGE_BASE + 'episodes/' + path
}

// ── TV Show Search ────────────────────────────────────────────
export async function searchShows(query, page = 1) {
  const data = await tvdbFetch(`/search?q=${encodeURIComponent(query)}&type=series&page=${page}`)
  if (!data) return { results: [], totalPages: 0 }

  return {
    results: (data.data || []).map(normalizeSearchResult),
    totalPages: data.pages || 1
  }
}

function normalizeSearchResult(item) {
  return {
    id: item.id,
    tvdbId: item.id,
    tmdbId: item.remoteId?.tmdb || item.tmdbId,
    name: item.name,
    title: item.name, // for compatibility
    poster: item.image,
    poster_path: item.image,
    overview: item.overview,
    first_air_date: item.firstAired,
    year: item.year,
    type: 'series',
    media_type: 'tv',
  }
}

// ── Get TV Show Details ───────────────────────────────────────
export async function getTVDetails(showId) {
  // Get extended info including all seasons
  const data = await tvdbFetch(`/series/${showId}/extended?meta= translations`)
  if (!data) return null

  const item = data.data
  return normalizeTVShow(item)
}

function normalizeTVShow(item) {
  // Extract seasons info
  const standardSeasons = item.seasons?.filter(s => s.type === 1) || []

  return {
    id: item.id,
    tvdbId: item.id,
    media_type: 'tv',
    name: item.name,
    title: item.name,
    original_name: item.name,
    overview: item.overview,
    poster_path: item.poster,
    backdrop_path: item.backdrop,
    first_air_date: item.firstAired,
    last_air_date: item.lastAired,
    status: item.status,
    // TVDB specific
    tmdbId: item.remoteId?.find(r => r.type === 'tmdb')?.id || null,
    imdbId: item.remoteId?.find(r => r.type === 'imdb')?.id || null,
    // Season info
    number_of_seasons: standardSeasons.length,
    number_of_episodes: standardSeasons.reduce((acc, s) => acc + (s.episodeCount || 0), 0),
    seasons: standardSeasons.map(s => ({
      id: s.id,
      season_number: s.number,
      episode_count: s.episodeCount,
      name: s.name || `Season ${s.number}`,
      image: s.image,
    })),
    // Next episode to air
    next_episode_to_air: item.nextAiredEpisode ? {
      air_date: item.nextAiredEpisode.aired,
      season_number: item.nextAiredEpisode.seasonNumber,
      episode_number: item.nextAiredEpisode.number,
      name: item.nextAiredEpisode.name,
    } : null,
    // Compatibility
    vote_average: null,
    vote_count: null,
    popularity: null,
    genres: item.genres,
    networks: item.networks,
  }
}

// ── Get Season Episodes ──────────────────────────────────────
export async function getSeasonEpisodes(showId, seasonNum) {
  // Try first page of season episodes
  const data = await tvdbFetch(`/series/${showId}/episodes/${seasonNum}?page=1`)
  if (!data) return []

  return (data.data || []).map(normalizeEpisode)
}

export async function getAllShowEpisodes(showId) {
  // Get show info to know season count
  const showData = await tvdbFetch(`/series/${showId}/extended`)
  if (!showData) return []

  const standardSeasons = showData.data?.seasons?.filter(s => s.type === 1) || []
  const allEps = []

  for (const season of standardSeasons) {
    try {
      const seasonEps = await getSeasonEpisodes(showId, season.number)
      allEps.push(...seasonEps)
    } catch (e) {
      console.error(`Failed to fetch season ${season.number}:`, e)
    }
  }

  return allEps
}

export async function getEpisodeDetails(showId, seasonNum, episodeNum) {
  const episodes = await getSeasonEpisodes(showId, seasonNum)
  return episodes.find(ep => ep.episodeNumber === episodeNum) || null
}

function normalizeEpisode(ep) {
  return {
    id: ep.id,
    seriesId: ep.seriesId,
    seasonNumber: ep.seasonNumber,
    seasonNum: ep.seasonNumber,
    episodeNumber: ep.number,
    episode_number: ep.number,
    name: ep.name,
    title: ep.name,
    overview: ep.overview,
    still_path: ep.image,
    still_path_large: ep.image,
    air_date: ep.aired,
    runtime: ep.runtime,
    rating: ep.guestStars ? null : ep.score,
    // Full season info for fetching
    _showId: ep.seriesId,
  }
}

// ── Trending / Popular Shows ─────────────────────────────────
export async function getPopularShows() {
  const data = await tvdbFetch(`/series/popular?page=1`)
  if (!data) return []

  return (data.data || []).map(item => ({
    id: item.id,
    tvdbId: item.id,
    tmdbId: item.remoteId?.find(r => r.type === 'tmdb')?.id,
    media_type: 'tv',
    name: item.name,
    title: item.name,
    overview: item.overview,
    poster_path: item.poster,
    backdrop_path: item.backdrop,
    first_air_date: item.firstAired,
    number_of_seasons: item.seasons?.filter(s => s.type === 1).length || 0,
    vote_average: null,
    popularity: item.score,
  }))
}

export async function getTrendingShows() {
  // TVDB doesn't have a trending endpoint, use popular as fallback
  return getPopularShows()
}

// TVDB doesn't have top_rated, use popular as fallback
export async function getTopRatedShows() {
  return getPopularShows()
}

// ── Person Details ───────────────────────────────────────────
export async function getPersonDetails(personId) {
  const data = await tvdbFetch(`/people/${personId}`)
  if (!data) return null

  const person = data.data
  return {
    id: person.id,
    name: person.name,
    biography: person.biography,
    birthday: person.birthday,
    death: person.death,
    place_of_birth: person.placeOfBirth,
    profile_path: person.image,
    known_for_department: person.type,
    // TVDB specific
    appearances: person.appearanceCount,
  }
}

// ── TV Show Translations ─────────────────────────────────────
export async function getTranslations(showId, lang = 'eng') {
  const data = await tvdbFetch(`/series/${showId}/translations/${lang}`)
  return data?.data || null
}

// ── TV Show Aliases (for external ID lookup) ────────────────
export async function getAliases(showId) {
  const data = await tvdbFetch(`/series/${showId}/aliases`)
  return data?.data || []
}

export async function getRemoteIds(showId) {
  const data = await tvdbFetch(`/series/${showId}/remoteIds`)
  return data?.data || []
}

// ── Find TVDB by external ID ─────────────────────────────────
export async function findTVDBByTMDB(tmdbId) {
  // Search TVDB for TMDB match via remote IDs
  const data = await tvdbFetch(`/search?type=series&tmdb=${tmdbId}`)
  if (!data?.data?.length) return null
  return data.data[0].id
}

export async function findTVDBByIMDB(imdbId) {
  const data = await tvdbFetch(`/search?type=series&imdb=${imdbId}`)
  if (!data?.data?.length) return null
  return data.data[0].id
}

// ── Meta Helpers ─────────────────────────────────────────────
export function getMediaMeta(item) {
  if (!item) return null
  const type = item.media_type || (item.first_air_date ? 'tv' : 'movie')
  if (type === 'movie') {
    if (item.runtime) return `${item.runtime} min`
    return null
  }
  const seasons = item.number_of_seasons
  const episodes = item.number_of_episodes
  if (!seasons) return null
  if (seasons === 1) return episodes ? `${episodes} episodes` : '1 season'
  return `${seasons} seasons`
}

export function getStartWatchingMeta(item) {
  return getMediaMeta(item)
}

export function getReleaseStatus(item) {
  return null
}

export function getAgeRating(item, type) {
  return null // TVDB doesn't have age ratings
}

// ── Compatibility functions (for existing code) ────────────
export async function getDetails(type, id) {
  if (type === 'movie') {
    // Movies should use TMDB - return null to signal fallback needed
    return null
  }
  return getTVDetails(id)
}

export async function getSeasonDetails(showId, seasonNum) {
  const episodes = await getSeasonEpisodes(showId, seasonNum)
  if (!episodes.length) return null

  return {
    season_number: seasonNum,
    episodes: episodes,
    name: `Season ${seasonNum}`,
  }
}

export async function getSimilar(type, id) {
  if (type === 'movie') return []

  const data = await tvdbFetch(`/series/${id}/similar`)
  if (!data) return []

  return (data.data || []).map(item => ({
    id: item.id,
    tvdbId: item.id,
    media_type: 'tv',
    title: item.name,
    name: item.name,
    poster_path: item.poster,
    vote_average: null,
  }))
}

export async function getVideos(type, id) {
  return [] // TVDB doesn't have video info
}

export async function getWatchProviders(type, id) {
  return null // TVDB doesn't have streaming info
}

// ── Recommendations ────────────────────────────────────────────
export async function getPersonalizedRecommendations(watchedItems) {
  const popular = await getPopularShows()
  if (!watchedItems?.length) return popular.slice(0, 20)

  const seen = new Set(watchedItems.map(i => `${i.media_type}-${i.id}`))
  return popular.filter(r => !seen.has(`tv-${r.id}`)).slice(0, 20)
}

// ── Episode enrichment (TVDB is authoritative) ────────────────
export async function enrichEpisodeData(showId, seasonNum, episodeNum, tmdbEp) {
  const tvdbEp = await getEpisodeDetails(showId, seasonNum, episodeNum)
  if (!tvdbEp) return tmdbEp

  return {
    ...tmdbEp,
    ...tvdbEp,
    name: tvdbEp.name || tmdbEp.name,
    overview: tvdbEp.overview || tmdbEp.overview,
    still_path: tvdbEp.still_path || tmdbEp.still_path,
  }
}