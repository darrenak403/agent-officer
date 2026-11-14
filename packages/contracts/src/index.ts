import { z } from 'zod';

export const Runtime = z.enum(['claude_code', 'codex']);
export type Runtime = z.infer<typeof Runtime>;

export const AgentStatus = z.enum(['DISCOVERED', 'WORKING', 'WAITING', 'IDLE', 'COMPLETED', 'FAILED', 'STOPPED', 'UNKNOWN']);
export type AgentStatus = z.infer<typeof AgentStatus>;

const short = z.string().min(1).max(256);
const optionalShort = short.nullable().optional();

export const HookEvent = z.object({
  eventId: z.string().uuid(),
  schemaVersion: z.literal('1.0'),
  runtime: Runtime,
  sourceHook: z.string().min(1).max(80),
  runtimeSessionId: short,
  runtimeAgentId: optionalShort,
  agentType: optionalShort,
  turnId: optionalShort,
  toolName: optionalShort,
  toolUseId: optionalShort,
  activity: z.string().min(1).max(160).nullable().optional(),
  taskId: optionalShort,
  taskSubject: z.string().min(1).max(512).nullable().optional(),
  projectPath: z.string().max(4096).nullable().optional(),
  occurredAt: z.string().datetime().nullable().optional(),
  contextTokens: z.number().int().nonnegative().max(10_000_000).nullable().optional(),
  contextLimit: z.number().int().positive().max(10_000_000).nullable().optional(),
  model: z.string().min(1).max(80).nullable().optional(),
  mission: z.string().min(1).max(160).nullable().optional(),
  sessionTitle: z.string().min(1).max(160).nullable().optional(),
  usageInput: z.number().int().nonnegative().nullable().optional(),
  usageCacheRead: z.number().int().nonnegative().nullable().optional(),
  usageCacheWrite: z.number().int().nonnegative().nullable().optional(),
  usageOutput: z.number().int().nonnegative().nullable().optional(),
  receivedAt: z.string().datetime(),
  dedupeKey: z.string().min(1).max(128),
}).strict();
export type HookEvent = z.infer<typeof HookEvent>;

const pct = z.number().min(0).max(100).nullable();

/** Plan usage limits from the status line: percent used and when each window resets. */
export const UsageLimitsEvent = z.object({
  runtime: Runtime,
  fiveHourPct: pct, fiveHourResetsAt: z.string().datetime().nullable(),
  weekPct: pct, weekResetsAt: z.string().datetime().nullable(),
}).strict();
export type UsageLimitsEvent = z.infer<typeof UsageLimitsEvent>;

const nullableText = z.string().nullable();
const nullableTime = z.string().datetime().nullable();

export const OfficeAgentSchema = z.object({
  id: z.string(), runtimeAgentId: nullableText, name: z.string(), type: z.string(),
  status: AgentStatus, currentTool: nullableText, currentActivity: nullableText, mission: nullableText, lastSeenAt: nullableTime,
  contextTokens: z.number().int().nullable(), contextLimit: z.number().int().nullable(), model: nullableText,
  usage: z.object({ input: z.number(), cacheRead: z.number(), cacheWrite: z.number(), output: z.number() }).nullable(),
  identityConfidence: z.enum(['HIGH', 'MEDIUM', 'LOW']), parentAgentId: nullableText,
});
export type OfficeAgent = z.infer<typeof OfficeAgentSchema>;

export const OfficeSessionSchema = z.object({
  id: z.string(), runtime: Runtime, runtimeSessionId: z.string(), projectName: nullableText, title: nullableText,
  status: z.enum(['ACTIVE', 'ENDED', 'UNKNOWN']), startedAt: nullableTime,
  endedAt: nullableTime, agents: z.array(OfficeAgentSchema),
});
export type OfficeSession = z.infer<typeof OfficeSessionSchema>;

export const OfficeEventSchema = z.object({
  id: z.string(), sequence: z.string(), sourceHook: z.string(),
  receivedAt: z.string().datetime(), sessionId: nullableText,
  agentId: nullableText, toolName: nullableText,
});

export const OfficeSnapshotSchema = z.object({
  runtime: Runtime, sequence: z.string(), sessions: z.array(OfficeSessionSchema),
  tasks: z.array(z.object({ id: z.string(), sessionId: z.string(), runtimeTaskId: z.string(), subject: nullableText, status: z.string() })),
  tools: z.array(z.object({ id: z.string(), sessionId: z.string(), agentId: nullableText, toolUseId: z.string(), name: z.string(), activity: nullableText, status: z.string(), startedAt: nullableTime, endedAt: nullableTime })),
  events: z.array(OfficeEventSchema),
  limits: z.object({ fiveHourPct: pct, fiveHourResetsAt: z.string().nullable(), weekPct: pct, weekResetsAt: z.string().nullable(), updatedAt: z.string() }).nullable(),
});
export type OfficeSnapshot = z.infer<typeof OfficeSnapshotSchema>;

export const OfficeEventsResponseSchema = z.object({ runtime: Runtime, events: z.array(OfficeEventSchema) });
export type OfficeEventsResponse = z.infer<typeof OfficeEventsResponseSchema>;

/** Signed-in account and plan usage read from local files by the desktop app (never tokens). */
const limitsShape = z.object({ fiveHourPct: z.number().nullable(), fiveHourResetsAt: z.string().nullable(), weekPct: z.number().nullable(), weekResetsAt: z.string().nullable(), updatedAt: z.string() });
export const OfficeAccountsSchema = z.object({
  account: z.object({ email: z.string().nullable(), name: z.string().nullable(), organization: z.string().nullable(), plan: z.string().nullable() }).nullable(),
  limits: limitsShape.nullable(),
  estimate: z.object({ tokens: z.number(), cacheRead: z.number(), replies: z.number(), startedAt: z.string().nullable(), resetsAt: z.string().nullable() }).nullable(),
});
export type OfficeAccounts = z.infer<typeof OfficeAccountsSchema>;
