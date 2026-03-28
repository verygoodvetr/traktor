function Skeleton({ width, height, borderRadius = '6px', style = {} }) {
  return (
    <div
      className="skeleton"
      style={{ width, height, borderRadius, ...style }}
    />
  )
}

export function CardSkeleton() {
  return (
    <div className="skeleton-card">
      <Skeleton width="100%" height="225px" />
      <Skeleton width="80%" height="14px" style={{ marginTop: '8px' }} />
      <Skeleton width="40%" height="12px" style={{ marginTop: '4px' }} />
    </div>
  )
}

export function DetailSkeleton() {
  return (
    <div className="skeleton-detail">
      <Skeleton width="180px" height="16px" style={{ marginBottom: '24px' }} />
      <div style={{ display: 'flex', gap: '40px' }}>
        <Skeleton width="220px" height="330px" />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <Skeleton width="60%" height="36px" />
          <Skeleton width="40%" height="16px" />
          <Skeleton width="30%" height="16px" />
          <Skeleton width="100%" height="100px" />
          <Skeleton width="50%" height="14px" />
          <Skeleton width="50%" height="14px" />
        </div>
      </div>
    </div>
  )
}

export default Skeleton