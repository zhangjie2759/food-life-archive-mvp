export type MascotPose =
  | 'brand'
  | 'camera'
  | 'crop'
  | 'research'
  | 'waiting'
  | 'left'
  | 'right'
  | 'serve'
  | 'name'
  | 'crown'
  | 'verdict'
  | 'report'

const poses: Record<MascotPose, { column: number; row: number }> = {
  brand: { column: 0, row: 0 },
  camera: { column: 1, row: 0 },
  crop: { column: 2, row: 0 },
  research: { column: 3, row: 0 },
  waiting: { column: 0, row: 1 },
  left: { column: 1, row: 1 },
  right: { column: 2, row: 1 },
  serve: { column: 3, row: 1 },
  name: { column: 0, row: 2 },
  crown: { column: 1, row: 2 },
  verdict: { column: 2, row: 2 },
  report: { column: 3, row: 2 },
}

export function Mascot({ pose, className = '' }: { pose: MascotPose; className?: string }) {
  const { column, row } = poses[pose]
  return (
    <span
      className={`chef-mascot ${className}`}
      style={{
        backgroundImage: `url(${import.meta.env.BASE_URL}brand/chef-miniature-tribe-atlas-v2.png)`,
        backgroundPosition: `${column * 100 / 3}% ${row * 100 / 2}%`,
      }}
      aria-hidden="true"
    />
  )
}
