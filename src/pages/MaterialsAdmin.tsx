import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// ============================================================
// ניהול קטלוג חומרים — איציק (admin) בלבד. route: /admin/materials
// טבלה של כל הפריטים: עריכה / הוספה / מחיקה / הסתרה + הוספת קטגוריה.
// כתיבה מוגבלת ב-RLS ל-is_admin(); המסך גם עטוף RequireAdmin.
// ============================================================

const RED = '#CC0000'
const BORDER = '#e3ded7'

interface Item {
  id: string
  category_code: string
  category_name: string
  item_code: string
  name: string
  price: number
  is_default: boolean
  sort_order: number
  is_active: boolean
}

interface AddState {
  categoryMode: 'existing' | 'new'
  category_code: string
  category_name: string
  name: string
  price: string
  is_default: boolean
}

export default function MaterialsAdmin() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [flash, setFlash] = useState<string | null>(null)
  const [adding, setAdding] = useState<AddState | null>(null)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('materials_catalog')
      .select('*').order('category_code').order('sort_order')
    if (!error) setItems((data ?? []) as Item[])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const toast = (m: string) => { setFlash(m); setTimeout(() => setFlash(null), 1800) }

  // קטגוריות קיימות (code → name), לפי סדר הופעה
  const categories: { code: string; name: string }[] = []
  const seen = new Set<string>()
  for (const it of items) if (!seen.has(it.category_code)) { seen.add(it.category_code); categories.push({ code: it.category_code, name: it.category_name }) }

  const grouped: Record<string, Item[]> = {}
  for (const it of items) (grouped[it.category_code] ??= []).push(it)

  // עדכון שדה בודד (optimistic + DB)
  const updateItem = async (id: string, patch: Partial<Item>) => {
    setItems(prev => prev.map(x => x.id === id ? { ...x, ...patch } : x))
    const { error } = await supabase.from('materials_catalog').update(patch).eq('id', id)
    if (error) { toast('שמירה נכשלה'); load() }
  }

  const deleteItem = async (it: Item) => {
    if (!confirm(`למחוק את "${it.name}"?`)) return
    const { error } = await supabase.from('materials_catalog').delete().eq('id', it.id)
    if (error) { toast('מחיקה נכשלה'); return }
    setItems(prev => prev.filter(x => x.id !== it.id))
    toast('נמחק')
  }

  // קוד פריט הבא לקטגוריה: קידומת + מספר רץ 4 ספרות
  const nextItemCode = (code: string): string => {
    let max = 0
    for (const it of items) if (it.category_code === code) {
      const n = parseInt((it.item_code.split('-')[1] || '0'), 10)
      if (!isNaN(n) && n > max) max = n
    }
    return `${code}-${String(max + 1).padStart(4, '0')}`
  }

  const saveNew = async () => {
    if (!adding) return
    const code = adding.category_code.trim()
    const cname = adding.categoryMode === 'new'
      ? adding.category_name.trim()
      : (categories.find(c => c.code === code)?.name ?? '')
    if (!code || !cname || !adding.name.trim()) { toast('חסר קוד/שם קטגוריה או שם פריט'); return }
    const sortOrder = (grouped[code]?.length ?? 0) + 1
    const row = {
      category_code: code, category_name: cname,
      item_code: nextItemCode(code), name: adding.name.trim(),
      price: parseFloat(adding.price) || 0, is_default: adding.is_default,
      sort_order: sortOrder, is_active: true,
    }
    const { data, error } = await supabase.from('materials_catalog').insert(row).select('*').single()
    if (error || !data) { toast(`הוספה נכשלה: ${error?.message ?? ''}`); return }
    setItems(prev => [...prev, data as Item])
    setAdding(null)
    toast('נוסף')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#f0ebe4' }}>
      {/* Header */}
      <div style={{ background: RED, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={() => navigate('/admin')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fff', fontSize: 22, padding: 0, width: 30 }}>‹</button>
        <div style={{ flex: 1, color: '#fff', fontWeight: 800, fontSize: 17 }}>ניהול קטלוג חומרים</div>
        <button onClick={() => setAdding({ categoryMode: 'existing', category_code: categories[0]?.code ?? '', category_name: '', name: '', price: '', is_default: false })}
          style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', borderRadius: 8, padding: '6px 12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>＋ פריט</button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px 24px' }} className="no-scrollbar">
        {loading ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 30 }}>טוען…</div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#888', padding: 30 }}>אין פריטים בקטלוג</div>
        ) : categories.map(cat => (
          <div key={cat.code} style={{ background: '#fff', border: `1px solid ${BORDER}`, borderRadius: 12, margin: '8px 4px', overflow: 'hidden' }}>
            <div style={{ background: '#faf7f2', padding: '8px 12px', fontWeight: 800, color: RED, borderBottom: `1px solid ${BORDER}`, display: 'flex', gap: 8 }}>
              <span style={{ flex: 1 }}>{cat.name}</span>
              <span style={{ fontSize: 12, color: '#999' }}>{cat.code}</span>
            </div>
            {grouped[cat.code].map(it => (
              <div key={it.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderTop: `1px solid #f3efe9`, opacity: it.is_active ? 1 : 0.5 }}>
                <input dir="rtl" defaultValue={it.name} onBlur={e => { if (e.target.value !== it.name) updateItem(it.id, { name: e.target.value }) }}
                  style={{ flex: 1, minWidth: 0, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 8px', fontSize: 13.5, fontFamily: 'inherit', direction: 'rtl' }} />
                <input dir="rtl" inputMode="decimal" defaultValue={String(it.price)} onBlur={e => { const p = parseFloat(e.target.value) || 0; if (p !== it.price) updateItem(it.id, { price: p }) }}
                  title="מחיר" style={{ width: 60, textAlign: 'center', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '6px 4px', fontSize: 13, fontFamily: 'inherit' }} />
                <label title="ברירת מחדל" style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: 11, color: '#666', cursor: 'pointer' }}>
                  <input type="checkbox" checked={it.is_default} onChange={e => updateItem(it.id, { is_default: e.target.checked })} />ב״מ
                </label>
                <button onClick={() => updateItem(it.id, { is_active: !it.is_active })} title={it.is_active ? 'הסתר' : 'הצג'}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, padding: 2 }}>{it.is_active ? '👁' : '🚫'}</button>
                <button onClick={() => deleteItem(it)} title="מחק"
                  style={{ background: '#f7e4e4', color: RED, border: 'none', borderRadius: 6, width: 28, height: 28, cursor: 'pointer', fontWeight: 700 }}>✕</button>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Modal הוספה */}
      {adding && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setAdding(null)}>
          <div style={{ background: '#fff', width: '100%', maxWidth: 520, borderRadius: '16px 16px 0 0', padding: 16 }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 800, color: RED, fontSize: 16, marginBottom: 12 }}>הוספת פריט</div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button onClick={() => setAdding(a => a && { ...a, categoryMode: 'existing' })}
                style={tabBtn(adding.categoryMode === 'existing')}>קטגוריה קיימת</button>
              <button onClick={() => setAdding(a => a && { ...a, categoryMode: 'new', category_code: '', category_name: '' })}
                style={tabBtn(adding.categoryMode === 'new')}>＋ קטגוריה חדשה</button>
            </div>

            {adding.categoryMode === 'existing' ? (
              <select dir="rtl" value={adding.category_code} onChange={e => setAdding(a => a && { ...a, category_code: e.target.value })} style={{ ...fld, marginBottom: 10, cursor: 'pointer' }}>
                {categories.map(c => <option key={c.code} value={c.code}>{c.name} ({c.code})</option>)}
              </select>
            ) : (
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <input dir="rtl" placeholder="קוד קטגוריה (למשל בד)" value={adding.category_code} onChange={e => setAdding(a => a && { ...a, category_code: e.target.value })} style={{ ...fld, width: 130 }} />
                <input dir="rtl" placeholder="שם קטגוריה" value={adding.category_name} onChange={e => setAdding(a => a && { ...a, category_name: e.target.value })} style={{ ...fld, flex: 1 }} />
              </div>
            )}

            <input dir="rtl" placeholder="שם הפריט" value={adding.name} onChange={e => setAdding(a => a && { ...a, name: e.target.value })} style={{ ...fld, marginBottom: 10 }} />
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
              <input dir="rtl" inputMode="decimal" placeholder="מחיר" value={adding.price} onChange={e => setAdding(a => a && { ...a, price: e.target.value })} style={{ ...fld, width: 100 }} />
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 14, color: '#444', cursor: 'pointer' }}>
                <input type="checkbox" checked={adding.is_default} onChange={e => setAdding(a => a && { ...a, is_default: e.target.checked })} />ברירת מחדל
              </label>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={saveNew} style={{ flex: 1, background: RED, color: '#fff', border: 'none', borderRadius: 8, padding: 12, fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>שמור</button>
              <button onClick={() => setAdding(null)} style={{ background: '#eee', color: '#444', border: 'none', borderRadius: 8, padding: '12px 18px', fontWeight: 700, cursor: 'pointer' }}>ביטול</button>
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
