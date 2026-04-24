/**
 * Unified API Module - Auto-routes to TVDB for TV shows, TMDB for movies
 *
 * Strategy:
 * - TV Shows: TVDB (better episode metadata, more info)
 * - Movies: TMDB (better movie data)
 * - Fallback: If TVDB fails, try TMDB for shows
 */

import * as tvdb from './tvdb'
import * as tmdb from './tmdb'

// Re-export image bases (prefer TVDB images for shows)
export const IMAGE_BASE = tvdb.IMAGE_BASE
export const IMAGE_BASE_LARGE = tvdb.IMAGE_BASE_LARGE
export const IMAGE_BASE_ORIGINAL = tvdb.IMAGE_BASE_ORIGINAL

// ── Unified Search ───────────────────────────────────────────
export async function searchMedia(query, page = 1) {
  // Search both sources in parallel
  const [tvResults, movieResults] = await Promise.all([
    tvdb.searchShows(query, page).catch(() => ({ results: [] })),
    tmdb.searchMedia(query, page).catch(() => ({ results: [] })),
  ])

  // Combine and dedupe (prefer TVDB results for shows)
  const combined = [
    ...tvResults.results.map(item => ({ ...item, _source: 'tvdb' })),
    ...movieResults.results
      .filter(m => !tvResults.results.some(t => t.tmdbId && t.tmdbId === m.id))
      .map(item => ({ ...item, _source: 'tmdb' })),
  ]

  return {
    results: combined,
    totalPages: Math.max(tvResults.totalPages, movieResults.totalPages)
  }
}

// ── Unified Details ──────────────────────────────────────────
export async function getDetails(type, id) {
  if (type === 'movie') {
    // Movies always use TMDB
    return tmdb.getDetails(type, id)
  }

  // TV shows try TVDB first, fallback to TMDB
  const tvdbData = await tvdb.getTVDetails(id)
  if (tvdbData) {
    // Try to enhance with TMDB data (ratings, etc)
    if (tvdbData.tmdbId) {
      try {
        const tmdbData = await tmdb.getDetails('tv', tvdbData.tmdbId)
        if (tmdbData) {
          return {
            ...tvdbData,
            // Prefer TVDB data but fill in missing from TMDB
            vote_average: tmdbData.vote_average || tvdbData.vote_average,
            vote_count: tmdbData.vote_count || tvdbData.vote_count,
            popularity: tmdbData.popularity || tvdbData.popularity,
            backdrop_path: tvdbData.backdrop_path || tmdbData.backdrop_path,
          }
        }
      } catch (e) {
        // TMDB lookup failed, use TVDB data alone
      }
    }
    return tvdbData
  }

  // Fallback to TMDB if TVDB fails
  console.warn(`TVDB failed for show ${id}, falling back to TMDB`)
  return tmdb.getDetails('tv', id)
}

// ── Season Details ───────────────────────────────────────────
export async function getSeasonDetails(showId, seasonNum) {
  // Try TVDB first for season episodes
  const tvdbSeason = await tvdb.getSeasonDetails(showId, seasonNum)
  if (tvdbSeason?.episodes?.length) {
    return tvdbSeason
  }

  // Fallback to TMDB
  return tmdb.getSeasonDetails(showId, seasonNum)
}

// ── Episode Details ──────────────────────────────────────────
export async function getEpisodeDetails(showId, seasonNum, episodeNum) {
  // Get basic from TMDB, enrich with TVDB
  const tmdbEp = await tmdb.getEpisodeDetails(showId, seasonNum, episodeNum)

  // Enrich with TVDB data (TVDB is more authoritative for episodes)
  const enriched = await tvdb.enrichEpisodeData(showId, seasonNum, episodeNum, tmdbEp)

  return enriched
}

// ── Continue Watching helper ────────────────────────────────
// Get all aired episodes for a show - uses TVDB primarily
export async function getAllShowEpisodes(showId) {
  const tvdbEps = await tvdb.getAllShowEpisodes(showId)
  if (tvdbEps.length) return tvdbEps

  // Fallback: build from TMDB
  const details = await tmdb.getDetails('tv', showId)
  if (!details?.seasons) return []

  const allEps = []
  for (const season of details.seasons.filter(s => s.season_number > 0)) {
    const seasonData = await tmdb.getSeasonDetails(showId, season.season_number)
    if (seasonData?.episodes) {
      for (const ep of seasonData.episodes) {
        if (ep.air_date && new Date(ep.air_date) > new Date()) continue
        allEps.push({ ...ep, seasonNum: season.season_number })
      }
    }
  }
  return allEps
}

// ── Upcoming episodes helper ────────────────────────────────
export async function getUpcomingEpisode(showId) {
  // TVDB has next episode info
  const details = await tvdb.getTVDetails(showId)
  return details?.next_episode_to_air || null
}

// ── Trending / Popular ──────────────────────────────────────
export async function getTrending() {
  const [tvResults, movieResults] = await Promise.all([
    tvdb.getTrendingShows().catch(() => []),
    tmdb.getTrending().catch(() => []),
  ])

  return [
    ...tvResults.map(item => ({ ...item, _source: 'tvdb' })),
    ...movieResults.map(item => ({ ...item, _source: 'tmdb' })),
  ]
}

export async function getPopularMovies() {
  return tmdb.getPopularMovies()
}

export async function getPopularShows() {
  return tvdb.getPopularShows()
}

export async function getTopRatedShows() {
  return tvdb.getTopRatedShows()
}

export async function getUpcomingMovies() {
  return tmdb.getUpcomingMovies()
}

// ── Person Details ──────────────────────────────────────────
export async function getPersonDetails(personId) {
  // Try TVDB first
  const tvdbPerson = await tvdb.getPersonDetails(personId)
  if (tvdbPerson) return tvdbPerson

  // Fallback to TMDB
  return tmdb.getPersonDetails(personId)
}

// ── Other TMDB-only functions ────────────────────────────────
export function getAgeRating(item, type) {
  if (type === 'movie') {
    return tmdb.getAgeRating(item, type)
  }
  return tvdb.getAgeRating(item, type)
}

export function getMediaMeta(item) {
  return tvdb.getMediaMeta(item) || tmdb.getMediaMeta(item)
}

export function getStartWatchingMeta(item) {
  return tvdb.getStartWatchingMeta(item) || tmdb.getStartWatchingMeta(item)
}

export function getReleaseStatus(item) {
  return tmdb.getReleaseStatus(item)
}

export async function getVideos(type, id) {
  if (type === 'movie') {
    return tmdb.getVideos(type, id)
  }
  // TVDB doesn't have videos
  return []
}

export async function getSimilar(type, id) {
  if (type === 'movie') {
    return tmdb.getSimilar(type, id)
  }
  // Try TVDB first
  const tvdbSimilar = await tvdb.getSimilar('tv', id)
  if (tvdbSimilar?.length) return tvdbSimilar

  // Fallback to TMDB
  return tmdb.getSimilar('tv', id)
}

export async function getWatchProviders(type, id) {
  return tmdb.getWatchProviders(type, id)
}

export async function getPersonalizedRecommendations(watchedItems) {
  const tvRecs = await tvdb.getPersonalizedRecommendations(
    watchedItems.filter(i => i.media_type === 'tv')
  )
  const movieRecs = await tmdb.getPersonalizedRecommendations(
    watchedItems.filter(i => i.media_type === 'movie')
  )

  return [...tvRecs, ...movieRecs].slice(0, 20)
}

// ── ID Lookup helpers ────────────────────────────────────────
export async function findTVDBByTMDB(tmdbId) {
  return tvdb.findTVDBByTMDB(tmdbId)
}

export async function findTVDBByIMDB(imdbId) {
  return tvdb.findTVDBByIMDB(imdbId)
}

export async function getRemoteIds(type, id) {
  if (type === 'movie') {
    // Get from TMDB
    const details = await tmdb.getDetails('movie', id)
    return { tmdbId: id, imdbId: details?.imdb_id }
  }
  // TV shows use TVDB
  return tvdb.getRemoteIds('series', id)
}

// ── Image helpers ────────────────────────────────────────────
export function getPosterUrl(path, type = 'movie') {
  if (!path) return null
  // TVDB paths are full paths, TMDB need prefix
  if (path.startsWith('http') || path.includes('/posters/') || path.includes('/banners/')) {
    return path
  }
  if (type === 'tv') {
    return tvdb.getPosterUrl(path)
  }
  return tmdb.IMAGE_BASE + path
}

export function getBackdropUrl(path, type = 'movie') {
  if (!path) return null
  if (path.startsWith('http') || path.includes('/backgrounds/') || path.includes('/banners/')) {
    return path
  }
  if (type === 'tv') {
    return tvdb.getBackdropUrl(path)
  }
  return tmdb.IMAGE_BASE_ORIGINAL + path
}

export function getEpisodeImageUrl(path) {
  return tvdb.getEpisodeImageUrl(path)
}

// ── Enrich episode data ─────────────────────────────────────
export async function enrichEpisodeData(showId, seasonNum, episodeNum, tmdbEp) {
  return tvdb.enrichEpisodeData(showId, seasonNum, episodeNum, tmdbEp)
}
