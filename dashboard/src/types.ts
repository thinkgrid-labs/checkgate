export type Operator = 'equals' | 'not_equals' | 'contains' | 'starts_with' | 'ends_with'

export type FlagType = 'boolean' | 'string' | 'integer' | 'json'

export type FlagValue = string | number | boolean | Record<string, unknown> | null

export interface TargetingRule {
  attribute: string
  operator: Operator
  values: string[]
  variant?: FlagValue
}

export interface Flag {
  key: string
  is_enabled: boolean
  rollout_percentage: number | null
  description: string | null
  rules: TargetingRule[]
  flag_type?: FlagType
  default_value?: FlagValue
  disabled_value?: FlagValue
}

export type FlagPatch = Partial<Omit<Flag, 'key'>>

export interface Impression {
  id: number
  flag_key: string
  user_id: string | null
  value: string
  context: Record<string, unknown> | null
  evaluated_at: string
}

export interface ImpressionListResponse {
  items: Impression[]
  total: number
}

export interface ImpressionStats {
  flag_key: string
  total: number
  true_count: number
  false_count: number
  unique_users: number
  last_seen: string | null
}

export type UserRole = 'admin' | 'editor' | 'viewer'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  createdAt: string
}

export interface Project {
  id: string
  name: string
  slug: string
  environment_count?: number
  member_count?: number
  created_at: string
}

export interface ProjectMember {
  user_id: number
  name: string
  email: string
  role: UserRole
}

export interface SdkKeyInfo {
  id: number
  name: string
  prefix: string
  environment_id: string
  environment_name: string
  created_at: string
}
