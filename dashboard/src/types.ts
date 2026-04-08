export type Operator = 'equals' | 'not_equals' | 'contains' | 'starts_with' | 'ends_with'

export interface TargetingRule {
  attribute: string
  operator: Operator
  values: string[]
}

export interface Flag {
  key: string
  is_enabled: boolean
  rollout_percentage: number | null
  description: string | null
  rules: TargetingRule[]
}

export type FlagPatch = Partial<Omit<Flag, 'key'>>

export type UserRole = 'admin' | 'viewer'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  createdAt: string
}
