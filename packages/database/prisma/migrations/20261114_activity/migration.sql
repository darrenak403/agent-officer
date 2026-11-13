-- Human-readable activity so the office can say what an agent is doing without exposing IDs.
ALTER TABLE "Agent" ADD COLUMN "currentActivity" TEXT;
ALTER TABLE "Agent" ADD COLUMN "mission" TEXT;
ALTER TABLE "ToolExecution" ADD COLUMN "activity" TEXT;
