-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Project" (
    "id" UUID NOT NULL,
    "rootPath" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "runtime" TEXT NOT NULL,
    "runtimeSessionId" TEXT NOT NULL,
    "projectId" UUID,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Agent" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "parentAgentId" UUID,
    "runtimeAgentId" TEXT,
    "identityKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
    "currentTool" TEXT,
    "identityConfidence" TEXT NOT NULL DEFAULT 'LOW',
    "lastSeenAt" TIMESTAMP(3),
    "lastAppliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" UUID NOT NULL,
    "sequence" BIGSERIAL NOT NULL,
    "runtime" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "sourceHook" TEXT NOT NULL,
    "sessionId" UUID,
    "agentId" UUID,
    "toolName" TEXT,
    "occurredAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_rootPath_key" ON "Project"("rootPath");

-- CreateIndex
CREATE INDEX "Session_runtime_status_idx" ON "Session"("runtime", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Session_runtime_runtimeSessionId_key" ON "Session"("runtime", "runtimeSessionId");

-- CreateIndex
CREATE INDEX "Agent_sessionId_status_idx" ON "Agent"("sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_sessionId_identityKey_key" ON "Agent"("sessionId", "identityKey");

-- CreateIndex
CREATE UNIQUE INDEX "Event_sequence_key" ON "Event"("sequence");

-- CreateIndex
CREATE INDEX "Event_runtime_sequence_idx" ON "Event"("runtime", "sequence");

-- CreateIndex
CREATE INDEX "Event_sessionId_sequence_idx" ON "Event"("sessionId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Event_runtime_dedupeKey_key" ON "Event"("runtime", "dedupeKey");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Agent" ADD CONSTRAINT "Agent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
