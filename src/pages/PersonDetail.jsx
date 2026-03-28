import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getPersonDetails, IMAGE_BASE, IMAGE_BASE_LARGE } from '../tmdb'
import PageWrapper from '../components/PageWrapper'
import { DetailSkeleton } from '../components/Skeleton'

function PersonDetail() {
  const { personId } = useParams()
  const navigate = useNavigate()
  const [person, setPerson] = useState(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    getPersonDetails(personId).then(setPerson)
    window.scrollTo(0, 0)
  }, [personId])

  if (!person) return <PageWrapper><DetailSkeleton /></PageWrapper>

  const credits = person.combined_credits?.cast
    ?.filter(c => c.poster_path && (c.media_type === 'movie' || c.media_type === 'tv'))
    .sort((a, b) => (b.vote_count || 0) - (a.vote_count || 0)) || []

  const displayed = showAll ? credits : credits.slice(0, 12)

  const age = person.birthday ? Math.floor(
    (new Date(person.deathday || Date.now()) - new Date(person.birthday)) / (365.25 * 24 * 60 * 60 * 1000)
  ) : null

  return (
    <PageWrapper>
      <div style={{ padding: '32px' }}>
        <div className="detail-page-wrapper">
          <div className="detail-page">
            <button className="back-btn" onClick={() => navigate(-1)}>← Back</button>

            <div className="person-top">
              {person.profile_path ? (
                <img
                  className="person-photo"
                  src={IMAGE_BASE_LARGE + person.profile_path}
                  alt={person.name}
                />
              ) : (
                <div className="person-no-photo">?</div>
              )}
              <div className="detail-info">
                <h1>{person.name}</h1>

                <div className="detail-crew-grid">
                  {person.known_for_department && (
                    <div className="crew-item">
                      <span className="crew-label">Known for</span>
                      <span className="crew-value">{person.known_for_department}</span>
                    </div>
                  )}
                  {person.birthday && (
                    <div className="crew-item">
                      <span className="crew-label">Born</span>
                      <span className="crew-value">
                        {new Date(person.birthday).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                        {age && ` (age ${age})`}
                      </span>
                    </div>
                  )}
                  {person.deathday && (
                    <div className="crew-item">
                      <span className="crew-label">Died</span>
                      <span className="crew-value">
                        {new Date(person.deathday).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </span>
                    </div>
                  )}
                  {person.place_of_birth && (
                    <div className="crew-item">
                      <span className="crew-label">Place of birth</span>
                      <span className="crew-value">{person.place_of_birth}</span>
                    </div>
                  )}
                  {credits.length > 0 && (
                    <div className="crew-item">
                      <span className="crew-label">Credits</span>
                      <span className="crew-value">{credits.length} titles</span>
                    </div>
                  )}
                </div>

                {person.biography && (
                  <p className="detail-overview">{person.biography}</p>
                )}
              </div>
            </div>

            <div className="cast-section">
              <h2>Known for</h2>
              <div className="results-grid">
                {displayed.map(credit => (
                  <div
                    key={`${credit.media_type}-${credit.id}`}
                    className="media-card"
                    onClick={() => navigate(`/movie/${credit.media_type}/${credit.id}`)}
                  >
                    <div className="media-card-img-wrap">
                      <img src={IMAGE_BASE + credit.poster_path} alt={credit.title || credit.name} />
                      <span className="media-type-badge">
                        {credit.media_type === 'movie' ? 'Movie' : 'TV'}
                      </span>
                    </div>
                    <div className="media-card-info">
                      <p className="media-title">{credit.title || credit.name}</p>
                      <p className="media-year">
                        {(credit.release_date || credit.first_air_date || '').slice(0, 4)}
                      </p>
                      {credit.character && (
                        <p className="cast-character">{credit.character}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {credits.length > 12 && (
                <div className="load-more">
                  <button onClick={() => setShowAll(p => !p)}>
                    {showAll ? 'Show less' : `Show all ${credits.length} credits`}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageWrapper>
  )
}

export default PersonDetail