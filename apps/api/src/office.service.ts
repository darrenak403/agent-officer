import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HookEvent, Runtime, UsageLimitsEvent, type OfficeSnapshot } from '@office/contracts';
import { nextAgentStatus } from '@office/domain';
import { PrismaService } from './prisma.service';

@Injectable()
export class OfficeService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(raw: unknown): Promise<{ runtime: Runtime; sequence: string; duplicate: boolean }> {
    const parsed = HookEvent.safeParse(raw);
    if (!parsed.success) throw new BadRequestException('invalid event envelope');
    const event = parsed.data;
    const seenAt = new Date(event.occurredAt ?? event.receivedAt);
    try {
      return await this.prisma.$transaction(async tx => {
        const project = event.projectPath ? await tx.project.upsert({
          where: { rootPath: event.projectPath },
          create: { rootPath: event.projectPath, name: event.projectPath.split('/').filter(Boolean).at(-1) ?? event.projectPath },
          update: {},
        }) : null;
        const session = await tx.session.upsert({
          where: { runtime_runtimeSessionId: { runtime: event.runtime, runtimeSessionId: event.runtimeSessionId } },
          create: {
            runtime: event.runtime, runtimeSessionId: event.runtimeSessionId,
            projectId: project?.id, startedAt: event.sourceHook === 'SessionStart' ? seenAt : null,
            lastEventAt: seenAt, title: event.sessionTitle ?? null,
          },
          update: { ...(project ? { projectId: project.id } : {}), ...(event.sessionTitle ? { title: event.sessionTitle } : {}) },
        });

        // Hooks fired by the main thread carry no agent_id; attribute them to the session's main
        // agent so its working/resting state follows every prompt, tool and Stop, not just SessionStart.
        const isMain = !event.runtimeAgentId;
        const identityKey = event.runtimeAgentId ?? (event.sourceHook.startsWith('Subagent') ? null : '__main__');
        const agent = identityKey ? await tx.agent.upsert({
          where: { sessionId_identityKey: { sessionId: session.id, identityKey } },
          create: {
            sessionId: session.id, identityKey, runtimeAgentId: event.runtimeAgentId,
            name: isMain ? 'Main Agent' : event.agentType ?? 'Subagent',
            type: isMain ? 'MAIN' : 'SUBAGENT',
            status: 'DISCOVERED', identityConfidence: event.runtimeAgentId ? 'HIGH' : 'MEDIUM',
            lastSeenAt: seenAt,
          },
          update: {},
        }) : null;

        const task = event.taskId && ['TaskCreated', 'TaskCompleted'].includes(event.sourceHook)
          ? await tx.task.upsert({
            where: { sessionId_runtimeTaskId: { sessionId: session.id, runtimeTaskId: event.taskId } },
            create: { sessionId: session.id, runtimeTaskId: event.taskId,
              subject: event.taskSubject ?? null,
              status: event.sourceHook === 'TaskCompleted' ? 'COMPLETED' : 'PENDING',
              lastEventAt: seenAt },
            update: {},
          }) : null;

        const toolStatus = event.sourceHook === 'PostToolUseFailure' ? 'FAILED'
          : event.sourceHook === 'PostToolUse' ? (event.runtime === 'codex' ? 'FINISHED' : 'COMPLETED') : 'RUNNING';
        const tool = event.toolUseId && event.toolName && ['PreToolUse', 'PostToolUse', 'PostToolUseFailure'].includes(event.sourceHook)
          ? await tx.toolExecution.upsert({
            where: { sessionId_toolUseId: { sessionId: session.id, toolUseId: event.toolUseId } },
            create: { sessionId: session.id, agentId: agent?.id, toolUseId: event.toolUseId,
              name: event.toolName, activity: event.activity ?? null, status: toolStatus,
              startedAt: event.sourceHook === 'PreToolUse' ? seenAt : null,
              endedAt: toolStatus === 'RUNNING' ? null : seenAt, lastEventAt: seenAt },
            update: {},
          }) : null;

        const stored = await tx.event.create({ data: {
          runtime: event.runtime, dedupeKey: event.dedupeKey, sourceHook: event.sourceHook,
          sessionId: session.id, agentId: agent?.id, taskId: task?.id, toolName: event.toolName,
          occurredAt: event.occurredAt ? seenAt : null, receivedAt: new Date(event.receivedAt),
        } });

        if (!session.lastEventAt || seenAt >= session.lastEventAt) {
          await tx.session.update({ where: { id: session.id }, data: {
            lastEventAt: seenAt,
            ...(event.sourceHook === 'SessionEnd' ? { status: 'ENDED', endedAt: seenAt } : {}),
            ...(event.sourceHook === 'SessionStart' && !session.startedAt ? { startedAt: seenAt } : {}),
          } });
        }
        if (task && (!task.lastEventAt || seenAt >= task.lastEventAt)) {
          await tx.task.update({ where: { id: task.id }, data: {
            subject: event.taskSubject ?? task.subject,
            status: event.sourceHook === 'TaskCompleted' ? 'COMPLETED' : 'PENDING',
            lastEventAt: seenAt,
          } });
        }
        if (tool && seenAt >= tool.lastEventAt) {
          await tx.toolExecution.update({ where: { id: tool.id }, data: {
            status: toolStatus, endedAt: toolStatus === 'RUNNING' ? null : seenAt,
            ...(event.activity ? { activity: event.activity } : {}),
            startedAt: event.sourceHook === 'PreToolUse' ? seenAt : tool.startedAt,
            lastEventAt: seenAt,
            ...(agent && !tool.agentId ? { agentId: agent.id } : {}),
          } });
        }
        if (agent && (!agent.lastAppliedAt || seenAt >= agent.lastAppliedAt)) {
          const activeTool = await tx.toolExecution.findFirst({
            where: { agentId: agent.id, status: 'RUNNING' }, orderBy: { startedAt: 'desc' },
          });
          // Subagents inherit the description their parent wrote when delegating them.
          const mission = event.mission ?? (event.sourceHook === 'SubagentStart' && !agent.mission
            ? (await tx.toolExecution.findFirst({
              where: { sessionId: session.id, name: { in: ['Agent', 'Task'] }, status: 'RUNNING', activity: { not: null } },
              orderBy: { startedAt: 'desc' }, select: { activity: true },
            }))?.activity ?? null
            : null);
          const latestTool = event.toolUseId ? await tx.toolExecution.findUnique({
            where: { sessionId_toolUseId: { sessionId: session.id, toolUseId: event.toolUseId } }, select: { activity: true, name: true },
          }) : null;
          await tx.agent.update({ where: { id: agent.id }, data: {
            ...(mission ? { mission } : {}),
            ...(event.usageInput != null ? { usageInput: event.usageInput, usageCacheRead: event.usageCacheRead ?? 0,
              usageCacheWrite: event.usageCacheWrite ?? 0, usageOutput: event.usageOutput ?? 0 } : {}),
            ...(event.contextTokens != null ? { contextTokens: event.contextTokens, contextLimit: event.contextLimit ?? null, model: event.model ?? null } : {}),
            // The role often arrives after the first event; upgrade the generic placeholder name.
            ...(event.agentType && agent.type === 'SUBAGENT' && agent.name === 'Subagent' ? { name: event.agentType } : {}),
            // Keep the last thing done while the agent reasons or rests; a new prompt starts fresh.
            ...(event.sourceHook === 'UserPromptSubmit' ? { currentActivity: null }
              : latestTool ? { currentActivity: latestTool.activity ?? null } : {}),
            status: activeTool ? 'WORKING' : nextAgentStatus(agent.status as Parameters<typeof nextAgentStatus>[0], event.sourceHook),
            currentTool: activeTool?.name ?? null,
            lastSeenAt: seenAt, lastAppliedAt: seenAt,
          } });
        }
        return { runtime: event.runtime, sequence: stored.sequence.toString(), duplicate: false };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const existing = await this.prisma.event.findUnique({ where: { runtime_dedupeKey: { runtime: event.runtime, dedupeKey: event.dedupeKey } } });
        if (existing) return { runtime: event.runtime, sequence: existing.sequence.toString(), duplicate: true };
      }
      throw error;
    }
  }

  async saveLimits(body: unknown) {
    const l = UsageLimitsEvent.parse(body);
    const data = { fiveHourPct: l.fiveHourPct, fiveHourResetsAt: l.fiveHourResetsAt ? new Date(l.fiveHourResetsAt) : null,
      weekPct: l.weekPct, weekResetsAt: l.weekResetsAt ? new Date(l.weekResetsAt) : null };
    await this.prisma.usageLimit.upsert({ where: { runtime: l.runtime }, create: { runtime: l.runtime, ...data }, update: data });
    const latest = await this.prisma.event.findFirst({ where: { runtime: l.runtime }, orderBy: { sequence: 'desc' }, select: { sequence: true } });
    return { runtime: l.runtime, sequence: latest?.sequence.toString() ?? '0' };
  }

  async snapshot(runtime: Runtime): Promise<OfficeSnapshot> {
    const [sessions, tasks, tools, events, latest, limits] = await Promise.all([
      this.prisma.session.findMany({ where: { runtime }, include: { agents: true, project: { select: { name: true } } }, orderBy: [{ lastEventAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }], take: 50 }),
      this.prisma.task.findMany({ where: { session: { runtime } }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.prisma.toolExecution.findMany({ where: { session: { runtime } }, orderBy: { lastEventAt: 'desc' }, take: 100 }),
      this.prisma.event.findMany({ where: { runtime }, orderBy: { sequence: 'desc' }, take: 100 }),
      this.prisma.event.findFirst({ where: { runtime }, orderBy: { sequence: 'desc' }, select: { sequence: true } }),
      this.prisma.usageLimit.findUnique({ where: { runtime } }),
    ]);
    return {
      runtime, sequence: latest?.sequence.toString() ?? '0',
      sessions: sessions.map(s => ({
        id: s.id, runtime, runtimeSessionId: s.runtimeSessionId, projectName: s.project?.name ?? null, title: s.title,
        status: s.status === 'ACTIVE' && s.lastEventAt && Date.now() - s.lastEventAt.getTime() > 120000
          ? 'UNKNOWN' : s.status as 'ACTIVE' | 'ENDED' | 'UNKNOWN',
        startedAt: s.startedAt?.toISOString() ?? null,
        endedAt: s.endedAt?.toISOString() ?? null,
        agents: s.agents.map(a => ({
          id: a.id, runtimeAgentId: a.runtimeAgentId, name: a.name, type: a.type,
          status: a.status as OfficeSnapshot['sessions'][number]['agents'][number]['status'],
          currentTool: a.currentTool, currentActivity: a.currentActivity, mission: a.mission, contextTokens: a.contextTokens, contextLimit: a.contextLimit, model: a.model,
          usage: a.usageInput == null ? null : { input: a.usageInput, cacheRead: a.usageCacheRead ?? 0, cacheWrite: a.usageCacheWrite ?? 0, output: a.usageOutput ?? 0 },
          lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
          identityConfidence: a.identityConfidence as 'HIGH' | 'MEDIUM' | 'LOW',
          parentAgentId: a.parentAgentId,
        })),
      })),
      tasks: tasks.map(t => ({ id: t.id, sessionId: t.sessionId, runtimeTaskId: t.runtimeTaskId, subject: t.subject, status: t.status })),
      tools: tools.map(t => ({ id: t.id, sessionId: t.sessionId, agentId: t.agentId, toolUseId: t.toolUseId, name: t.name, activity: t.activity, status: t.status, startedAt: t.startedAt?.toISOString() ?? null, endedAt: t.endedAt?.toISOString() ?? null })),
      limits: limits ? {
        fiveHourPct: limits.fiveHourPct, fiveHourResetsAt: limits.fiveHourResetsAt?.toISOString() ?? null,
        weekPct: limits.weekPct, weekResetsAt: limits.weekResetsAt?.toISOString() ?? null, updatedAt: limits.updatedAt.toISOString(),
      } : null,
      events: events.map(e => ({
        id: e.id, sequence: e.sequence.toString(), sourceHook: e.sourceHook,
        receivedAt: e.receivedAt.toISOString(), sessionId: e.sessionId,
        agentId: e.agentId, toolName: e.toolName,
      })),
    };
  }

  async events(runtime: Runtime, after: bigint | null, sessionId?: string) {
    const rows = await this.prisma.event.findMany({
      where: { runtime, ...(sessionId ? { sessionId } : {}), ...(after !== null ? { sequence: { gt: after } } : {}) },
      orderBy: { sequence: after !== null ? 'asc' : 'desc' }, take: 200,
    });
    return { runtime, events: rows.map(e => ({ id: e.id, sequence: e.sequence.toString(), sourceHook: e.sourceHook, receivedAt: e.receivedAt.toISOString(), sessionId: e.sessionId, agentId: e.agentId, toolName: e.toolName })) };
  }
}
