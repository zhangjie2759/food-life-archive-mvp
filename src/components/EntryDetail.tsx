import { useEffect, useRef, useState } from 'react'
import { Camera, Check, ImagePlus, Maximize2, PenLine, X } from 'lucide-react'
import type { Emotion, FoodEntry } from '../types'

export type EntryContentChanges = Pick<FoodEntry, 'name' | 'location' | 'occurredAt' | 'cuisine' | 'tags' | 'emotion'> & Partial<Pick<FoodEntry, 'type' | 'foodGroup' | 'diet' | 'note'>>

export function EntryDetail({ entry, topTen, onClose, onViewPhoto, onSave, onChooseReplacement, onCameraReplacement, onBestow }: {
  entry: FoodEntry
  topTen: boolean
  onClose: () => void
  onViewPhoto: () => void
  onSave: (changes: EntryContentChanges) => Promise<void>
  onChooseReplacement: (file?: File) => void
  onCameraReplacement: () => void
  onBestow: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [fields, setFields] = useState<EntryContentChanges>({
    name: entry.name,
    location: entry.location,
    occurredAt: entry.occurredAt,
    cuisine: entry.cuisine,
    type: entry.type,
    foodGroup: entry.foodGroup,
    diet: entry.diet,
    tags: entry.tags,
    note: entry.note,
    emotion: entry.emotion,
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  const update = <K extends keyof EntryContentChanges>(key: K, value: EntryContentChanges[K]) => setFields((current) => ({ ...current, [key]: value }))
  const save = async () => {
    if (!fields.name.trim()) return
    setBusy(true)
    try {
      await onSave({ ...fields, name: fields.name.trim(), location: fields.location.trim() || '未记录地点', cuisine: fields.cuisine.trim() || '未分类', tags: fields.tags.map((tag) => tag.trim()).filter(Boolean) })
      setEditing(false)
    } catch {
      // The parent displays the storage error. Keep the form open for retry.
    } finally {
      setBusy(false)
    }
  }
  const emotions: Emotion[] = ['惊喜', '怀念', '满足', '踩雷', '待确认']
  return (
    <section className="entry-detail" data-testid="entry-detail" role="dialog" aria-modal="true">
      <header className="detail-topbar"><button onClick={onClose} aria-label="关闭食物档案"><X /></button><div><small>FOOD RECORD</small><strong>食物档案</strong></div><button onClick={() => setEditing((value) => !value)} aria-label="编辑食物档案"><PenLine /></button></header>
      <button className="detail-photo" onClick={onViewPhoto} aria-label={`放大${entry.bestowedName || entry.name}照片`}><img src={entry.image} alt={entry.bestowedName || entry.name} /><span><Maximize2 />点击放大</span></button>
      <div className="detail-identity"><span>NO.{entry.id.slice(-4).toUpperCase()}</span><h1>{entry.bestowedName || entry.name}</h1>{entry.bestowedName && <p>标准名称：{entry.name}</p>}</div>
      {editing ? (
        <div className="detail-edit-form">
          <label>标准名称<input data-testid="edit-name" value={fields.name} onChange={(event) => update('name', event.target.value)} /></label>
          <div className="detail-form-grid"><label>地点<input value={fields.location} onChange={(event) => update('location', event.target.value)} /></label><label>日期<input type="date" value={fields.occurredAt} onChange={(event) => update('occurredAt', event.target.value)} /></label></div>
          <div className="detail-form-grid"><label>菜系<input value={fields.cuisine} onChange={(event) => update('cuisine', event.target.value)} /></label><label>类型<input value={fields.type || ''} onChange={(event) => update('type', event.target.value)} /></label><label>食物类别<input value={fields.foodGroup || ''} onChange={(event) => update('foodGroup', event.target.value)} /></label><label>荤素<input value={fields.diet || ''} onChange={(event) => update('diet', event.target.value)} /></label></div>
          <label>标签<input data-testid="edit-tags" value={fields.tags.join('、')} onChange={(event) => update('tags', event.target.value.split(/[、,，]/).map((tag) => tag.trim()).filter(Boolean))} /></label>
          <label>备注<textarea value={fields.note || ''} onChange={(event) => update('note', event.target.value)} /></label>
          <label>情绪<select value={fields.emotion} onChange={(event) => update('emotion', event.target.value as Emotion)}>{emotions.map((emotion) => <option key={emotion}>{emotion}</option>)}</select></label>
          <div className="replace-actions"><button onClick={onCameraReplacement}><Camera />重新拍摄</button><button onClick={() => inputRef.current?.click()}><ImagePlus />从相册替换</button><input ref={inputRef} data-testid="replace-image-input" className="visually-hidden" type="file" accept="image/*" onChange={(event) => onChooseReplacement(event.currentTarget.files?.[0])} /></div>
          <p className="input-help">替换照片会重新裁剪，但不会再次调用 AI，也不会改变当前顺位。</p>
          <button className="button primary" data-testid="save-entry-edit" disabled={busy || !fields.name.trim()} onClick={() => void save()}><Check />保存档案修改</button>
        </div>
      ) : (
        <div className="detail-facts">
          <div><small>DATE</small><strong>{entry.occurredAt}</strong></div><div><small>PLACE</small><strong>{entry.location}</strong></div>
          <div><small>CLASSIFICATION</small><strong>{[entry.cuisine, entry.type, entry.foodGroup, entry.diet].filter(Boolean).join(' / ')}</strong></div>
          <div><small>MOOD</small><strong>{entry.emotion}</strong></div>
          {entry.note && <blockquote>{entry.note}</blockquote>}
          <div className="tag-row">{entry.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>
          {topTen && <button className="detail-bestow" onClick={onBestow}>{entry.bestowedName ? '重新赐名' : '此味已入十席 · 现在赐名'}</button>}
        </div>
      )}
    </section>
  )
}
