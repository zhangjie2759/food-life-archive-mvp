import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Archive,
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  Clock3,
  Crown,
  Download,
  Heart,
  Home,
  LoaderCircle,
  MapPin,
  Medal,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  UserRound,
  Utensils,
  WifiOff,
  X,
} from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { CameraCapture } from './components/CameraCapture'
import { db, completeOnboarding, deleteEntry, friendlyStorageError, resetAllData } from './data/db'
import { compressImageToWebP } from './lib/image'
import { createValidationExport } from './lib/export'
import { createId } from './lib/id'
import { beginRanking, resolveComparison, type RankingResolution } from './lib/ranking'
import { aiSuggestionProvider } from './services/ai'
import type {
  ComparisonResult,
  Emotion,
  FoodDraft,
  FoodDraftFields,
  FoodEntry,
  RankGroup,
  ValidationEvent,
  ValidationEventType,
} from './types'

type Tab = 'record' | 'archive' | 'ranking' | 'profile'

const navItems: Array<{ id: Tab; label: string; icon: typeof Home }> = [
  { id: 'record', label: '记录', icon: Camera },
  { id: 'archive', label: '档案', icon: Archive },
  { id: 'ranking', label: '榜单', icon: Trophy },
  { id: 'profile', label: '我的', icon: UserRound },
]

function getHashTab(): Tab {
  const value = window.location.hash.replace('#/', '')
  return navItems.some((item) => item.id === value) ? value as Tab : 'record'
}

async function addEvent(type: ValidationEventType, details: { elapsedMs?: number; comparisonCount?: number } = {}) {
  await db.events.add({
    id: createId('event'),
    type,
    timestamp: new Date().toISOString(),
    ...details,
  })
}

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description?: string }) {
  return (
    <header className="page-header">
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {description && <p className="page-description">{description}</p>}
    </header>
  )
}

function ErrorBanner({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      <button className="icon-button" onClick={onDismiss} aria-label="关闭错误提示"><X size={18} /></button>
    </div>
  )
}

function Onboarding({ onDone }: { onDone: (mode: 'demo' | 'empty') => Promise<void> }) {
  const [busy, setBusy] = useState<'demo' | 'empty' | null>(null)
  const [error, setError] = useState('')

  const choose = async (mode: 'demo' | 'empty') => {
    setBusy(mode)
    setError('')
    try {
      await onDone(mode)
    } catch (reason) {
      setError(friendlyStorageError(reason))
      setBusy(null)
    }
  }

  return (
    <main className="onboarding" data-testid="onboarding">
      <div className="brand-mark"><Utensils size={28} /></div>
      <p className="eyebrow">我的味觉档案 · 验证版</p>
      <h1>这一生，<br />你真正爱过什么味道？</h1>
      <p className="onboarding-copy">不是给餐厅打分。把一张张食物照片，慢慢排成只属于你的味觉人生。</p>
      <div className="privacy-pill"><ShieldCheck size={17} />照片与内容只保存在这台设备</div>
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <div className="onboarding-actions">
        <button className="button primary" data-testid="load-demo" disabled={Boolean(busy)} onClick={() => choose('demo')}>
          {busy === 'demo' ? <LoaderCircle className="spin" /> : <Sparkles />}
          载入 6 条演示档案
        </button>
        <button className="button secondary" disabled={Boolean(busy)} onClick={() => choose('empty')}>
          空白开始
        </button>
      </div>
      <p className="fine-print">演示档案均有“演示”标记，可随时清空。</p>
    </main>
  )
}

function RecordHome({ draft, entries, onStart, onOpenCamera, onFile, onResume, onDiscard }: {
  draft?: FoodDraft
  entries: FoodEntry[]
  onStart: () => void
  onOpenCamera: () => void
  onFile: (file?: File) => void
  onResume: () => void
  onDiscard: () => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const input = fileRef.current
    if (!input) return
    const handleCancel = () => onFile(undefined)
    input.addEventListener('cancel', handleCancel)
    return () => input.removeEventListener('cancel', handleCancel)
  }, [onFile])
  return (
    <section>
      <PageHeader eyebrow="今天的味道" title="留下一餐，留下当时的你" description="打开摄像头拍下这一餐，其余信息可以稍后慢慢补。" />
      <button className="capture-card" onClick={() => { onStart(); onOpenCamera() }} data-testid="start-record">
        <span className="capture-icon"><Camera size={30} /></span>
        <strong>打开摄像头拍照</strong>
        <span>实时取景，拍下后在设备内压缩为 WebP</span>
        <ChevronRight size={20} />
      </button>
      <input
        ref={fileRef}
        className="visually-hidden"
        type="file"
        accept="image/*"
        onChange={(event) => onFile(event.currentTarget.files?.[0])}
        aria-label="选择美食照片"
      />
      <button className="text-button import-fallback" onClick={() => { onStart(); fileRef.current?.click() }}>摄像头不可用？从相册导入</button>
      <p className="input-help">相册仅作为备用；照片不会上传。</p>

      {draft && (
        <article className="resume-card" data-testid="draft-resume">
          <img src={draft.image} alt="未完成记录" />
          <div>
            <p className="eyebrow">发现未完成记录</p>
            <h2>{draft.step === 'form' ? '信息还没确认' : '榜单位置还没确定'}</h2>
            <div className="inline-actions">
              <button className="text-button" onClick={onResume}>继续完成</button>
              <button className="text-button danger" onClick={onDiscard}>放弃</button>
            </div>
          </div>
        </article>
      )}

      <div className="mini-stats">
        <div><span>{entries.length}</span><small>份味觉记忆</small></div>
        <div><span>{entries.filter((entry) => entry.rankStatus === 'ranked').length}</span><small>已进入人生榜</small></div>
      </div>

      <aside className="truth-card">
        <Sparkles size={19} />
        <div><strong>关于“AI”</strong><p>当前使用验证版模拟建议，目的是验证流程，不代表已经完成真实食物识别。</p></div>
      </aside>
    </section>
  )
}

function SuggestionForm({ draft, busy, onChange, onBack, onConfirm }: {
  draft: FoodDraft
  busy: boolean
  onChange: (fields: FoodDraftFields) => void
  onBack: () => void
  onConfirm: (fields: FoodDraftFields) => void
}) {
  const [fields, setFields] = useState(draft.fields)
  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange }, [onChange])
  useEffect(() => {
    const timer = window.setTimeout(() => onChangeRef.current(fields), 150)
    return () => window.clearTimeout(timer)
  }, [fields])
  const update = <K extends keyof FoodDraftFields>(key: K, value: FoodDraftFields[K]) => setFields((current) => ({ ...current, [key]: value }))
  return (
    <section data-testid="suggestion-form">
      <button className="back-button" onClick={onBack}><ArrowLeft size={19} />返回</button>
      <div className="photo-hero compact"><img src={draft.image} alt="本次记录的美食" /></div>
      <div className="mock-badge"><Sparkles size={16} />验证版模拟识别 · 请由你确认</div>
      <PageHeader eyebrow="把建议改成你的记忆" title="这道味道，是什么？" />
      <div className="form-grid">
        <label>菜名<input data-testid="food-name" value={fields.name} onChange={(event) => update('name', event.target.value)} /></label>
        <label>地点<input value={fields.location} onChange={(event) => update('location', event.target.value)} /></label>
        <label>菜系<input value={fields.cuisine} onChange={(event) => update('cuisine', event.target.value)} /></label>
        <label>标签<input value={fields.tags.join('、')} onChange={(event) => update('tags', event.target.value.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean))} /></label>
        <label>当时的感受
          <select value={fields.emotion} onChange={(event) => update('emotion', event.target.value as Emotion)}>
            {(['惊喜', '怀念', '满足', '踩雷'] as Emotion[]).map((emotion) => <option key={emotion}>{emotion}</option>)}
          </select>
        </label>
        <label>发生日期<input type="date" value={fields.occurredAt} onChange={(event) => update('occurredAt', event.target.value)} /></label>
      </div>
      <button className="button primary sticky-action" data-testid="confirm-entry" disabled={busy || !fields.name.trim()} onClick={() => onConfirm(fields)}>
        {busy ? <LoaderCircle className="spin" /> : <Check />}确认，放进我的榜单
      </button>
    </section>
  )
}

function ComparisonView({ draft, anchor, busy, onDecision }: {
  draft: FoodDraft
  anchor: FoodEntry
  busy: boolean
  onDecision: (result: ComparisonResult) => void
}) {
  const round = (draft.ranking?.round ?? 0) + 1
  return (
    <section className="comparison" data-testid="comparison-view">
      <div className="comparison-topline">
        <span>第 {round} 次比较</span>
        <span>最多 4 次</span>
      </div>
      <div className="progress-track"><span style={{ width: `${round * 25}%` }} /></div>
      <PageHeader eyebrow="不用打分，只需凭感觉" title="如果只能留下一道，你选谁？" />
      <div className="duel-grid">
        <button disabled={busy} className="food-choice" data-testid="choose-new" onClick={() => onDecision('left')}>
          <img src={draft.image} alt={draft.fields.name} />
          <span className="choice-label">刚记录的</span>
          <strong>{draft.fields.name}</strong>
          <small>{draft.fields.location}</small>
        </button>
        <div className="versus">VS</div>
        <button disabled={busy} className="food-choice" data-testid="choose-anchor" onClick={() => onDecision('right')}>
          <img src={anchor.image} alt={anchor.name} />
          <span className="choice-label old">榜单里的</span>
          <strong>{anchor.name}</strong>
          <small>{anchor.location}</small>
        </button>
      </div>
      <div className="comparison-secondary">
        <button disabled={busy} className="button secondary" data-testid="choose-tie" onClick={() => onDecision('tie')}>真的难分</button>
        <button disabled={busy} className="text-button" data-testid="choose-later" onClick={() => onDecision('later')}><Clock3 size={17} />稍后再比</button>
      </div>
      <p className="fine-print">这里没有专业标准，只问哪一道对你更重要。</p>
    </section>
  )
}

function CompletionCard({ entry, position, pending, onRanking, onAgain }: {
  entry: FoodEntry
  position?: number
  pending?: boolean
  onRanking: () => void
  onAgain: () => void
}) {
  return (
    <section className="completion" data-testid="completion-card">
      <div className="celebration"><Heart fill="currentColor" /></div>
      <p className="eyebrow">记录已经留在这台设备</p>
      <h1>{pending ? '先留住，再慢慢决定' : `它进入了人生榜第 ${position} 位`}</h1>
      <div className="completion-food"><img src={entry.image} alt={entry.name} /><strong>{entry.name}</strong><span>{entry.location}</span></div>
      <p>{pending ? '这道味道已进入待比较区，任何时候都可以回来继续。' : '榜单不是终点，它会随着未来的每一餐继续变化。'}</p>
      <button className="button primary" data-testid="view-ranking" onClick={onRanking}>{pending ? '查看待比较' : '看看我的人生榜'}</button>
      <button className="button secondary" onClick={onAgain}>再记一道</button>
    </section>
  )
}

function ArchivePage({ entries, onDelete }: { entries: FoodEntry[]; onDelete: (entry: FoodEntry) => void }) {
  const sorted = [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  return (
    <section>
      <PageHeader eyebrow="我的档案" title="味道会把那一天带回来" description={`${entries.length} 份只保存在本机的记录`} />
      {sorted.length === 0 ? <EmptyState icon={Archive} title="还没有味觉档案" body="从一张今天的食物照片开始。" /> : (
        <div className="timeline" data-testid="archive-list">
          {sorted.map((entry) => (
            <article className="timeline-card" key={entry.id}>
              <img src={entry.image} alt={entry.name} />
              <div className="timeline-content">
                <div className="card-kicker"><span>{entry.occurredAt}</span>{entry.isDemo && <b>演示</b>}</div>
                <h2>{entry.name}</h2>
                <p><MapPin size={15} />{entry.location} · {entry.cuisine}</p>
                <div className="tag-row">{entry.tags.slice(0, 3).map((tag) => <span key={tag}>#{tag}</span>)}</div>
              </div>
              <button className="icon-button delete-button" onClick={() => onDelete(entry)} aria-label={`删除${entry.name}`}><Trash2 size={18} /></button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function RankingPage({ entries, groups, onResume }: { entries: FoodEntry[]; groups: RankGroup[]; onResume: (entry: FoodEntry) => void }) {
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries])
  const allRanked = groups.flatMap((group, groupIndex) => group.entryIds.map((id) => ({ entry: byId.get(id), rank: groupIndex + 1 }))).filter((item): item is { entry: FoodEntry; rank: number } => Boolean(item.entry))
  const ranked = allRanked.slice(0, 10)
  const month = new Date().toISOString().slice(0, 7)
  const monthly = allRanked.filter(({ entry }) => entry.occurredAt.startsWith(month)).slice(0, 3)
  const pending = entries.filter((entry) => entry.rankStatus === 'pending')
  return (
    <section data-testid="ranking-page">
      <PageHeader eyebrow="我的美食人生榜" title="不是最好吃，是我最想留下" description="每一道的位置，只由你的选择决定。" />
      <div className="rank-hero">
        <Crown size={22} />
        <div><small>此刻的人生第一</small><strong>{ranked[0]?.entry.name ?? '等待第一道味道'}</strong></div>
      </div>
      {ranked.length === 0 ? <EmptyState icon={Trophy} title="榜单还是空的" body="完成第一条记录，它会成为人生榜的起点。" /> : (
        <div className="rank-list">
          {ranked.map(({ entry, rank }) => (
            <article key={entry.id} className={`rank-row rank-${rank}`}>
              <span className="rank-number">{rank <= 3 ? <Medal size={20} /> : rank}</span>
              <img src={entry.image} alt={entry.name} />
              <div><strong>{entry.name}</strong><small>{entry.location} · {entry.emotion}</small></div>
              {entry.isDemo && <b className="demo-chip">演示</b>}
            </article>
          ))}
        </div>
      )}

      <div className="section-heading"><div><p className="eyebrow">本月切片</p><h2>这个月最想留下</h2></div><span>{month.replace('-', '.')}</span></div>
      <div className="monthly-grid" data-testid="monthly-ranking">
        {(monthly.length ? monthly : ranked.slice(0, 3)).map(({ entry, rank }) => (
          <article key={entry.id}><span>#{rank}</span><img src={entry.image} alt={entry.name} /><strong>{entry.name}</strong></article>
        ))}
      </div>

      {pending.length > 0 && (
        <div className="pending-section" data-testid="pending-list">
          <div className="section-heading"><div><p className="eyebrow">不必现在决定</p><h2>待比较</h2></div><span>{pending.length}</span></div>
          {pending.map((entry) => (
            <button key={entry.id} className="pending-row" onClick={() => onResume(entry)}>
              <img src={entry.image} alt={entry.name} /><span><strong>{entry.name}</strong><small>继续比较，找到它的位置</small></span><ChevronRight />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function ProfilePage({ entries, events, onExport, onClear }: {
  entries: FoodEntry[]
  events: ValidationEvent[]
  onExport: () => void
  onClear: () => void
}) {
  const dna = useMemo(() => {
    const counts = new Map<string, number>()
    entries.forEach((entry) => counts.set(entry.cuisine || '未分类', (counts.get(entry.cuisine || '未分类') ?? 0) + 1))
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => ({ name, count, percent: entries.length ? Math.round(count / entries.length * 100) : 0 }))
  }, [entries])
  const completed = events.filter((event) => event.type === 'ranking_completed')
  const median = (values: number[]) => values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null
  const medianSeconds = median(completed.flatMap((event) => event.elapsedMs === undefined ? [] : [event.elapsedMs]))
  const medianComparisons = median(completed.flatMap((event) => event.comparisonCount === undefined ? [] : [event.comparisonCount]))
  return (
    <section>
      <PageHeader eyebrow="只属于我的数据" title="我的味觉 DNA" description="它描述你的记录，不定义你的品味。" />
      <div className="dna-card">
        {dna.length === 0 ? <p>记录几道味道后，这里会长出你的味觉组成。</p> : dna.map((item, index) => (
          <div className="dna-row" key={item.name}>
            <div><span>{item.name}</span><strong>{item.percent}%</strong></div>
            <div className="dna-bar"><span style={{ width: `${item.percent}%`, background: ['#D9614C', '#F58A6A', '#F6B15A', '#8DAE75'][index] }} /></div>
          </div>
        ))}
      </div>
      {dna[0] && <p className="dna-quote">“你的生命里，已经有 {dna[0].percent}% 的{dna[0].name}。”</p>}

      <div className="section-heading"><div><p className="eyebrow">验证仪表</p><h2>这版是否足够轻？</h2></div></div>
      <div className="metric-grid">
        <div><strong>{completed.length}</strong><span>完成入榜</span></div>
        <div><strong>{medianSeconds === null ? '—' : `${Math.round(medianSeconds / 1000)}s`}</strong><span>中位用时</span></div>
        <div><strong>{medianComparisons ?? '—'}</strong><span>中位比较</span></div>
      </div>
      <p className="fine-print">这些只是本机验证数据，不代表产品假设已经成立。</p>

      <div className="settings-list">
        <div className="privacy-panel"><ShieldCheck /><div><strong>Local-only</strong><p>照片、菜名、地点和标签只存于此设备的 IndexedDB。没有账号、云同步或在线分析。</p></div></div>
        <button className="settings-button" onClick={onExport}><Download /><span><strong>导出匿名验证数据</strong><small>只含事件、时间与比较次数</small></span><ChevronRight /></button>
        <button className="settings-button danger" onClick={onClear}><Trash2 /><span><strong>清空这台设备的数据</strong><small>包括照片、榜单和演示档案</small></span><ChevronRight /></button>
      </div>
      <div className="prototype-note"><Sparkles /><p><strong>验证版模拟识别</strong><br />尚未接入真实 AI，也不会把照片发往外部服务。</p></div>
    </section>
  )
}

function EmptyState({ icon: Icon, title, body }: { icon: typeof Archive; title: string; body: string }) {
  return <div className="empty-state"><Icon /><h2>{title}</h2><p>{body}</p></div>
}

function PwaStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW()
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  useEffect(() => {
    if (!offlineReady) return
    const timer = window.setTimeout(() => setOfflineReady(false), 2800)
    return () => window.clearTimeout(timer)
  }, [offlineReady, setOfflineReady])
  if (!online) return <div className="status-toast"><WifiOff />当前离线，已保存内容仍可使用</div>
  if (needRefresh) return <div className="status-toast action"><span>发现新版本</span><button onClick={() => updateServiceWorker(true)}>立即更新</button><button aria-label="稍后更新" onClick={() => setNeedRefresh(false)}><X /></button></div>
  if (offlineReady) return <div className="status-toast action"><span>已可离线使用</span><button aria-label="关闭" onClick={() => setOfflineReady(false)}><X /></button></div>
  return null
}

export default function App() {
  const onboarding = useLiveQuery(async () => Boolean((await db.settings.get('onboardingCompleted'))?.value), [])
  const entries = useLiveQuery(() => db.entries.toArray(), []) ?? []
  const groups = useLiveQuery(() => db.rankGroups.orderBy('order').toArray(), []) ?? []
  const draft = useLiveQuery(() => db.drafts.get('active'), [])
  const events = useLiveQuery(() => db.events.toArray(), []) ?? []
  const [tab, setTab] = useState<Tab>(getHashTab)
  const [flowOpen, setFlowOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [completion, setCompletion] = useState<{ entryId: string; position?: number; pending?: boolean } | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const recordStartedAt = useRef<string | null>(null)

  useEffect(() => {
    const onHash = () => setTab(getHashTab())
    window.addEventListener('hashchange', onHash)
    if (!window.location.hash) window.location.hash = '/record'
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (tab === 'ranking' && onboarding) void addEvent('ranking_viewed')
  }, [tab, onboarding])

  const go = (next: Tab) => {
    setCompletion(null)
    setFlowOpen(false)
    window.location.hash = `/${next}`
  }

  const chooseOnboarding = async (mode: 'demo' | 'empty') => {
    await completeOnboarding(mode)
    await addEvent('onboarding_completed')
  }

  const beginRecordAttempt = () => {
    recordStartedAt.current = new Date().toISOString()
    void addEvent('record_started')
  }

  const handleFile = async (file?: File) => {
    if (!file) {
      setError('没有选择照片。你可以继续拍照，或稍后再记录。')
      return
    }
    setBusy(true)
    setError('')
    const startedAt = recordStartedAt.current ?? new Date().toISOString()
    recordStartedAt.current = null
    try {
      await addEvent('photo_selected')
      const image = await compressImageToWebP(file)
      const suggestion = await aiSuggestionProvider.analyze(file)
      await db.drafts.put({ id: 'active', step: 'form', image, fields: suggestion.fields, startedAt })
      await addEvent('suggestion_ready')
      setFlowOpen(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法处理这张照片，请重试。')
    } finally {
      setBusy(false)
    }
  }

  const updateDraftFields = async (fields: FoodDraftFields) => {
    try {
      await db.transaction('rw', db.drafts, async () => {
        const current = await db.drafts.get('active')
        if (!current || current.step !== 'form') return
        await db.drafts.put({ ...current, fields })
      })
    } catch (reason) {
      setError(friendlyStorageError(reason))
    }
  }

  const applyPlacement = async (entryId: string, resolution: Exclude<RankingResolution, { kind: 'continue' }>) => {
    if (resolution.kind === 'pending') {
      await db.entries.update(entryId, { rankStatus: 'pending' })
      await db.drafts.delete('active')
      await addEvent('ranking_deferred', { comparisonCount: resolution.comparisons })
      setCompletion({ entryId, pending: true })
      return
    }
    if (resolution.kind === 'tie') {
      const group = await db.rankGroups.get(resolution.groupId)
      if (!group) throw new Error('排名已变化，请重新开始比较。')
      await db.rankGroups.update(group.id, { entryIds: [...group.entryIds, entryId] })
    } else {
      const current = await db.rankGroups.orderBy('order').toArray()
      await db.rankGroups.bulkPut(current.filter((group) => group.order >= resolution.index).map((group) => ({ ...group, order: group.order + 1 })))
      await db.rankGroups.add({ id: createId('rank'), entryIds: [entryId], order: resolution.index, createdAt: new Date().toISOString() })
    }
    await db.entries.update(entryId, { rankStatus: 'ranked' })
    await db.drafts.delete('active')
    const rankedGroups = await db.rankGroups.orderBy('order').toArray()
    const position = rankedGroups.findIndex((group) => group.entryIds.includes(entryId)) + 1
    const started = draft ? new Date(draft.startedAt).getTime() : Date.now()
    await addEvent('ranking_completed', { elapsedMs: Math.max(0, Date.now() - started), comparisonCount: resolution.comparisons })
    setCompletion({ entryId, position })
  }

  const confirmEntry = async (latestFields?: FoodDraftFields) => {
    if (!draft) return
    const fields = latestFields ?? draft.fields
    if (!fields.name.trim()) return
    setBusy(true)
    setError('')
    const entryId = draft.entryId ?? createId('food')
    const entry: FoodEntry = {
      id: entryId,
      image: draft.image,
      ...fields,
      name: fields.name.trim(),
      location: fields.location.trim() || '未记录地点',
      cuisine: fields.cuisine.trim() || '未分类',
      tags: fields.tags.map((tag) => tag.trim()).filter(Boolean),
      createdAt: new Date().toISOString(),
      isDemo: false,
      rankStatus: 'ranking',
    }
    try {
      await db.entries.put(entry)
      await addEvent('entry_confirmed')
      const groupIds = groups.map((group) => group.id)
      const result = beginRanking(groupIds)
      if (result.kind === 'continue') {
        await db.drafts.put({ ...draft, fields, step: 'compare', entryId, ranking: result.progress })
      } else {
        await applyPlacement(entryId, result)
      }
    } catch (reason) {
      setError(reason instanceof Error && reason.message.includes('排名') ? reason.message : friendlyStorageError(reason))
    } finally {
      setBusy(false)
    }
  }

  const handleComparison = async (result: ComparisonResult) => {
    if (!draft?.entryId || !draft.ranking?.anchorGroupId) return
    const anchorGroup = groups.find((group) => group.id === draft.ranking?.anchorGroupId)
    const anchorId = anchorGroup?.entryIds[0]
    if (!anchorId) { setError('比较对象已不存在，请回到榜单重新开始。'); return }
    setBusy(true)
    setError('')
    try {
      await db.comparisons.add({
        id: createId('compare'),
        leftEntryId: draft.entryId,
        rightEntryId: anchorId,
        result,
        anchorGroupId: anchorGroup.id,
        round: draft.ranking.round + 1,
        createdAt: new Date().toISOString(),
      })
      if (result !== 'later') await addEvent('comparison_completed')
      const resolution = resolveComparison(draft.ranking, groups.map((group) => group.id), result)
      if (resolution.kind === 'continue') {
        await db.drafts.put({ ...draft, ranking: resolution.progress })
      } else {
        await applyPlacement(draft.entryId, resolution)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : friendlyStorageError(reason))
    } finally {
      setBusy(false)
    }
  }

  const resumePending = async (entry: FoodEntry) => {
    const result = beginRanking(groups.map((group) => group.id))
    if (result.kind === 'continue') {
      await db.entries.update(entry.id, { rankStatus: 'ranking' })
      await db.drafts.put({
        id: 'active', step: 'compare', image: entry.image,
        fields: { name: entry.name, location: entry.location, cuisine: entry.cuisine, tags: entry.tags, emotion: entry.emotion, occurredAt: entry.occurredAt },
        startedAt: new Date().toISOString(), entryId: entry.id, ranking: result.progress,
      })
      go('record')
      setFlowOpen(true)
    } else {
      await applyPlacement(entry.id, result)
    }
  }

  const discardDraft = async () => {
    if (draft?.entryId) await db.entries.delete(draft.entryId)
    await db.drafts.delete('active')
    setFlowOpen(false)
  }

  const handleDelete = async (entry: FoodEntry) => {
    if (!window.confirm(`删除“${entry.name}”？照片、比较和榜单位置会从本机移除。`)) return
    try { await deleteEntry(entry.id) } catch (reason) { setError(friendlyStorageError(reason)) }
  }

  const exportEvents = () => {
    const content = JSON.stringify(createValidationExport(events), null, 2)
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `taste-archive-validation-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const clearData = async () => {
    if (!window.confirm('确定清空这台设备上的全部味觉档案吗？此操作无法撤销。')) return
    await resetAllData()
    setCompletion(null)
    setFlowOpen(false)
    go('record')
  }

  if (onboarding === undefined) return <main className="loading-screen"><LoaderCircle className="spin" /><p>正在打开你的味觉档案…</p></main>
  if (!onboarding) return <Onboarding onDone={chooseOnboarding} />

  const completionEntry = completion ? entries.find((entry) => entry.id === completion.entryId) : undefined
  const anchorGroup = draft?.ranking?.anchorGroupId ? groups.find((group) => group.id === draft.ranking?.anchorGroupId) : undefined
  const anchor = anchorGroup ? entries.find((entry) => entry.id === anchorGroup.entryIds[0]) : undefined

  let content
  if (tab === 'record' && cameraOpen) {
    content = <CameraCapture onClose={() => setCameraOpen(false)} onCapture={async (file) => { setCameraOpen(false); await handleFile(file) }} />
  } else if (tab === 'record' && completion && completionEntry) {
    content = <CompletionCard entry={completionEntry} position={completion.position} pending={completion.pending} onRanking={() => go('ranking')} onAgain={() => { setCompletion(null); setFlowOpen(false) }} />
  } else if (tab === 'record' && flowOpen && draft?.step === 'form') {
    content = <SuggestionForm draft={draft} busy={busy} onChange={updateDraftFields} onBack={() => setFlowOpen(false)} onConfirm={confirmEntry} />
  } else if (tab === 'record' && flowOpen && draft?.step === 'compare' && anchor) {
    content = <ComparisonView draft={draft} anchor={anchor} busy={busy} onDecision={handleComparison} />
  } else if (tab === 'record') {
    content = <RecordHome draft={draft} entries={entries} onStart={beginRecordAttempt} onOpenCamera={() => setCameraOpen(true)} onFile={handleFile} onResume={() => setFlowOpen(true)} onDiscard={discardDraft} />
  } else if (tab === 'archive') {
    content = <ArchivePage entries={entries} onDelete={handleDelete} />
  } else if (tab === 'ranking') {
    content = <RankingPage entries={entries} groups={groups} onResume={resumePending} />
  } else {
    content = <ProfilePage entries={entries} events={events} onExport={exportEvents} onClear={clearData} />
  }

  return (
    <div className="app-shell">
      <PwaStatus />
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <main className="page-content">{busy && tab === 'record' && !flowOpen && <div className="processing"><LoaderCircle className="spin" /><strong>正在设备内处理照片</strong><span>随后会显示验证版模拟建议</span></div>}{content}</main>
      {!flowOpen && !completion && !cameraOpen && (
        <nav className="bottom-nav" aria-label="主要导航">
          {navItems.map((item) => {
            const Icon = item.icon
            return <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => go(item.id)}><Icon /><span>{item.label}</span></button>
          })}
        </nav>
      )}
    </div>
  )
}
