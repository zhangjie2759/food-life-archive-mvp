import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Camera,
  Check,
  ChevronRight,
  Clock3,
  Download,
  Frown,
  Home,
  LoaderCircle,
  MapPin,
  ShieldCheck,
  Share2,
  Sparkles,
  Trash2,
  Trophy,
  UserRound,
  WifiOff,
  X,
} from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { CameraCapture } from './components/CameraCapture'
import { ImageCropper } from './components/ImageCropper'
import { EntryDetail, type EntryContentChanges } from './components/EntryDetail'
import { PhotoViewer } from './components/PhotoViewer'
import { db, completeOnboarding, deleteEntry, friendlyStorageError, resetAllData, updateEntryContent } from './data/db'
import { compressImageToWebP, readAsDataUrl, validateImageFile } from './lib/image'
import { localDateKey, localMonthKey } from './lib/date'
import { createValidationExport } from './lib/export'
import { createRankingShareFile, shareOrDownloadRanking } from './lib/share'
import { createId } from './lib/id'
import { beginRanking, resolveComparison, type RankingResolution } from './lib/ranking'
import { aiSuggestionProvider } from './services/ai'
import type {
  ComparisonResult,
  FoodDraft,
  FoodDraftFields,
  FoodEntry,
  Emotion,
  RankGroup,
  RankingBoard,
  ValidationEvent,
  ValidationEventType,
} from './types'

type Tab = 'record' | 'archive' | 'ranking' | 'profile'
type CaptureMode = { kind: 'record' } | { kind: 'replace'; entryId: string }
type RankingMotion = {
  id: number
  board: RankingBoard
  entryId: string
  fromRank: number | 'NEW'
  toRank: number
}

const navItems: Array<{ id: Tab; label: string; icon: typeof Home }> = [
  { id: 'ranking', label: '榜单', icon: Trophy },
  { id: 'record', label: '记录', icon: Camera },
  { id: 'archive', label: '档案', icon: Archive },
  { id: 'profile', label: '我的', icon: UserRound },
]

function emptyDraftFields(): FoodDraftFields {
  return {
    name: '', aiName: '', location: '', cuisine: '', type: '', foodGroup: '', diet: '', tags: [], note: '', emotion: '待确认' as Emotion,
    occurredAt: localDateKey(),
  }
}

function getHashTab(): Tab {
  if (!window.location.hash) return 'record'
  const value = window.location.hash.replace('#/', '')
  return navItems.some((item) => item.id === value) ? value as Tab : 'ranking'
}

function triggerHaptic(pattern: number | number[]) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  if ('vibrate' in navigator) navigator.vibrate(pattern)
}

async function addEvent(type: ValidationEventType, details: { elapsedMs?: number; comparisonCount?: number } = {}) {
  await db.events.add({
    id: createId('event'),
    type,
    timestamp: new Date().toISOString(),
    ...details,
  })
}

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: ReactNode; description?: string }) {
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
      <PageHeader eyebrow="QUICK RECORD" title="拍下这道菜" description="只记录，吃完再排。" />
      <button className="capture-card" onClick={() => { onStart(); onOpenCamera() }} data-testid="start-record">
        <span className="capture-icon"><Camera size={30} /></span>
        <strong>打开摄像头</strong>
        <span>实时取景 · 拍摄后框准这一道</span>
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
      <button className="button secondary import-primary" onClick={() => { onStart(); fileRef.current?.click() }}>从相册调取历史照片</button>
      <p className="input-help">AI 负责辨认，不负责好不好吃。</p>

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
        <div><span>{entries.length}</span><small>份在册记录</small></div>
        <div><span>{entries.filter((entry) => entry.rankStatus === 'ranked').length}</span><small>份正式裁定</small></div>
      </div>

      <aside className="truth-card">
        <Sparkles size={19} />
        <div><strong>AI 职责边界</strong><p>AI 只识别标准名称与客观分类；红榜或黑榜、排名与赐名始终由你决定。</p></div>
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
      <div className="mock-badge"><Sparkles size={16} />{draft.providerLabel || 'AI 识别结果'} · 请核准</div>
      <PageHeader eyebrow="IDENTIFICATION REPORT" title={fields.name ? <>识别为：<span>{fields.name}</span></> : <>没有认准，请你定名</>} description="AI 负责辨认，不负责好不好吃。" />
      <div className="quick-form">
        <label>标准名称<input data-testid="food-name" value={fields.name} placeholder="请输入这道食物的名称" onChange={(event) => update('name', event.target.value)} /></label>
        <div className="classification-grid">
          <label>菜系<input value={fields.cuisine} onChange={(event) => update('cuisine', event.target.value)} /></label>
          <label>类型<input data-testid="food-type" value={fields.type ?? ''} onChange={(event) => update('type', event.target.value)} /></label>
          <label>食物类别<input data-testid="food-group" value={fields.foodGroup ?? ''} onChange={(event) => update('foodGroup', event.target.value)} /></label>
          <label>食材属性<input data-testid="food-diet" value={fields.diet ?? ''} onChange={(event) => update('diet', event.target.value)} /></label>
        </div>
        <p className={`ai-experiment-note ${draft.providerLabel?.includes('Gemini') ? '' : 'ai-offline'}`}><Sparkles size={15} />{draft.providerLabel?.includes('Gemini') ? '照片已通过安全代理发送给 Gemini 识别；App 不保存云端副本。' : '公网 AI 服务尚未连接；当前不会伪造识别结果，请手动核准。'}</p>
      </div>
      <details className="optional-fields">
        <summary>补充地点、日期和备注</summary>
        <div className="form-grid">
          <label>地点<input value={fields.location} onChange={(event) => update('location', event.target.value)} /></label>
          <label>发生日期<input type="date" value={fields.occurredAt} onChange={(event) => update('occurredAt', event.target.value)} /></label>
          <label>备注<textarea data-testid="food-note" value={fields.note ?? ''} onChange={(event) => update('note', event.target.value)} placeholder="可选，不影响标准分类" /></label>
          <label>标签<input value={fields.tags.join('、')} onChange={(event) => update('tags', event.target.value.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean))} /></label>
        </div>
      </details>
      <button className="button primary sticky-action" data-testid="confirm-entry" disabled={busy || !fields.name.trim()} onClick={() => onConfirm(fields)}>
        {busy ? <LoaderCircle className="spin" /> : <Check />}记下，吃完再排
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
  const isBlack = draft.targetBoard === 'black'
  return (
    <section className="comparison" data-testid="comparison-view">
      <div className="comparison-topline">
        <span>第 {round} 场复判</span>
        <span>最多 4 次</span>
      </div>
      <div className="progress-track"><span style={{ width: `${round * 25}%` }} /></div>
      <PageHeader eyebrow={isBlack ? 'BLACK LIST VERDICT' : 'RED LIST VERDICT'} title="谁更值得留在前面？" description={isBlack ? '选择更该排在黑榜前面的那一道。' : '不打分，只做一次明确比较。'} />
      <div className="duel-grid">
        <button disabled={busy} className="food-choice" data-testid="choose-new" onClick={() => onDecision('left')}>
          <img src={draft.image} alt={draft.fields.name} />
          <span className="choice-label">待裁定</span>
          <strong>{draft.fields.name}</strong>
          <small>{draft.fields.location}</small>
        </button>
        <div className="versus">VS</div>
        <button disabled={busy} className="food-choice" data-testid="choose-anchor" onClick={() => onDecision('right')}>
          <img src={anchor.image} alt={anchor.name} />
          <span className="choice-label old">现有记录</span>
          <strong>{anchor.name}</strong>
          <small>{anchor.location}</small>
        </button>
      </div>
      <div className="comparison-secondary">
        <button disabled={busy} className="button secondary" data-testid="choose-tie" onClick={() => onDecision('tie')}>难分，暂时并列</button>
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
      <div className="celebration"><Check /></div>
      <p className="eyebrow">{pending ? 'EVIDENCE REGISTERED' : 'VERDICT COMPLETE'}</p>
      <h1>{pending ? '记录在册。等待正式裁定。' : `当前顺位 NO.${String(position ?? 0).padStart(2, '0')}`}</h1>
      <div className="completion-food"><img src={entry.image} alt={entry.name} /><strong>{entry.name}</strong><span>{entry.location}</span></div>
      <p>{pending ? '已记下 · 待复判 +1。吃完以后，再决定列入红榜或黑榜。' : '本次排名已经生效；顺位仍可随时复核。'}</p>
      <button className="button primary" data-testid="view-ranking" onClick={onRanking}>{pending ? '查看待复判' : '查看最新榜单'}</button>
      <button className="button secondary" onClick={onAgain}>继续拍下一道</button>
    </section>
  )
}

function ArchivePage({ entries, onDelete, onOpen, onViewPhoto }: { entries: FoodEntry[]; onDelete: (entry: FoodEntry) => void; onOpen: (entry: FoodEntry) => void; onViewPhoto: (entry: FoodEntry) => void }) {
  const sorted = [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  return (
    <section>
      <PageHeader eyebrow="FOOD ARCHIVE" title="我的食物档案" description={`${entries.length} 份在册记录 · 点击照片可放大`} />
      {sorted.length === 0 ? <EmptyState icon={Archive} title="还没有在册档案" body="提交第一张食物照片，建立标准记录。" /> : (
        <div className="timeline" data-testid="archive-list">
          {sorted.map((entry) => (
            <article className="timeline-card" key={entry.id}>
              <button className="archive-photo-button" onClick={() => onViewPhoto(entry)} aria-label={`放大${entry.bestowedName || entry.name}照片`}><img src={entry.image} alt={entry.bestowedName || entry.name} /></button>
              <div className="timeline-content">
                <div className="card-kicker"><span>{entry.occurredAt}</span>{entry.isDemo && <b>演示</b>}</div>
                <button className="archive-entry-button" onClick={() => onOpen(entry)}><h2>{entry.bestowedName || entry.name}</h2><small>查看并编辑档案</small></button>
                <p><MapPin size={15} />{entry.location} · {entry.cuisine}</p>
                {entry.note && <p className="archive-note">{entry.note}</p>}
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

function RankingPage({ entries, groups, motion, onResume, onMove, onBestow, onShare, onOpen, onViewPhoto }: {
  entries: FoodEntry[]
  groups: RankGroup[]
  motion: RankingMotion | null
  onResume: (entry: FoodEntry, board: RankingBoard) => void
  onMove: (board: RankingBoard, entryId: string, targetEntryId: string | undefined, fromRank: number, toRank: number) => void
  onBestow: (entry: FoodEntry, rank: number) => void
  onShare: (entries: FoodEntry[], label: string, key: string) => void
  onOpen: (entry: FoodEntry) => void
  onViewPhoto: (entry: FoodEntry) => void
}) {
  const now = new Date()
  const currentMonth = localMonthKey(now)
  const currentYear = String(now.getFullYear())
  const [board, setBoard] = useState<RankingBoard>('red')
  const [period, setPeriod] = useState<'month' | 'year' | 'life'>('life')
  const [month, setMonth] = useState(currentMonth)
  const years = useMemo(() => [...new Set([currentYear, ...entries.map((entry) => entry.occurredAt.slice(0, 4))])].sort((a, b) => b.localeCompare(a)), [currentYear, entries])
  const [year, setYear] = useState(currentYear)
  const [filter, setFilter] = useState('全部')
  const periodKey = period === 'month' ? month : period === 'year' ? year : 'ALL TIME'
  const periodLabel = period === 'month' ? '月榜' : period === 'year' ? '年度总榜' : '人生榜'
  const boardLabel = board === 'red' ? '红榜' : '黑榜'
  const byId = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries])
  const boardGroups = groups.filter((group) => (group.board ?? 'red') === board).sort((a, b) => a.order - b.order)
  const allRanked = boardGroups.flatMap((group, globalIndex) => group.entryIds.map((id) => ({ entry: byId.get(id), groupId: group.id, globalRank: globalIndex + 1 }))).filter((item): item is { entry: FoodEntry; groupId: string; globalRank: number } => Boolean(item.entry))
  const periodRanked = allRanked.filter(({ entry }) => period === 'life' || entry.occurredAt.startsWith(periodKey))
  const filters = ['全部', ...new Set(periodRanked.flatMap(({ entry }) => [entry.cuisine, entry.type, entry.foodGroup, entry.diet].filter((value): value is string => Boolean(value))))]
  const ranked = periodRanked.filter(({ entry }) => filter === '全部' || [entry.cuisine, entry.type, entry.foodGroup, entry.diet].includes(filter))
  const pending = entries.filter((entry) => entry.rankStatus === 'pending' && (period === 'life' || entry.occurredAt.startsWith(periodKey))).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const reportEntries = entries.filter((entry) => entry.rankStatus === 'ranked' && (entry.board ?? 'red') === board && (period === 'life' || entry.occurredAt.startsWith(periodKey)))
  const reportGroups = [...reportEntries.reduce((counts, entry) => counts.set(entry.foodGroup || entry.cuisine || '其他', (counts.get(entry.foodGroup || entry.cuisine || '其他') ?? 0) + 1), new Map<string, number>()).entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 5)
  const first = ranked[0]?.entry
  const motionIsUp = motion?.fromRank === 'NEW' || (typeof motion?.fromRank === 'number' && motion.toRank < motion.fromRank)
  const motionFromLabel = motion?.fromRank === 'NEW' ? 'NEW' : `NO.${String(motion?.fromRank ?? 0).padStart(2, '0')}`
  return (
    <section data-testid="ranking-page" className={`editorial-ranking board-${board}`}>
      <header className="ranking-masthead">
        <div className="ranking-brand"><div><strong>我的美食榜</strong><small>私人美食评审局</small></div></div>
        <b>{period === 'month' ? month.replace('-', '.') : period === 'year' ? year : 'LIFE'}</b>
      </header>
      <div className="board-switch" role="tablist" aria-label="红黑榜切换">
        <button data-testid="board-red" className={board === 'red' ? 'active' : ''} onClick={() => { setBoard('red'); setFilter('全部') }}><span>RED LIST</span>红榜</button>
        <button data-testid="board-black" className={board === 'black' ? 'active' : ''} onClick={() => { setBoard('black'); setFilter('全部') }}><span>BLACK LIST</span>黑榜</button>
      </div>
      <p className="board-definition">{board === 'red' ? '越靠前，越值得留下。' : '越靠前，越不想再吃。只代表我的个人裁定。'}</p>
      {motion?.board === board && (
        <div className={`rank-motion-notice ${motionIsUp ? 'up' : 'down'}`} data-testid="rank-motion" role="status">
          <span>RANKING REVISED</span>
          <strong>{motionFromLabel} → NO.{String(motion.toRank).padStart(2, '0')}</strong>
          <small>{motion.toRank === 1 ? '新任榜首已经裁定' : '顺位已正式改写'}</small>
        </div>
      )}
      <div className="period-tabs" role="tablist" aria-label="榜单周期">
        <button data-testid="period-month" className={period === 'month' ? 'active' : ''} onClick={() => setPeriod('month')}>月榜</button>
        <button data-testid="period-year" className={period === 'year' ? 'active' : ''} onClick={() => setPeriod('year')}>年度</button>
        <button data-testid="period-life" className={period === 'life' ? 'active' : ''} onClick={() => setPeriod('life')}>人生</button>
      </div>
      <div className="period-toolbar">
        {period === 'month' ? <input aria-label="选择月份" type="month" value={month} onChange={(event) => setMonth(event.target.value || currentMonth)} /> : period === 'year' ? (
          <select aria-label="选择年份" value={year} onChange={(event) => setYear(event.target.value)}>{years.map((item) => <option key={item}>{item}</option>)}</select>
        ) : <p className="blacklist-warning">长期总档案</p>}
        <button className="share-ranking" disabled={!ranked.length} onClick={() => onShare(ranked.slice(0, 10).map(({ entry }) => entry), `${boardLabel}${periodLabel}`, periodKey.replace('-', '.'))}><Share2 size={17} />生成榜单图</button>
      </div>

      {filters.length > 1 && <div className="ranking-filters" aria-label="分类筛选">{filters.map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>}

      {period !== 'life' && reportEntries.length > 0 && (
        <details className="taste-report" data-testid="taste-report">
          <summary><span><small>{period === 'month' ? 'MONTHLY TASTE REPORT' : 'YEARLY TASTE REPORT'}</small><strong>{period === 'month' ? '本月味觉研究报告' : '年度味觉研究报告'}</strong></span></summary>
          <div className="report-bars">{reportGroups.map(([name, count]) => <div key={name}><span>{name}</span><i><b style={{ width: `${Math.max(8, Math.round(count / reportEntries.length * 100))}%` }} /></i><strong>{Math.round(count / reportEntries.length * 100)}%</strong></div>)}</div>
          <div className="report-stats"><div><strong>{reportEntries.length}</strong><span>道在榜</span></div><div><strong>{reportGroups.length}</strong><span>类味觉</span></div><div><strong>{Math.min(10, reportEntries.length)}</strong><span>道入十席</span></div></div>
        </details>
      )}

      {pending.length > 0 && (
        <div className="review-queue" data-testid="pending-list">
          <div><p className="eyebrow">AWAITING VERDICT</p><h2>{pending.length} 份记录等待裁定</h2></div>
          {pending.map((entry) => (
            <article key={entry.id} className="review-card">
              <img src={entry.image} alt={entry.name} />
              <span><strong>{entry.name}</strong><small>{entry.aiName || entry.foodGroup || '待完成分类'}</small></span>
              <div className="review-actions">
                <button data-testid={`review-red-${entry.id}`} onClick={() => onResume(entry, 'red')} aria-label={`列入红榜${entry.name}`}>列入红榜</button>
                <button className="blacklist-action" data-testid={`review-black-${entry.id}`} onClick={() => onResume(entry, 'black')} aria-label={`列入黑榜${entry.name}`}>列入黑榜</button>
              </div>
            </article>
          ))}
        </div>
      )}

      <div className={`rank-hero official ${board === 'black' ? 'black' : ''}`}>
        <span className="leader-code">NO.01</span>
        <div><small>{board === 'red' ? `${periodLabel}榜首` : `${periodLabel}最差纪录`}</small><strong>{first?.bestowedName || first?.name || '等待首次裁定'}</strong></div>
      </div>
      {ranked.length === 0 ? <EmptyState icon={board === 'red' ? Trophy : Frown} title={`${boardLabel}${periodLabel}尚未建立`} body="先记录，吃完后完成一次正式裁定。" /> : (
        <div className={`rank-list official-list ${board === 'black' ? 'black' : ''}`} data-testid="period-ranking">
          {ranked.map(({ entry, globalRank }, index) => {
            const rank = index + 1
            const displayName = entry.bestowedName || entry.name
            const change = entry.lastRankChange === 'NEW' ? 'NEW' : typeof entry.lastRankChange === 'number' && entry.lastRankChange !== 0 ? `${entry.lastRankChange > 0 ? '↑' : '↓'}${Math.abs(entry.lastRankChange)}` : '—'
            const motionClass = motion?.board === board && motion.entryId === entry.id
              ? ` rank-motion-target ${motionIsUp ? 'moving-up' : 'moving-down'}${motion.toRank === 1 ? ' new-leader' : ''}`
              : ''
            return <article key={`${entry.id}-${motion?.entryId === entry.id ? motion.id : 0}`} className={`rank-row official-row rank-${rank}${motionClass}`}>
              <span className="rank-number">{String(rank).padStart(2, '0')}</span>
              <button className="rank-photo-button" data-testid={`view-photo-${entry.id}`} onClick={() => onViewPhoto(entry)} aria-label={`放大${displayName}照片`}><img src={entry.image} alt={displayName} /></button>
              <div className="rank-copy"><button className="rank-entry-button" data-testid={`open-entry-${entry.id}`} onClick={() => onOpen(entry)}><strong>{displayName}</strong><small>{entry.bestowedName ? `标准名称：${entry.name}` : [entry.cuisine, entry.foodGroup, entry.diet].filter(Boolean).join(' / ')}</small></button>{globalRank <= 10 && <button className="bestow-button" onClick={() => onBestow(entry, globalRank)}>{entry.bestowedName ? '重新赐名' : 'TOP 10 · 赐名'}</button>}</div>
              <span className={`rank-change ${change === 'NEW' || change.startsWith('↑') ? 'up' : ''}`}>{change}</span>
              <div className="rank-adjust">
                <button disabled={index === 0 || ranked[index - 1]?.groupId === ranked[index]?.groupId} onClick={() => onMove(board, entry.id, ranked[index - 1]?.entry.id, index + 1, index)} aria-label={`上移${entry.name}`}><ArrowUp /></button>
                <button disabled={index === ranked.length - 1 || ranked[index + 1]?.groupId === ranked[index]?.groupId} onClick={() => onMove(board, entry.id, ranked[index + 1]?.entry.id, index + 1, index + 2)} aria-label={`下移${entry.name}`}><ArrowDown /></button>
              </div>
            </article>
          })}
        </div>
      )}
    </section>
  )
}

function BestowCeremony({ entry, rank, onClose, onConfirm }: {
  entry: FoodEntry
  rank: number
  onClose: () => void
  onConfirm: (name: string) => void
}) {
  const [name, setName] = useState(entry.bestowedName || '')
  return (
    <section className="bestow-screen" data-testid="bestow-screen">
      <button className="bestow-close" onClick={onClose} aria-label="关闭赐名"><X /></button>
      <div className="bestow-index">TOP 10 / NO.{String(rank).padStart(2, '0')}</div>
      <div className="bestow-heading"><div><small>赐名仪式</small><strong>此味已入十席</strong></div></div>
      <img src={entry.image} alt={entry.aiName || entry.name} />
      <p className="bestow-standard">STANDARD NAME<br /><strong>{entry.name}</strong></p>
      <div className="bestow-rule" />
      <label>正式赐名<input autoFocus value={name} maxLength={24} onChange={(event) => setName(event.target.value)} placeholder="例如：凌晨两点救命牛肉面" /></label>
      <button className="bestow-confirm" disabled={!name.trim()} onClick={() => onConfirm(name.trim())}>确认定名</button>
      <small>{localDateKey()} · PERSONAL FOOD AUTHORITY</small>
    </section>
  )
}

function RankingCeremony({ board, rank, name, onClose }: { board: RankingBoard; rank: number; name: string; onClose: () => void }) {
  const headline = rank === 1 ? (board === 'red' ? '榜首易主' : '最差纪录刷新') : rank <= 3 ? `正式进入 TOP ${rank}` : rank <= 10 ? '正式进入 TOP 10' : '排名已改写'
  const level = rank === 1 ? 'apex' : rank <= 3 ? 'podium' : rank <= 10 ? 'top-ten' : 'standard'
  useEffect(() => {
    triggerHaptic(rank === 1 ? [45, 55, 90, 70, 150] : rank <= 3 ? [30, 45, 70] : [22, 35, 28])
    const handleKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [rank, onClose])
  return (
    <div className={`ranking-ceremony ${board} ${level}`} data-testid="ranking-ceremony" role="dialog" aria-modal="true" aria-labelledby="ranking-ceremony-title" aria-describedby="ranking-ceremony-name">
      {rank === 1 && <><div className="ceremony-scan" /><div className="ceremony-halo halo-one" /><div className="ceremony-halo halo-two" /><div className={`leader-emblem ${board}`} aria-hidden="true"><i /><i /><i /></div><div className="apex-label">OFFICIAL CHANGE OF NO.01</div></>}
      <div className="ceremony-rule" />
      <span>{board === 'red' ? 'RED LIST VERDICT' : 'BLACK LIST VERDICT'}</span>
      <strong className="ceremony-rank">{String(rank).padStart(2, '0')}</strong>
      <h1 id="ranking-ceremony-title">{headline}</h1>
      <p id="ranking-ceremony-name">{name}</p>
      <div className="verdict-seal">{rank === 1 ? (board === 'red' ? '榜首' : '最差') : (board === 'red' ? '入榜' : '定案')}</div>
      <button autoFocus onClick={onClose}>查看最新榜单</button>
    </div>
  )
}

function ProfilePage({ entries, events, onExport, onClear, onLoadDemo }: {
  entries: FoodEntry[]
  events: ValidationEvent[]
  onExport: () => void
  onClear: () => void
  onLoadDemo: () => void
}) {
  const dna = useMemo(() => {
    const counts = new Map<string, number>()
    entries.forEach((entry) => counts.set(entry.cuisine || '未分类', (counts.get(entry.cuisine || '未分类') ?? 0) + 1))
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, count]) => ({ name, count, percent: entries.length ? Math.round(count / entries.length * 100) : 0 }))
  }, [entries])
  const completed = events.filter((event) => event.type === 'ranking_completed')
  const saved = events.filter((event) => event.type === 'record_saved')
  const median = (values: number[]) => values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null
  const medianSeconds = median(saved.flatMap((event) => event.elapsedMs === undefined ? [] : [event.elapsedMs]))
  const medianComparisons = median(completed.flatMap((event) => event.comparisonCount === undefined ? [] : [event.comparisonCount]))
  return (
    <section>
      <PageHeader eyebrow="TASTE RESEARCH" title="我的味觉研究" description="只统计本机档案，不提供大众口味结论。" />
      <div className="dna-card">
        {dna.length === 0 ? <p>记录几道味道后，这里会长出你的味觉组成。</p> : dna.map((item, index) => (
          <div className="dna-row" key={item.name}>
            <div><span>{item.name}</span><strong>{item.percent}%</strong></div>
            <div className="dna-bar"><span style={{ width: `${item.percent}%`, background: ['#D9614C', '#F58A6A', '#F6B15A', '#8DAE75'][index] }} /></div>
          </div>
        ))}
      </div>
      {dna[0] && <p className="dna-quote">当前样本中，{dna[0].name}占比 {dna[0].percent}%</p>}

      <div className="section-heading"><div><p className="eyebrow">验证仪表</p><h2>这版是否足够轻？</h2></div></div>
      <div className="metric-grid">
        <div><strong>{saved.length}</strong><span>快速记录</span></div>
        <div><strong>{medianSeconds === null ? '—' : `${Math.round(medianSeconds / 1000)}s`}</strong><span>记录中位用时</span></div>
        <div><strong>{medianComparisons ?? '—'}</strong><span>中位比较</span></div>
      </div>
      <p className="fine-print">这些只是本机验证数据，不代表产品假设已经成立。</p>

      <div className="settings-list">
        <div className="privacy-panel"><ShieldCheck /><div><strong>本机档案</strong><p>档案与排名保存在此设备的 IndexedDB；启用真实 AI 时，仅将当前压缩图片发送给识别服务。</p></div></div>
        {entries.length === 0 && <button className="settings-button" data-testid="load-demo" onClick={onLoadDemo}><Sparkles /><span><strong>载入 6 条演示档案</strong><small>用于立即体验红榜、黑榜与复判</small></span><ChevronRight /></button>}
        <button className="settings-button" onClick={onExport}><Download /><span><strong>导出匿名验证数据</strong><small>只含事件、时间与比较次数</small></span><ChevronRight /></button>
        <button className="settings-button danger" onClick={onClear}><Trash2 /><span><strong>清空这台设备的数据</strong><small>包括照片、榜单和演示档案</small></span><ChevronRight /></button>
      </div>
      <div className="prototype-note"><Sparkles /><p><strong>AI 识别边界</strong><br />本地开发已接通 Gemini；公开 Pages 在安全后端部署前继续明确使用模拟识别。AI 不参与红黑榜裁定。</p></div>
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
  const realAiEnabled = import.meta.env.VITE_USE_REAL_AI === 'true'
  const onboarding = useLiveQuery(async () => Boolean((await db.settings.get('onboardingCompleted'))?.value), [])
  const entries = useLiveQuery(() => db.entries.toArray(), []) ?? []
  const groups = useLiveQuery(() => db.rankGroups.orderBy('order').toArray(), []) ?? []
  const draftState = useLiveQuery(async () => ({ draft: await db.drafts.get('active') }), [])
  const draft = draftState?.draft
  const events = useLiveQuery(() => db.events.toArray(), []) ?? []
  const [tab, setTab] = useState<Tab>(getHashTab)
  const [flowOpen, setFlowOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [completion, setCompletion] = useState<{ entryId: string; position?: number; pending?: boolean } | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cropCandidate, setCropCandidate] = useState<File | null>(null)
  const [captureMode, setCaptureMode] = useState<CaptureMode>({ kind: 'record' })
  const [cropMode, setCropMode] = useState<CaptureMode>({ kind: 'record' })
  const [notice, setNotice] = useState('')
  const [bestowTarget, setBestowTarget] = useState<{ entry: FoodEntry; rank: number } | null>(null)
  const [ceremony, setCeremony] = useState<{ board: RankingBoard; rank: number; name: string } | null>(null)
  const [rankingMotion, setRankingMotion] = useState<RankingMotion | null>(null)
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null)
  const [photoViewer, setPhotoViewer] = useState<{ src: string; alt: string } | null>(null)
  const recordStartedAt = useRef<string | null>(null)
  const rankingMoveInFlight = useRef(false)
  const initialLaunchHandled = useRef(false)

  useEffect(() => {
    const onHash = () => setTab(getHashTab())
    window.addEventListener('hashchange', onHash)
    if (!window.location.hash) window.location.hash = '/record'
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (tab === 'ranking' && onboarding !== undefined) void addEvent('ranking_viewed')
  }, [tab, onboarding])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => {
    if (!rankingMotion) return
    const timer = window.setTimeout(() => setRankingMotion(null), rankingMotion.toRank === 1 ? 5200 : 2600)
    return () => window.clearTimeout(timer)
  }, [rankingMotion])

  useEffect(() => {
    if (!completion?.pending || tab !== 'record') return
    const timer = window.setTimeout(() => {
      setCompletion(null)
      setFlowOpen(false)
      recordStartedAt.current = new Date().toISOString()
      void addEvent('record_started')
      setCaptureMode({ kind: 'record' })
      setCameraOpen(true)
    }, 1400)
    return () => window.clearTimeout(timer)
  }, [completion, tab])

  const go = (next: Tab) => {
    setCompletion(null)
    setFlowOpen(false)
    setCameraOpen(false)
    setCropCandidate(null)
    setCaptureMode({ kind: 'record' })
    setSelectedEntryId(null)
    window.location.hash = `/${next}`
  }

  const beginRecordAttempt = () => {
    recordStartedAt.current = new Date().toISOString()
    void addEvent('record_started')
  }

  const prepareCrop = async (file?: File, mode: CaptureMode = captureMode) => {
    if (!file) {
      setError('没有选择照片。你可以继续拍照，或稍后再记录。')
      return
    }
    try {
      validateImageFile(file)
      setError('')
      const startedAt = recordStartedAt.current ?? new Date().toISOString()
      if (mode.kind === 'record') {
        // Persist the temporary original as a data URL: Playwright WebKit and some
        // older Safari builds cannot structured-clone File/Blob values into IDB.
        const sourceDataUrl = await readAsDataUrl(file)
        await db.drafts.put({ id: 'active', step: 'crop', image: '', fields: emptyDraftFields(), startedAt, sourceDataUrl, sourceName: file.name })
      }
      setCameraOpen(false)
      setCropMode(mode)
      setCropCandidate(file)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法读取这张照片。')
    }
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
      const compressedBlob = await (await fetch(image)).blob()
      const compressedFile = new File([compressedBlob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp', lastModified: Date.now() })
      await db.drafts.put({ id: 'active', step: 'analyzing', image, fields: emptyDraftFields(), startedAt, sourceName: compressedFile.name })
      const suggestion = await aiSuggestionProvider.analyze(compressedFile)
      await db.drafts.put({ id: 'active', step: 'form', image, fields: suggestion.fields, startedAt, providerLabel: suggestion.providerLabel })
      await addEvent('suggestion_ready')
      setFlowOpen(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法处理这张照片，请重试。')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (onboarding === undefined || !draftState || initialLaunchHandled.current) return
    initialLaunchHandled.current = true
    if (!onboarding) void completeOnboarding('empty').then(() => addEvent('onboarding_completed'))
    if (tab !== 'record') return
    if (draft?.step === 'crop' && (draft.sourceDataUrl || draft.sourceFile)) {
      setCropMode({ kind: 'record' })
      void (async () => {
        const blob = draft.sourceDataUrl ? await (await fetch(draft.sourceDataUrl)).blob() : draft.sourceFile!
        setCropCandidate(new File([blob], draft.sourceName || 'unfinished-photo.jpg', { type: blob.type || 'image/jpeg' }))
      })()
      void addEvent('draft_restored')
      return
    }
    if (draft?.step === 'analyzing' && draft.image) {
      void (async () => {
        setBusy(true)
        try {
          const blob = await (await fetch(draft.image)).blob()
          const file = new File([blob], draft.sourceName || 'restored.webp', { type: blob.type || 'image/webp' })
          const suggestion = await aiSuggestionProvider.analyze(file)
          await db.drafts.put({ ...draft, step: 'form', fields: suggestion.fields, providerLabel: suggestion.providerLabel, sourceFile: undefined, sourceDataUrl: undefined })
          setFlowOpen(true)
          await addEvent('draft_restored')
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : '未完成的识别恢复失败，请重新尝试。')
        } finally { setBusy(false) }
      })()
      return
    }
    if (draft?.step === 'form' || draft?.step === 'compare') {
      setFlowOpen(true)
      void addEvent('draft_restored')
      return
    }
    beginRecordAttempt()
    setCaptureMode({ kind: 'record' })
    setCameraOpen(true)
    void addEvent('camera_auto_opened')
  // The launch decision is intentionally made once per mounted app session.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onboarding, draftState])

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

  const applyPlacement = async (entryId: string, resolution: Exclude<RankingResolution, { kind: 'continue' }>, board: RankingBoard) => {
    if (resolution.kind === 'pending') {
      await db.entries.update(entryId, { rankStatus: 'pending', board: undefined })
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
      const current = (await db.rankGroups.toArray()).filter((group) => (group.board ?? 'red') === board).sort((a, b) => a.order - b.order)
      await db.rankGroups.bulkPut(current.filter((group) => group.order >= resolution.index).map((group) => ({ ...group, order: group.order + 1 })))
      await db.rankGroups.add({ id: createId('rank'), entryIds: [entryId], board, order: resolution.index, createdAt: new Date().toISOString() })
    }
    await db.entries.update(entryId, { rankStatus: 'ranked', board, lastRankChange: 'NEW' })
    await db.drafts.delete('active')
    const rankedGroups = (await db.rankGroups.toArray()).filter((group) => (group.board ?? 'red') === board).sort((a, b) => a.order - b.order)
    const position = rankedGroups.findIndex((group) => group.entryIds.includes(entryId)) + 1
    await addEvent('ranking_completed', { comparisonCount: resolution.comparisons })
    const placed = await db.entries.get(entryId)
    setRankingMotion({ id: Date.now(), board, entryId, fromRank: 'NEW', toRank: position })
    setCeremony({ board, rank: position, name: placed?.bestowedName || placed?.name || '新记录' })
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
      updatedAt: new Date().toISOString(),
      isDemo: false,
      rankStatus: 'pending',
    }
    try {
      await db.entries.put(entry)
      await addEvent('entry_confirmed')
      await addEvent('record_saved', { elapsedMs: Math.max(0, Date.now() - new Date(draft.startedAt).getTime()) })
      await db.drafts.delete('active')
      setFlowOpen(false)
      setCompletion({ entryId, pending: true })
    } catch (reason) {
      setError(reason instanceof Error && reason.message.includes('排名') ? reason.message : friendlyStorageError(reason))
    } finally {
      setBusy(false)
    }
  }

  const handleComparison = async (result: ComparisonResult) => {
    if (!draft?.entryId || !draft.ranking?.anchorGroupId) return
    const board = draft.targetBoard ?? 'red'
    const activeGroups = groups.filter((group) => (group.board ?? 'red') === board).sort((a, b) => a.order - b.order)
    const anchorGroup = activeGroups.find((group) => group.id === draft.ranking?.anchorGroupId)
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
      const resolution = resolveComparison(draft.ranking, activeGroups.map((group) => group.id), result)
      if (resolution.kind === 'continue') {
        await db.drafts.put({ ...draft, ranking: resolution.progress })
      } else {
        await applyPlacement(draft.entryId, resolution, board)
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : friendlyStorageError(reason))
    } finally {
      setBusy(false)
    }
  }

  const resumePending = async (entry: FoodEntry, board: RankingBoard) => {
    const activeGroups = groups.filter((group) => (group.board ?? 'red') === board).sort((a, b) => a.order - b.order)
    const result = beginRanking(activeGroups.map((group) => group.id))
    if (result.kind === 'continue') {
      await db.entries.update(entry.id, { rankStatus: 'ranking', board })
      await addEvent('board_selected')
      await db.drafts.put({
        id: 'active', step: 'compare', image: entry.image,
        fields: { name: entry.name, aiName: entry.aiName, location: entry.location, cuisine: entry.cuisine, type: entry.type, foodGroup: entry.foodGroup, diet: entry.diet, tags: entry.tags, note: entry.note, emotion: entry.emotion, occurredAt: entry.occurredAt },
        startedAt: new Date().toISOString(), entryId: entry.id, ranking: result.progress, targetBoard: board,
      })
      go('record')
      setFlowOpen(true)
    } else {
      await applyPlacement(entry.id, result, board)
    }
  }

  const moveRanking = async (board: RankingBoard, entryId: string, targetEntryId: string | undefined, fromRank: number, toRank: number) => {
    if (!targetEntryId || rankingMoveInFlight.current) return
    const source = groups.find((group) => (group.board ?? 'red') === board && group.entryIds.includes(entryId))
    const target = groups.find((group) => (group.board ?? 'red') === board && group.entryIds.includes(targetEntryId))
    if (!source || !target || source.id === target.id) return
    rankingMoveInFlight.current = true
    try {
      const visibleDelta = fromRank - toRank
      await db.transaction('rw', [db.rankGroups, db.entries], async () => {
        await db.rankGroups.bulkPut([{ ...source, board, order: target.order }, { ...target, board, order: source.order }])
        await db.entries.update(entryId, { lastRankChange: visibleDelta })
        await db.entries.update(targetEntryId, { lastRankChange: -visibleDelta })
      })
      setRankingMotion({ id: Date.now(), board, entryId, fromRank, toRank })
      triggerHaptic(toRank === 1 ? [35, 45, 80] : 24)
      setNotice(visibleDelta > 0 ? `排名上升 ${visibleDelta} 位` : `排名下降 ${Math.abs(visibleDelta)} 位`)
      if (toRank === 1) {
        const moved = entries.find((entry) => entry.id === entryId)
        setCeremony({ board, rank: 1, name: moved?.bestowedName || moved?.name || '新任榜首' })
      }
    } catch (reason) {
      setError(friendlyStorageError(reason))
    } finally {
      rankingMoveInFlight.current = false
    }
  }

  const bestowName = async (entry: FoodEntry, name: string) => {
    await db.entries.update(entry.id, { bestowedName: name, bestowedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    await addEvent('name_bestowed')
    triggerHaptic([18, 40, 24])
    setBestowTarget(null)
    setNotice('名已定')
  }

  const shareRanking = async (rankedEntries: FoodEntry[], label: string, key: string) => {
    try {
      const file = await createRankingShareFile(rankedEntries, label, key)
      const result = await shareOrDownloadRanking(file)
      await addEvent('share_generated')
      setNotice(result === 'shared' ? '分享面板已打开，可选择“存储图像”' : '排行榜图片已下载')
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : '无法生成排行榜图片。')
    }
  }

  const openPhoto = (entry: FoodEntry) => {
    setPhotoViewer({ src: entry.image, alt: entry.bestowedName || entry.name })
    void addEvent('photo_viewed')
  }

  const saveEntryContent = async (entryId: string, changes: EntryContentChanges) => {
    try {
      await updateEntryContent(entryId, changes)
      await addEvent('entry_edited')
      setNotice('档案已更新')
    } catch (reason) {
      setError(friendlyStorageError(reason))
      throw reason
    }
  }

  const openReplacementCamera = (entryId: string) => {
    setCaptureMode({ kind: 'replace', entryId })
    setCameraOpen(true)
  }

  const finishReplacement = async (entryId: string, file: File) => {
    setBusy(true)
    try {
      const image = await compressImageToWebP(file)
      await db.entries.update(entryId, { image, updatedAt: new Date().toISOString() })
      await addEvent('photo_replaced')
      setNotice('照片已替换 · 未调用 AI')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : friendlyStorageError(reason))
    } finally {
      setBusy(false)
    }
  }

  const discardDraft = async () => {
    if (draft?.entryId) await db.entries.delete(draft.entryId)
    await db.drafts.delete('active')
    setFlowOpen(false)
    beginRecordAttempt()
    setCaptureMode({ kind: 'record' })
    setCameraOpen(true)
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
    anchor.download = `taste-archive-validation-${localDateKey()}.json`
    anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  const clearData = async () => {
    if (!window.confirm('确定清空这台设备上的全部评审档案吗？此操作无法撤销。')) return
    await resetAllData()
    setCompletion(null)
    setFlowOpen(false)
    go('ranking')
  }

  if (onboarding === undefined) return <main className="loading-screen"><LoaderCircle className="spin" /><p>正在调取个人评审档案…</p></main>

  const completionEntry = completion ? entries.find((entry) => entry.id === completion.entryId) : undefined
  const selectedEntry = selectedEntryId ? entries.find((entry) => entry.id === selectedEntryId) : undefined
  const selectedGroup = selectedEntry ? groups.find((group) => group.entryIds.includes(selectedEntry.id) && (group.board ?? 'red') === (selectedEntry.board ?? 'red')) : undefined
  const selectedTopTen = selectedGroup ? groups.filter((group) => (group.board ?? 'red') === (selectedEntry?.board ?? 'red')).sort((a, b) => a.order - b.order).findIndex((group) => group.id === selectedGroup.id) < 10 : false
  const anchorGroup = draft?.ranking?.anchorGroupId ? groups.find((group) => group.id === draft.ranking?.anchorGroupId) : undefined
  const anchor = anchorGroup ? entries.find((entry) => entry.id === anchorGroup.entryIds[0]) : undefined

  let content
  if (cropCandidate) {
    content = <ImageCropper
      file={cropCandidate}
      purpose={cropMode.kind === 'replace' ? 'replace' : 'recognize'}
      onCancel={() => {
        setCropCandidate(null)
        if (cropMode.kind === 'record') {
          void db.drafts.delete('active')
          beginRecordAttempt()
          setCaptureMode({ kind: 'record' })
          setCameraOpen(true)
        }
      }}
      onConfirm={async (file) => {
        setCropCandidate(null)
        if (cropMode.kind === 'replace') await finishReplacement(cropMode.entryId, file)
        else { await addEvent('photo_cropped'); await handleFile(file) }
      }}
    />
  } else if (cameraOpen) {
    content = <CameraCapture
      onClose={() => captureMode.kind === 'replace' ? setCameraOpen(false) : go('ranking')}
      onCapture={async (file) => prepareCrop(file, captureMode)}
    />
  } else if (tab === 'record' && completion && completionEntry) {
    content = <CompletionCard entry={completionEntry} position={completion.position} pending={completion.pending} onRanking={() => go('ranking')} onAgain={() => { setCompletion(null); setFlowOpen(false); beginRecordAttempt(); setCameraOpen(true) }} />
  } else if (tab === 'record' && flowOpen && draft?.step === 'form') {
    content = <SuggestionForm draft={draft} busy={busy} onChange={updateDraftFields} onBack={() => setFlowOpen(false)} onConfirm={confirmEntry} />
  } else if (tab === 'record' && flowOpen && draft?.step === 'compare' && anchor) {
    content = <ComparisonView draft={draft} anchor={anchor} busy={busy} onDecision={handleComparison} />
  } else if (tab === 'record') {
    content = <RecordHome draft={draft} entries={entries} onStart={beginRecordAttempt} onOpenCamera={() => setCameraOpen(true)} onFile={prepareCrop} onResume={() => setFlowOpen(true)} onDiscard={discardDraft} />
  } else if (tab === 'archive') {
    content = <ArchivePage entries={entries} onDelete={handleDelete} onOpen={(entry) => setSelectedEntryId(entry.id)} onViewPhoto={openPhoto} />
  } else if (tab === 'ranking') {
    content = <RankingPage
      entries={entries}
      groups={groups}
      motion={rankingMotion}
      onResume={resumePending}
      onMove={moveRanking}
      onBestow={(entry, rank) => setBestowTarget({ entry, rank })}
      onShare={(rankedEntries, label, key) => void shareRanking(rankedEntries, label, key)}
      onOpen={(entry) => setSelectedEntryId(entry.id)}
      onViewPhoto={openPhoto}
    />
  } else {
    content = <ProfilePage entries={entries} events={events} onExport={exportEvents} onClear={clearData} onLoadDemo={() => void completeOnboarding('demo').then(() => setNotice('演示档案已载入'))} />
  }

  return (
    <div className="app-shell">
      <PwaStatus />
      {bestowTarget && <BestowCeremony entry={bestowTarget.entry} rank={bestowTarget.rank} onClose={() => setBestowTarget(null)} onConfirm={(name) => void bestowName(bestowTarget.entry, name)} />}
      {ceremony && <RankingCeremony {...ceremony} onClose={() => { setCeremony(null); go('ranking') }} />}
      {selectedEntry && !cameraOpen && !cropCandidate && <EntryDetail
        entry={selectedEntry}
        topTen={selectedTopTen}
        onClose={() => setSelectedEntryId(null)}
        onViewPhoto={() => openPhoto(selectedEntry)}
        onSave={(changes) => saveEntryContent(selectedEntry.id, changes)}
        onChooseReplacement={(file) => { if (file) void prepareCrop(file, { kind: 'replace', entryId: selectedEntry.id }) }}
        onCameraReplacement={() => openReplacementCamera(selectedEntry.id)}
        onBestow={() => {
          const rank = groups.filter((group) => (group.board ?? 'red') === (selectedEntry.board ?? 'red')).sort((a, b) => a.order - b.order).findIndex((group) => group.entryIds.includes(selectedEntry.id)) + 1
          setBestowTarget({ entry: selectedEntry, rank })
        }}
      />}
      {photoViewer && <PhotoViewer {...photoViewer} onClose={() => setPhotoViewer(null)} />}
      {notice && <div className="status-toast notice">{notice}</div>}
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <main className="page-content">{busy && !flowOpen && <div className="processing"><LoaderCircle className="spin" /><strong>{cropMode.kind === 'replace' ? '正在替换档案照片' : '正在压缩与识别照片'}</strong><span>{cropMode.kind === 'replace' ? '不会调用 AI，也不会改变当前顺位' : realAiEnabled ? '正在等待 Gemini 返回标准分类' : '公网 AI 后端未连接，将进入手动核准'}</span></div>}{content}</main>
      {!flowOpen && !completion && !cameraOpen && !cropCandidate && (
        <nav className="bottom-nav" aria-label="主要导航">
          {navItems.map((item) => {
            const Icon = item.icon
            return <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => { if (item.id === 'record') { go('record'); beginRecordAttempt(); setCaptureMode({ kind: 'record' }); setCameraOpen(true) } else go(item.id) }}><Icon /><span>{item.label}</span></button>
          })}
        </nav>
      )}
    </div>
  )
}
