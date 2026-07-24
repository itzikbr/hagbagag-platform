import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { queryWithRetry } from '../lib/dbRetry'
import { reportClient, errDetail } from '../lib/report'

// ============================================================
// ניהול קטלוג חומרים — איציק (admin) בלבד. route: /admin/materials
// פריט: עריכה (בלחיצה) / הוספה / מחיקה / הסתרה + מספר קטלוגי + הוספת קטגוריה.
// ברירת מחדל: לכל פריט אפשר לסמן בנפרד בכל סוג עבודה (materials_defaults,
// roof_type=NULL ברמת סוג-העבודה). כתיבה מוגבלת ב-RLS ל-is_admin().
// ============================================================

const RED = '#CC0000'
const BORDER = '#e3ded7'

// סוגי העבודה — המפתח תואם ל-workTypes בדף הביצוע / materials_defaults.work_type
const WORK_TYPES: { key: string; label: string }[] = [
  { key: 'roofReplace', label: 'החלפת גג' },
  { key: 'asbestos',    label: 'החלפת אזבסט' },
  { key: 'gutters',     label: 'מרזבים' },
  { key: 'aluminum',    label: 'ציפוי אלומיניום' },
  { key: 'insulation',  label: 'בידוד' },
  { key: 'other',       label: 'אחר' },
]

interface Item {
  id: string
  category_code: string
  category_name: string
  item_code: string
  name: string
  catalog_number: string | null
  price: number
  is_default: boolean
  sort_order: number
  category_sort: number
  is_active: boolean
}

interface DefaultRow { work_type: string; roof_type: string | null; material_item_code: string }

interface Editor {
  mode: 'add' | 'edit'
  id?: string
  item_code?: string
  categoryMode: 'existing' | 'new'
  category_code: string
  category_name: string
  name: string
  catalog_number: string
  price: string
  is_active: boolean
  workTypes: Record<string, boolean>
}

export default function MaterialsAdmin() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [defaults, setDefaults] = useState<DefaultRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [saving, setSaving] = useState(false)
  // סדר קטגוריות (drag-to-reorder)
  const [order, setOrder] = useState<string[]>([])
  const [dragCode, setDragCode] = useState<string | null>(null)
  const orderRef = useRef<string[]>([])
  const draggingRef = useRef<string | null>(null)
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({})
  useEffect(() => { orderRef.current = order }, [order])

  const load = async () => {
    setLoading(true); setLoadError(false)
    try {
      const [cat, def] = await Promise.all([
        queryWithRetry<Item[]>(() => supabase.from('materials_catalog').select('*').order('category_sort').order('sort_order')),
        queryWithRetry<DefaultRow[]>(() => supabase.from('materials_defaults').select('work_type, roof_type, material_item_code')),
      ])
      setItems((cat ?? []) as Item[])
      setDefaults((def ?? []) as DefaultRow[])
    } catch (e) {
      console.error('[materials-admin] load failed:', e)
      reportClient({ where: 'materials-admin-load-failed', online: navigator.onLine, ...errDetail(e) })
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  // סדר הקטגוריות נגזר מהנתונים (שנטענים לפי category_sort)
  useEffect(() => {
    const cs = new Set<string>(); const codes: string[] = []
    for (const it of items) if (!cs.has(it.category_code)) { cs.add(it.category_code); codes.push(it.category_code) }
    setOrder(codes)
  }, [items])

  const toast = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 1800) }

  // ── גרירה לשינוי סדר קטגוריות (Pointer Events — עובד גם במגע) ──
  const onDragStart = (e: React.PointerEvent, code: string) => {
    e.preventDefault()
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch { /* noop */ }
    draggingRef.current = code
    setDragCode(code)
  }
  const onDragMove = (e: React.PointerEvent) => {
    const dragging = draggingRef.current
    if (!dragging) return
    const y = e.clientY
    let target: string | null = null
    for (const code of Object.keys(cardRefs.current)) {
      const el = cardRefs.current[code]; if (!el) continue
      const r = el.getBoundingClientRect()
      if (y >= r.top && y <= r.bottom) { target = code; break }
    }
    if (target && target !== dragging) {
      setOrder(prev => {
        const from = prev.indexOf(dragging), to = prev.indexOf(target!)
        if (from < 0 || to < 0) return prev
        const next = [...prev]; next.splice(from, 1); next.splice(to, 0, dragging)
        return next
      })
    }
  }
  const onDragEnd = async () => {
    if (!draggingRef.current) return
    draggingRef.current = null
    setDragCode(null)
    const codes = [...orderRef.current]
    try {
      for (let i = 0; i < codes.length; i++) {
        const { error } = await supabase.from('materials_catalog').update({ category_sort: i }).eq('category_code', codes[i])
        if (error) throw error
      }
      setItems(prev => prev.map(x => ({ ...x, category_sort: codes.indexOf(x.category_code) })))
      toast('הסדר נשמר')
    } catch (e) {
      console.error('[materials-admin] reorder failed:', e)
      toast('שמירת הסדר נכשלה'); load()
    }
  }

  const categories: { code: string; name: string }[] = []
  const seen = new Set<string>()
  for (const it of items) if (!seen.has(it.category_code)) { seen.add(it.category_code); categories.push({ code: it.category_code, name: it.category_name }) }

  const grouped: Record<string, Item[]> = {}
  for (const it of items) (grouped[it.category_code] ??= []).push(it)

  const catNameByCode: Record<string, string> = Object.fromEntries(categories.map(c => [c.code, c.name]))

  // item_code → סט של סוגי-עבודה שבהם הוא ברירת מחדל ברמת סוג-העבודה (roof_type NULL)
  const defWtByItem: Record<string, Set<string>> = {}
  for (const d of defaults) if (d.roof_type == null) (defWtByItem[d.material_item_code] ??= new Set()).add(d.work_type)

  const nextItemCode = (code: string): string => {
    let max = 0
    for (const it of items) if (it.category_code === code) {
      const n = parseInt((it.item_code.split('-')[1] || '0'), 10)
      if (!isNaN(n) && n > max) max = n
    }
    return `${code}-${String(max + 1).padStart(4, '0')}`
  }

  const deleteItem = async (it: Item) => {
    if (!confirm(`למחוק את "${it.name}"?`)) return
    const { error } = await supabase.from('materials_catalog').delete().eq('id', it.id)
    if (error) { toast('מחיקה נכשלה'); return }
    // ניקוי ברירות המחדל של הפריט
    await supabase.from('materials_defaults').delete().eq('material_item_code', it.item_code)
    setItems(prev => prev.filter(x => x.id !== it.id))
    setDefaults(prev => prev.filter(d => d.material_item_code !== it.item_code))
    toast('נמחק')
  }

  const toggleActive = async (it: Item) => {
    const next = !it.is_active
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, is_active: next } : x))
    const { error } = await supabase.from('materials_catalog').update({ is_active: next }).eq('id', it.id)
    if (error) { toast('שמירה נכשלה'); load() }
  }

  const openAdd = () => setEditor({
    mode: 'add', categoryMode: 'existing', category_code: categories[0]?.code ?? '',
    category_name: '', name: '', catalog_number: '', price: '', is_active: true,
    workTypes: {},
  })

  const openEdit = (it: Item) => {
    const wt: Record<string, boolean> = {}
    for (const w of defWtByItem[it.item_code] ?? []) wt[w] = true
    setEditor({
      mode: 'edit', id: it.id, item_code: it.item_code,
      categoryMode: 'existing', category_code: it.category_code, category_name: it.category_name,
      name: it.name, catalog_number: it.catalog_number ?? '', price: String(it.price),
      is_active: it.is_active, workTypes: wt,
    })
  }

  // סנכרון ברירות מחדל (roof_type NULL) של פריט מול הבחירה בעורך
  const syncDefaults = async (itemCode: string, desired: Record<string, boolean>) => {
    const current = new Set(defaults.filter(d => d.material_item_code === itemCode && d.roof_type == null).map(d => d.work_type))
    const want = new Set(WORK_TYPES.filter(w => desired[w.key]).map(w => w.key))
    const toAdd = [...want].filter(w => !current.has(w))
    const toDel = [...current].filter(w => !want.has(w))
    if (toAdd.length) {
      await supabase.from('materials_defaults').insert(
        toAdd.map(w => ({ work_type: w, material_item_code: itemCode, roof_type: null, sort_order: 0 }))
      )
    }
    for (const w of toDel) {
      await supabase.from('materials_defaults').delete()
        .eq('work_type', w).eq('material_item_code', itemCode).is('roof_type', null)
    }
  }

  const saveEditor = async () => {
    if (!editor || saving) return
    const code = editor.category_code.trim()
    const cname = editor.mode === 'add' && editor.categoryMode === 'new'
      ? editor.category_name.trim()
      : (categories.find(c => c.code === code)?.name ?? editor.category_name.trim())
    if (!code || !cname || !editor.name.trim()) { toast('חסר קוד/שם קטגוריה או שם פריט'); return }
    setSaving(true)
    try {
      const catalogNumber = editor.catalog_number.trim() || null
      const price = parseFloat(editor.price) || 0

      if (editor.mode === 'add') {
        const sortOrder = (grouped[code]?.length ?? 0) + 1
        // קטגוריה קיימת יורשת את מיקומה; קטגוריה חדשה נוספת בסוף הרשימה
        const categorySort = grouped[code]?.[0]?.category_sort ?? order.length
        const itemCode = nextItemCode(code)
        const { error } = await supabase.from('materials_catalog').insert({
          category_code: code, category_name: cname, item_code: itemCode,
          name: editor.name.trim(), catalog_number: catalogNumber, price,
          is_default: false, sort_order: sortOrder, category_sort: categorySort, is_active: true,
        })
        if (error) { toast(`הוספה נכשלה: ${error.message}`); return }
        await syncDefaults(itemCode, editor.workTypes)
        toast('נוסף')
      } else {
        const { error } = await supabase.from('materials_catalog').update({
          name: editor.name.trim(), catalog_number: catalogNumber, price, is_active: editor.is_active,
        }).eq('id', editor.id!)
        if (error) { toast(`שמירה נכשלה: ${error.message}`); return }
        await syncDefaults(editor.item_code!, editor.workTypes)
        toast('נשמר')
      }
      setEditor(null)
      await load()
    } catch (e: any) {
      console.error('[materials-admin] save failed:', e)
      toast('שמירה נכשלה: ' + (e?.message ?? 'לא ידועה'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f0ebe4' }}>
      {/* Header */}
      <div style={{ background: RED, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 22, padding: 0, width: 30 }}>‹</button>
        <div style={{ flex: 1, color: '#fff', fontWeight: 800, fontSize: 17 }}>ניהול קטלוג חומרים</div>
        <button onClick={openAdd}
          style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>＋ פריט</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px 24px' }} className="no-scrollbar">
        {loading ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 30 }}>טוען…</div>
        ) : loadError ? (
          <div style={{ textAlign: 'center', padding: 30 }}>
            <div style={{ color: RED, fontSize: 15, marginBottom: 12 }}>לא הצלחנו לטעון את הקטלוג.</div>
            <button onClick={() => load()} style={{ background: RED, color: '#fff', border: 'none', borderRadius: 20, padding: '8px 22px', fontSize: 14, cursor: 'pointer', fontWeight: 700 }}>נסה שוב</button>
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 30 }}>אין פריטים בקטלוג</div>
        ) : order.map(code => (
          <div key={code} ref={el => { cardRefs.current[code] = el }}
            style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, margin: '8px 4px', overflow: 'hidden', opacity: dragCode === code ? 0.6 : 1, boxShadow: dragCode === code ? '0 6px 16px rgba(0,0,0,0.18)' : undefined }}>
            <div style={{ background: '#faf7f2', padding: '8px 12px', fontWeight: 800, color: RED, borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 8, alignItems: 'center' }}>
              <span onPointerDown={e => onDragStart(e, code)} onPointerMove={onDragMove} onPointerUp={onDragEnd}
                title="גרור לשינוי סדר" style={{ cursor: 'grab', touchAction: 'none', color: '#c4c0b8', fontSize: 17, lineHeight: 1, userSelect: 'none', padding: '0 2px' }}>⠿</span>
              <span style={{ flex: 1 }}>{catNameByCode[code]}</span>
              <span style={{ fontSize: 12, color: '#999' }}>{code}</span>
            </div>
            {(grouped[code] ?? []).map(it => {
              const wtCount = (defWtByItem[it.item_code]?.size ?? 0)
              return (
                <div key={it.id} onClick={() => openEdit(it)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderTop: `1px solid #f3efe9`, opacity: it.is_active ? 1 : 0.5, cursor: 'pointer' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: '#222', fontWeight: 500 }}>{it.name}</div>
                    <div style={{ fontSize: 11.5, color: '#999', marginTop: 1 }}>
                      {it.catalog_number ? `מק״ט ${it.catalog_number} · ` : ''}₪{it.price}
                      {wtCount > 0 ? ` · ב״מ ב-${wtCount} סוגי עבודה` : ''}
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); toggleActive(it) }} title={it.is_active ? 'הסתר' : 'הצג'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 2 }}>{it.is_active ? '👁' : '🚫'}</button>
                  <button onClick={e => { e.stopPropagation(); deleteItem(it) }} title="מחק"
                    style={{ background: '#f7e4e4', color: RED, border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontWeight: 700 }}>✕</button>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Editor modal (add + edit) */}
      {editor && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => !saving && setEditor(null)}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 520, borderRadius: '16px 16px 0 0', padding: 16, maxHeight: '90vh', overflowY: 'auto' }} className="no-scrollbar" onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, color: RED, fontSize: 16, marginBottom: 12 }}>{editor.mode === 'add' ? 'הוספת פריט' : 'עריכת פריט'}</div>

            {editor.mode === 'add' ? (
              <>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button onClick={() => setEditor(a => a && { ...a, categoryMode: 'existing' })} style={tabBtn(editor.categoryMode === 'existing')}>קטגוריה קיימת</button>
                  <button onClick={() => setEditor(a => a && { ...a, categoryMode: 'new', category_code: '', category_name: '' })} style={tabBtn(editor.categoryMode === 'new')}>＋ קטגוריה חדשה</button>
                </div>
                {editor.categoryMode === 'existing' ? (
                  <select dir="rtl" value={editor.category_code} onChange={e => setEditor(a => a && { ...a, category_code: e.target.value })} style={{ ...fld, marginBottom: 10, cursor: 'pointer' }}>
                    {categories.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
                  </select>
                ) : (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                    <input dir="rtl" placeholder="קוד קטגוריה" value={editor.category_code} onChange={e => setEditor(a => a && { ...a, category_code: e.target.value })} style={{ ...fld, width: 130 }} />
                    <input dir="rtl" placeholder="שם קטגוריה" value={editor.category_name} onChange={e => setEditor(a => a && { ...a, category_name: e.target.value })} style={{ ...fld, flex: 1 }} />
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 12.5, color: '#999', marginBottom: 10 }}>קטגוריה: {editor.category_name} · {editor.item_code}</div>
            )}

            <input dir="rtl" placeholder="שם הפריט" value={editor.name} onChange={e => setEditor(a => a && { ...a, name: e.target.value })} style={{ ...fld, marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <input dir="rtl" placeholder="מספר קטלוגי" value={editor.catalog_number} onChange={e => setEditor(a => a && { ...a, catalog_number: e.target.value })} style={{ ...fld, flex: 1 }} />
              <input dir="rtl" inputMode="decimal" placeholder="מחיר" value={editor.price} onChange={e => setEditor(a => a && { ...a, price: e.target.value })} style={{ ...fld, width: 100 }} />
            </div>

            {/* ברירת מחדל לכל סוג עבודה */}
            <div style={{ fontSize: 13, fontWeight: 700, color: '#444', marginBottom: 6 }}>ברירת מחדל בסוגי עבודה:</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 16 }}>
              {WORK_TYPES.map(w => (
                <label key={w.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: '#333', cursor: 'pointer', background: '#faf7f2', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 10px' }}>
                  <input type="checkbox" checked={!!editor.workTypes[w.key]} onChange={e => setEditor(a => a && { ...a, workTypes: { ...a.workTypes, [w.key]: e.target.checked } })} />
                  {w.label}
                </label>
              ))}
            </div>

            {editor.mode === 'edit' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: '#444', cursor: 'pointer', marginBottom: 14 }}>
                <input type="checkbox" checked={editor.is_active} onChange={e => setEditor(a => a && { ...a, is_active: e.target.checked })} />פעיל (מוצג בדף הביצוע)
              </label>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveEditor} disabled={saving} style={{ flex: 1, background: RED, color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontWeight: 800, fontSize: 15, cursor: saving ? 'wait' : 'pointer' }}>{saving ? 'שומר…' : 'שמור'}</button>
              <button onClick={() => setEditor(null)} disabled={saving} style={{ background: '#eee', color: '#444', border: 'none', borderRadius: 8, padding: '12px 18px', fontWeight: 700, cursor: 'pointer' }}>ביטול</button>
            </div>
          </div>
        </div>
      )}

      {flash && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.82)', color: '#fff', padding: '8px 18px', borderRadius: 20, fontSize: 14, zIndex: 4000 }}>{flash}</div>
      )}
    </div>
  )
}

const fld: React.CSSProperties = { border: `1px solid ${BORDER}`, borderRadius: 8, padding: '10px 12px', fontSize: 14, fontFamily: 'inherit', outline: 'none', direction: 'rtl', width: '100%' }
function tabBtn(active: boolean): React.CSSProperties {
  return { flex: 1, background: active ? '#FFF0F0' : '#fff', border: `1px solid ${active ? '#FFBBBB' : BORDER}`, color: active ? RED : '#666', borderRadius: 8, padding: '8px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }
}
