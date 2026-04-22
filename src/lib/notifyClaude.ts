// ============================================================
// notifyClaudeOfEvent — שולח event לקלוד דרך Edge Function
// שימוש: לקרוא בכל פעולה משמעותית באפליקציה
// ============================================================

import { supabase } from './supabase'

export type EventType =
  | 'new_sheet'
  | 'sheet_submitted'
  | 'electrical_marked'
  | 'new_group_message'
  | 'user_joined'

export interface AppEvent {
  type:      EventType
  user: {
    id:   string
    name: string
    role: string
  }
  data:      Record<string, unknown>
  timestamp: string
}

// ──────────────────────────────────────────────
// פונקציה ראשית — שולחת event ל-Edge Function
// ──────────────────────────────────────────────
export async function notifyClaudeOfEvent(
  event: Omit<AppEvent, 'timestamp'>
): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('claude-notify', {
      body: {
        ...event,
        timestamp: new Date().toISOString(),
      },
    })

    if (error) {
      console.error('claude-notify error:', error)
    }
  } catch (err) {
    // לא נפיל את האפליקציה אם ההתראה לקלוד נכשלת
    console.warn('claude-notify failed silently:', err)
  }
}

// ──────────────────────────────────────────────
// Helpers — shortcuts לשימוש נוח בקוד
// ──────────────────────────────────────────────

export function notifyNewSheet(
  user: AppEvent['user'],
  projectName: string,
  projectId: string,
  customer?: string,
  address?: string
) {
  return notifyClaudeOfEvent({
    type: 'new_sheet',
    user,
    data: { project_name: projectName, project_id: projectId, customer, address },
  })
}

export function notifySheetSubmitted(
  user: AppEvent['user'],
  projectName: string,
  projectId: string
) {
  return notifyClaudeOfEvent({
    type: 'sheet_submitted',
    user,
    data: { project_name: projectName, project_id: projectId },
  })
}

export function notifyElectricalMarked(
  user: AppEvent['user'],
  projectName: string,
  projectId: string
) {
  return notifyClaudeOfEvent({
    type: 'electrical_marked',
    user,
    data: { project_name: projectName, project_id: projectId },
  })
}

export function notifyUserJoined(user: AppEvent['user']) {
  return notifyClaudeOfEvent({ type: 'user_joined', user, data: {} })
}
