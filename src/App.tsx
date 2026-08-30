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
  Utensils,
  WifiOff,
  X,
} from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { CameraCapture } from './components/CameraCapture'
import { db, completeOnboarding, deleteEntry, friendlyStorageError, resetAllData } from './data/db'
import { compressImageToWebP } from './lib/image'
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
  RankGroup,
  RankingBoard,
  ValidationEvent,
  ValidationEventType,
} from './types'

type Tab = 'record' | 'archive' | 'ranking' | 'profile'

const navItems: Array<{ id: Tab; label: string; icon: typeof Home }> = [
  { id: 'ranking', label: '榜单', icon: Trophy },
  { id: 'record', label: '记录', icon: Camera },
  { id: 'archive', label: '档案', icon: Archive },
  { id: 'profile', label: '我的', icon: UserRound },
]

function getHashTab(): Tab {
  const value = window.location.hash.replace('#/', '')
  return navItems.some((item) => item.id === value) ? value as Tab : 'ranking'
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
      <p className="eyebrow">PERSONAL FOOD AUTHORITY · 试行版</p>
      <h1>你的口味，<br />由你正式裁定。</h1>
      <p className="onboarding-copy">拍照、识别、比较、入榜。这里没有大众评分，只有一套只对你本人负责的红榜与黑榜。</p>
      <div className="privacy-pill"><ShieldCheck size={17} />档案保存在本机；启用 AI 时仅上传待识别图片</div>
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
      <PageHeader eyebrow="NEW EVIDENCE" title="提交一份食物证据" description="直接拍照，或从相册调取历史照片；AI 只负责识别与分类。" />
      <button className="capture-card" onClick={() => { onStart(); onOpenCamera() }} data-testid="start-record">
        <span className="capture-icon"><Camera size={30} /></span>
        <strong>打开摄像头</strong>
        <span>实时取景 · 拍摄后进入 AI 识别</span>
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
      <button className="button secondary import-primary" onClick={() => { onStart(); fileRef.current?.click() }}>从相册上传历史照片</button>
      <p className="input-help">支持拍照与已有照片；个人排名不会交给 AI。</p>

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
      <PageHeader eyebrow="IDENTIFICATION REPORT" title={<>识别为：<span>{fields.name}</span></>} description="AI 负责降低录入成本，不替你判断好吃或难吃。" />
      <div className="quick-form">
        <label>标准名称<input data-testid="food-name" value={fields.name} onChange={(event) => { update('name', event.target.value); update('aiName', event.target.value) }} /></label>
        <div className="classification-grid">
          <label>菜系<input value={fields.cuisine} onChange={(event) => update('cuisine', event.target.value)} /></label>
          <label>类型<input data-testid="food-type" value={fields.type ?? ''} onChange={(event) => update('type', event.target.value)} /></label>
          <label>食物类别<input data-testid="food-group" value={fields.foodGroup ?? ''} onChange={(event) => update('foodGroup', event.target.value)} /></label>
          <label>食材属性<input data-testid="food-diet" value={fields.diet ?? ''} onChange={(event) => update('diet', event.target.value)} /></label>
        </div>
        <p className="ai-experiment-note"><Sparkles size={15} />{draft.providerLabel?.includes('Gemini') ? '照片已通过本机代理发送给 Gemini 识别；App 不保存云端副本。' : '当前线上版本仍使用模拟分类；接入安全后端后切换为 Gemini。'}</p>
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
        {busy ? <LoaderCircle className="spin" /> : <Check />}保存记录，吃完再排
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
        <span>第 {round} 次比较</span>
        <span>最多 4 次</span>
      </div>
      <div className="progress-track"><span style={{ width: `${round * 25}%` }} /></div>
      <PageHeader eyebrow={isBlack ? 'BLACK LIST VERDICT' : 'RED LIST VERDICT'} title={isBlack ? '哪一道更难吃？' : '哪一道更好吃？'} description="不打分，只做一次明确比较；排名之后仍可调整。" />
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
      <div className="celebration"><Check /></div>
      <p className="eyebrow">{pending ? 'EVIDENCE REGISTERED' : 'VERDICT COMPLETE'}</p>
      <h1>{pending ? '记录在册。等待正式裁定。' : `当前顺位 NO.${String(position ?? 0).padStart(2, '0')}`}</h1>
      <div className="completion-food"><img src={entry.image} alt={entry.name} /><strong>{entry.name}</strong><span>{entry.location}</span></div>
      <p>{pending ? '照片和分类已经保存。吃完后，再决定列入红榜或黑榜。' : '本次排名已经生效；顺位仍可随时复核。'}</p>
      <button className="button primary" data-testid="view-ranking" onClick={onRanking}>{pending ? '回到榜单' : '查看最新榜单'}</button>
      <button className="button secondary" onClick={onAgain}>打开摄像头，再记一道</button>
    </section>
  )
}

function ArchivePage({ entries, onDelete }: { entries: FoodEntry[]; onDelete: (entry: FoodEntry) => void }) {
  const sorted = [...entries].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
  return (
    <section>
      <PageHeader eyebrow="EVIDENCE ARCHIVE" title="在册食物档案" description={`${entries.length} 份标准化记录`} />
      {sorted.length === 0 ? <EmptyState icon={Archive} title="还没有在册档案" body="提交第一张食物照片，建立标准记录。" /> : (
        <div className="timeline" data-testid="archive-list">
          {sorted.map((entry) => (
            <article className="timeline-card" key={entry.id}>
              <img src={entry.image} alt={entry.name} />
              <div className="timeline-content">
                <div className="card-kicker"><span>{entry.occurredAt}</span>{entry.isDemo && <b>演示</b>}</div>
                <h2>{entry.name}</h2>
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

function RankingPage({ entries, groups, onResume, onMove, onBestow, onShare }: {
  entries: FoodEntry[]
  groups: RankGroup[]
  onResume: (entry: FoodEntry, board: RankingBoard) => void
  onMove: (board: RankingBoard, entryId: string, targetEntryId?: string) => void
  onBestow: (entry: FoodEntry, rank: number) => void
  onShare: (entries: FoodEntry[], label: string, key: string) => void
}) {
  const now = new Date()
  const currentMonth = now.toISOString().slice(0, 7)
  const currentYear = String(now.getFullYear())
  const [board, setBoard] = useState<RankingBoard>('red')
  const [period, setPeriod] = useState<'month' | 'year' | 'life'>('month')
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
  const first = ranked[0]?.entry
  return (
    <section data-testid="ranking-page" className={`editorial-ranking board-${board}`}>
      <header className="ranking-masthead">
        <div><span>{period === 'month' ? month.replace('-', ' / ') : period === 'year' ? year : 'LIFETIME'}</span><small>PERSONAL FOOD AUTHORITY</small></div>
        <b>PF—01</b>
      </header>
      <div className="board-switch" role="tablist" aria-label="红黑榜切换">
        <button data-testid="board-red" className={board === 'red' ? 'active' : ''} onClick={() => { setBoard('red'); setFilter('全部') }}><span>RED LIST</span>红榜</button>
        <button data-testid="board-black" className={board === 'black' ? 'active' : ''} onClick={() => { setBoard('black'); setFilter('全部') }}><span>BLACK LIST</span>黑榜</button>
      </div>
      <p className="board-definition">{board === 'red' ? '越靠前，越好吃。' : '越靠前，越难吃。只代表我的个人裁定。'}</p>
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
            return <article key={entry.id} className={`rank-row official-row rank-${rank}`}>
              <span className="rank-number">{String(rank).padStart(2, '0')}</span>
              <img src={entry.image} alt={displayName} />
              <div className="rank-copy"><strong>{displayName}</strong><small>{entry.aiName && entry.aiName !== displayName ? `AI标准名：${entry.aiName}` : [entry.cuisine, entry.foodGroup, entry.diet].filter(Boolean).join(' / ')}</small>{globalRank <= 10 && <button className="bestow-button" onClick={() => onBestow(entry, globalRank)}>{entry.bestowedName ? '重新定名' : 'TOP 10 · 赐名'}</button>}</div>
              <span className={`rank-change ${change === 'NEW' || change.startsWith('↑') ? 'up' : ''}`}>{change}</span>
              <div className="rank-adjust">
                <button disabled={index === 0} onClick={() => onMove(board, entry.id, ranked[index - 1]?.entry.id)} aria-label={`上移${entry.name}`}><ArrowUp /></button>
                <button disabled={index === ranked.length - 1} onClick={() => onMove(board, entry.id, ranked[index + 1]?.entry.id)} aria-label={`下移${entry.name}`}><ArrowDown /></button>
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
      <img src={entry.image} alt={entry.aiName || entry.name} />
      <p className="bestow-standard">AI STANDARD NAME<br /><strong>{entry.aiName || entry.name}</strong></p>
      <div className="bestow-rule" />
      <label>正式赐名<input autoFocus value={name} maxLength={24} onChange={(event) => setName(event.target.value)} placeholder="例如：凌晨两点救命牛肉面" /></label>
      <button className="bestow-confirm" disabled={!name.trim()} onClick={() => onConfirm(name.trim())}>确认定名</button>
      <small>{new Date().toISOString().slice(0, 10)} · PERSONAL FOOD AUTHORITY</small>
    </section>
  )
}

function RankingCeremony({ board, rank, name, onClose }: { board: RankingBoard; rank: number; name: string; onClose: () => void }) {
  const headline = rank === 1 ? (board === 'red' ? '榜首易主' : '最差纪录刷新') : rank <= 3 ? `正式进入 TOP ${rank}` : rank <= 10 ? '正式进入 TOP 10' : '排名已改写'
  return (
    <div className={`ranking-ceremony ${board}`} data-testid="ranking-ceremony" role="dialog" aria-modal="true">
      <div className="ceremony-rule" />
      <span>{board === 'red' ? 'RED LIST VERDICT' : 'BLACK LIST VERDICT'}</span>
      <strong className="ceremony-rank">{String(rank).padStart(2, '0')}</strong>
      <h1>{headline}</h1>
      <p>{name}</p>
      <div className="verdict-seal">{board === 'red' ? '入榜' : '定案'}</div>
      <button onClick={onClose}>查看最新榜单</button>
    </div>
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
  const saved = events.filter((event) => event.type === 'record_saved')
  const median = (values: number[]) => values.length ? [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] : null
  const medianSeconds = median(saved.flatMap((event) => event.elapsedMs === undefined ? [] : [event.elapsedMs]))
  const medianComparisons = median(completed.flatMap((event) => event.comparisonCount === undefined ? [] : [event.comparisonCount]))
  return (
    <section>
      <PageHeader eyebrow="CLASSIFICATION REPORT" title="个人样本构成" description="只统计在册记录，不提供大众口味结论。" />
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
  const draft = useLiveQuery(() => db.drafts.get('active'), [])
  const events = useLiveQuery(() => db.events.toArray(), []) ?? []
  const [tab, setTab] = useState<Tab>(getHashTab)
  const [flowOpen, setFlowOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [completion, setCompletion] = useState<{ entryId: string; position?: number; pending?: boolean } | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [bestowTarget, setBestowTarget] = useState<{ entry: FoodEntry; rank: number } | null>(null)
  const [ceremony, setCeremony] = useState<{ board: RankingBoard; rank: number; name: string } | null>(null)
  const recordStartedAt = useRef<string | null>(null)

  useEffect(() => {
    const onHash = () => setTab(getHashTab())
    window.addEventListener('hashchange', onHash)
    if (!window.location.hash) window.location.hash = '/ranking'
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  useEffect(() => {
    if (tab === 'ranking' && onboarding) void addEvent('ranking_viewed')
  }, [tab, onboarding])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), 3200)
    return () => window.clearTimeout(timer)
  }, [notice])

  const go = (next: Tab) => {
    setCompletion(null)
    setFlowOpen(false)
    setCameraOpen(false)
    window.location.hash = `/${next}`
  }

  const chooseOnboarding = async (mode: 'demo' | 'empty') => {
    await completeOnboarding(mode)
    await addEvent('onboarding_completed')
    go('ranking')
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
      const compressedBlob = await (await fetch(image)).blob()
      const compressedFile = new File([compressedBlob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp', lastModified: Date.now() })
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

  const moveRanking = async (board: RankingBoard, entryId: string, targetEntryId?: string) => {
    if (!targetEntryId) return
    const source = groups.find((group) => (group.board ?? 'red') === board && group.entryIds.includes(entryId))
    const target = groups.find((group) => (group.board ?? 'red') === board && group.entryIds.includes(targetEntryId))
    if (!source || !target || source.id === target.id) return
    try {
      const delta = source.order - target.order
      await db.transaction('rw', [db.rankGroups, db.entries], async () => {
        await db.rankGroups.bulkPut([{ ...source, board, order: target.order }, { ...target, board, order: source.order }])
        await db.entries.update(entryId, { lastRankChange: delta })
        await db.entries.update(targetEntryId, { lastRankChange: -delta })
      })
      if ('vibrate' in navigator) navigator.vibrate(18)
      setNotice(delta > 0 ? `排名上升 ${delta} 位` : `排名下降 ${Math.abs(delta)} 位`)
    } catch (reason) {
      setError(friendlyStorageError(reason))
    }
  }

  const bestowName = async (entry: FoodEntry, name: string) => {
    await db.entries.update(entry.id, { bestowedName: name, bestowedAt: new Date().toISOString(), name })
    await addEvent('name_bestowed')
    if ('vibrate' in navigator) navigator.vibrate([18, 40, 24])
    setBestowTarget(null)
    setNotice('名已定')
  }

  const shareRanking = async (rankedEntries: FoodEntry[], label: string, key: string) => {
    try {
      const file = await createRankingShareFile(rankedEntries, label, key)
      const result = await shareOrDownloadRanking(file)
      setNotice(result === 'shared' ? '分享面板已打开，可选择“存储图像”' : '排行榜图片已下载')
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === 'AbortError') return
      setError(reason instanceof Error ? reason.message : '无法生成排行榜图片。')
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
    if (!window.confirm('确定清空这台设备上的全部评审档案吗？此操作无法撤销。')) return
    await resetAllData()
    setCompletion(null)
    setFlowOpen(false)
    go('ranking')
  }

  if (onboarding === undefined) return <main className="loading-screen"><LoaderCircle className="spin" /><p>正在调取个人评审档案…</p></main>
  if (!onboarding) return <Onboarding onDone={chooseOnboarding} />

  const completionEntry = completion ? entries.find((entry) => entry.id === completion.entryId) : undefined
  const anchorGroup = draft?.ranking?.anchorGroupId ? groups.find((group) => group.id === draft.ranking?.anchorGroupId) : undefined
  const anchor = anchorGroup ? entries.find((entry) => entry.id === anchorGroup.entryIds[0]) : undefined

  let content
  if (tab === 'record' && cameraOpen) {
    content = <CameraCapture onClose={() => go('ranking')} onCapture={async (file) => { setCameraOpen(false); await handleFile(file) }} />
  } else if (tab === 'record' && completion && completionEntry) {
    content = <CompletionCard entry={completionEntry} position={completion.position} pending={completion.pending} onRanking={() => go('ranking')} onAgain={() => { setCompletion(null); setFlowOpen(false); beginRecordAttempt(); setCameraOpen(true) }} />
  } else if (tab === 'record' && flowOpen && draft?.step === 'form') {
    content = <SuggestionForm draft={draft} busy={busy} onChange={updateDraftFields} onBack={() => setFlowOpen(false)} onConfirm={confirmEntry} />
  } else if (tab === 'record' && flowOpen && draft?.step === 'compare' && anchor) {
    content = <ComparisonView draft={draft} anchor={anchor} busy={busy} onDecision={handleComparison} />
  } else if (tab === 'record') {
    content = <RecordHome draft={draft} entries={entries} onStart={beginRecordAttempt} onOpenCamera={() => setCameraOpen(true)} onFile={handleFile} onResume={() => setFlowOpen(true)} onDiscard={discardDraft} />
  } else if (tab === 'archive') {
    content = <ArchivePage entries={entries} onDelete={handleDelete} />
  } else if (tab === 'ranking') {
    content = <RankingPage
      entries={entries}
      groups={groups}
      onResume={resumePending}
      onMove={moveRanking}
      onBestow={(entry, rank) => setBestowTarget({ entry, rank })}
      onShare={(rankedEntries, label, key) => void shareRanking(rankedEntries, label, key)}
    />
  } else {
    content = <ProfilePage entries={entries} events={events} onExport={exportEvents} onClear={clearData} />
  }

  return (
    <div className="app-shell">
      <PwaStatus />
      {bestowTarget && <BestowCeremony entry={bestowTarget.entry} rank={bestowTarget.rank} onClose={() => setBestowTarget(null)} onConfirm={(name) => void bestowName(bestowTarget.entry, name)} />}
      {ceremony && <RankingCeremony {...ceremony} onClose={() => { setCeremony(null); go('ranking') }} />}
      {notice && <div className="status-toast notice">{notice}</div>}
      {error && <ErrorBanner message={error} onDismiss={() => setError('')} />}
      <main className="page-content">{busy && tab === 'record' && !flowOpen && <div className="processing"><LoaderCircle className="spin" /><strong>正在压缩与识别照片</strong><span>{realAiEnabled ? '正在等待 Gemini 返回标准分类' : '随后会显示验证版模拟分类'}</span></div>}{content}</main>
      {!flowOpen && !completion && !cameraOpen && (
        <nav className="bottom-nav" aria-label="主要导航">
          {navItems.map((item) => {
            const Icon = item.icon
            return <button key={item.id} className={tab === item.id ? 'active' : ''} onClick={() => { if (item.id === 'record') { go('record'); beginRecordAttempt(); setCameraOpen(true) } else go(item.id) }}><Icon /><span>{item.label}</span></button>
          })}
        </nav>
      )}
    </div>
  )
}
