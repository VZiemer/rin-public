import type { RinVisualAsset } from './rin-assets.js';
export const androidAvatarStates = [
  'NEUTRAL',
  'SCOLDING',
  'SMUG',
  'EMBARRASSED',
  'ANGRY_POUT',
  'SURPRISED',
  'SOFT_SMILE',
  'FOCUSED',
  'TIRED',
] as const;
export const androidEmotionStates = [
  'neutral',
  'scolding',
  'smug',
  'embarrassed',
  'angry_pout',
  'surprised',
  'soft_smile',
  'focused',
  'tired',
] as const;
export const rinStates = [...androidAvatarStates] as const;
export type RinState = (typeof rinStates)[number];
export type RinPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL';
export type ToolRisk = 'READ' | 'WRITE' | 'SENSITIVE';
export type AndroidLocalTool = 'focus.start' | 'device.set_alarm' | 'device.open_alarms';
export interface AndroidLocalAction {
  type: 'LOCAL_TOOL';
  tool: AndroidLocalTool;
  payload: Record<string, unknown>;
  requiresConfirmation?: boolean | undefined;
}
export interface ConfirmationAction {
  type: 'CONFIRMATION';
  label: string;
  confirmationId: string;
}
export type RinActionDescriptor = AndroidLocalAction | ConfirmationAction;
export interface AgentOutput {
  imageName?: string | null | undefined;
  visualAsset?: RinVisualAsset | undefined;
  message: string;
  avatarState: RinState;
  priority: RinPriority;
  actions: RinActionDescriptor[];
  assistantId?: string | undefined;
}
export interface AgentToolCall {
  id: string;
  name: string;
  input: unknown;
}
export interface OwnedEntity {
  /** Internal Rin userId (system UUID). Never Cognito sub, email, phone or deviceId. */
  userId: string;
  createdAt: string;
  updatedAt: string;
}
export interface Persona extends OwnedEntity {
  name: string;
  traits: Record<string, number>;
  core: string[];
  behavior: Record<string, unknown>;
}
export interface RelationshipConfig extends OwnedEntity {
  relationship: string[];
  externalCommunication: string[];
  guidance?: string[] | undefined;
  boundaries?: Record<string, unknown> | undefined;
  relationshipType?: string | undefined;
  assistant?: string | undefined;
}
export interface UserProfile extends OwnedEntity {
  grammaticalGender?: 'masculine' | 'feminine' | 'neutral' | undefined;
  primaryLanguage: string;
  professionalLanguage: string;
  work: unknown[];
  technology: string[];
  workingStyle: string[];
  defaultAssistantId?: string | undefined;
}
export interface PersonRelationship extends OwnedEntity {
  id: string;
  name: string | null;
  relationship: string;
  importance: 'HIGH' | 'NORMAL';
  guidance: string[];
}
export interface Routine extends OwnedEntity {
  weekdayPatterns: string[];
  morningBriefing: string[];
  endOfDay: string[];
}
export interface Task extends OwnedEntity {
  id: string;
  title: string;
  status: 'pending' | 'completed' | 'cancelled';
  relatedPersonId?: string | undefined;
}
export interface Reminder extends OwnedEntity {
  id: string;
  title: string;
  scheduledAt?: string | undefined;
  scheduledDate?: string | undefined;
  status: 'active' | 'completed' | 'cancelled';
  relatedTaskId?: string | undefined;
  relatedPersonId?: string | undefined;
  notificationState?: Record<string, unknown> | undefined;
}
export interface ShoppingItem extends OwnedEntity {
  id: string;
  name: string;
  normalizedName: string;
}
export interface RinLiveState extends OwnedEntity {
  mood: Record<string, unknown>;
  currentInterests?: string[] | undefined;
  currentThoughts?: string[] | undefined;
  currentActivities?: string[] | undefined;
  todayEvents?: string[] | undefined;
  initiative?: Record<string, unknown> | undefined;
}
export interface RinPreferences extends OwnedEntity {
  likes?: unknown[] | undefined;
  dislikes?: unknown[] | undefined;
  hobbies?: string[] | undefined;
  recommendationTopics?: string[] | undefined;
  tastes?: Record<string, unknown> | undefined;
}
export interface RinWorldContext extends OwnedEntity {
  exchange?: unknown;
  settingsUpdatedAt?: string | undefined;
  location?: unknown;
  interests?: string[] | undefined;
  weather?: unknown;
  news?: unknown;
  dailyDigest?: unknown;
  notableEvents?: unknown[] | undefined;
  capturedAt?: string | undefined;
  validUntil?: string | undefined;
}
export interface RinEpisode extends OwnedEntity {
  id: string;
  type: string;
  summary: string;
  importance?: number | undefined;
  emotionalTone?: string | undefined;
  happenedAt?: string | undefined;
  tags?: string[] | undefined;
}
export interface MemoryEntry extends OwnedEntity {
  id: string;
  content: string;
  category: string;
}
export interface WorkingMemory extends OwnedEntity {
  conversationId: string;
  assistantId?: string | undefined;
  summary: string;
  /** Bounded recent exchanges; optional for existing summary-only records. */
  recentTurns?: WorkingMemoryTurn[] | undefined;
  expiresAt: number;
}
export interface WorkingMemoryTurn {
  message: string;
  reply: string;
  occurredAt: string;
}
export interface Device extends OwnedEntity {
  id: string;
  platform: 'android';
  pushToken: string;
  enabled: boolean;
}
export interface PendingConfirmation extends OwnedEntity {
  id: string;
  conversationId: string;
  toolCall: AgentToolCall;
  status: 'pending' | 'executing' | 'approved' | 'rejected' | 'failed';
  expiresAt: number;
}
