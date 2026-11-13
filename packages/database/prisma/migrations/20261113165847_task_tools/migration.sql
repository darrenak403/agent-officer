-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "taskId" UUID;

-- CreateTable
CREATE TABLE "Task" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "runtimeTaskId" TEXT NOT NULL,
    "subject" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ToolExecution" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "agentId" UUID,
    "toolUseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "lastEventAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ToolExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Task_sessionId_status_idx" ON "Task"("sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Task_sessionId_runtimeTaskId_key" ON "Task"("sessionId", "runtimeTaskId");

-- CreateIndex
CREATE INDEX "ToolExecution_sessionId_status_idx" ON "ToolExecution"("sessionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ToolExecution_sessionId_toolUseId_key" ON "ToolExecution"("sessionId", "toolUseId");

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ToolExecution" ADD CONSTRAINT "ToolExecution_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
