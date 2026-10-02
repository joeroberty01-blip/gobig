-- CreateIndex
CREATE INDEX "AutomationRun_ruleId_updatedAt_idx" ON "AutomationRun"("ruleId", "updatedAt");

-- CreateIndex
CREATE INDEX "ConnectEvent_day_idx" ON "ConnectEvent"("day");

-- CreateIndex
CREATE INDEX "Message_createdAt_idx" ON "Message"("createdAt");

-- CreateIndex
CREATE INDEX "NotificationDelivery_createdAt_channel_idx" ON "NotificationDelivery"("createdAt", "channel");

-- CreateIndex
CREATE INDEX "ProviderMetric_day_idx" ON "ProviderMetric"("day");

-- CreateIndex
CREATE INDEX "Report_providerId_createdAt_idx" ON "Report"("providerId", "createdAt");

-- CreateIndex
CREATE INDEX "RequestMatch_notifiedAt_idx" ON "RequestMatch"("notifiedAt");

-- CreateIndex
CREATE INDEX "RequestMatch_firstResponseAt_idx" ON "RequestMatch"("firstResponseAt");

-- CreateIndex
CREATE INDEX "Review_createdAt_idx" ON "Review"("createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_createdAt_idx" ON "ServiceRequest"("createdAt");

-- CreateIndex
CREATE INDEX "ServiceRequest_status_completedAt_idx" ON "ServiceRequest"("status", "completedAt");

-- CreateIndex
CREATE INDEX "Subscription_status_currentPeriodEnd_idx" ON "Subscription"("status", "currentPeriodEnd");

-- CreateIndex
CREATE INDEX "Trip_cancelledBy_cancelledAt_idx" ON "Trip"("cancelledBy", "cancelledAt");
