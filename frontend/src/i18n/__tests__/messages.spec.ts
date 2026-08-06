import { describe, expect, it } from 'vitest'

import { en } from '../en'
import { es } from '../es'

function flatten(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? flatten(value as Record<string, unknown>, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )
}

describe('i18n messages', () => {
  it('es and en share the exact same key tree', () => {
    expect(flatten(es).sort()).toEqual(flatten(en).sort())
  })

  it('covers every backend error slug plus generic fallback', () => {
    const keys = flatten(es)
    for (const slug of [
      'not_authenticated', 'invalid_credentials', 'wrong_password', 'admin_only',
      'already_bootstrapped', 'username_taken', 'invite_invalid', 'user_not_found',
      'cannot_share_self', 'already_shared', 'grant_not_found', 'not_found',
      'timezone_invalid', 'password_too_long', 'generic',
      'workout_already_active', 'session_already_done', 'workout_already_finished',
      'no_active_workout', 'invalid_set_fields', 'order_invalid', 'cannot_delete_self',
      'cannot_demote_self', 'invite_not_found', 'routine_invalid', 'exercise_invalid',
      'exercise_in_use', 'muscle_group_invalid', 'muscle_group_in_use', 'slug_taken',
    ]) {
      expect(keys).toContain(`errors.${slug}`)
    }
  })
})
