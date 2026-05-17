-- CreateEnum
CREATE TYPE "MonitorStatus" AS ENUM ('up', 'down', 'unknown');

-- CreateEnum
CREATE TYPE "CheckStatus" AS ENUM ('up', 'down');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('down', 'recovery');

-- CreateTable
CREATE TABLE "monitors" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "interval_minutes" INTEGER NOT NULL,
    "is_paused" BOOLEAN NOT NULL DEFAULT false,
    "current_status" "MonitorStatus" NOT NULL DEFAULT 'unknown',
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_checked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checks" (
    "id" TEXT NOT NULL,
    "monitor_id" TEXT NOT NULL,
    "status" "CheckStatus" NOT NULL,
    "status_code" INTEGER,
    "latency_ms" INTEGER NOT NULL,
    "error" TEXT,
    "checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_events" (
    "id" TEXT NOT NULL,
    "monitor_id" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "monitors_user_id_created_at_idx" ON "monitors"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "checks_monitor_id_checked_at_idx" ON "checks"("monitor_id", "checked_at" DESC);

-- CreateIndex
CREATE INDEX "checks_checked_at_idx" ON "checks"("checked_at");

-- CreateIndex
CREATE INDEX "alert_events_monitor_id_sent_at_idx" ON "alert_events"("monitor_id", "sent_at" DESC);

-- AddForeignKey
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checks" ADD CONSTRAINT "checks_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_monitor_id_fkey" FOREIGN KEY ("monitor_id") REFERENCES "monitors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
