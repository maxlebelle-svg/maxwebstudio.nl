import { ActivityLogRepository } from "../repositories/ActivityLogRepository.js";

export function logActivity(entityType, entityId, action, metadata = {}) {
  return ActivityLogRepository.create({
    entityType,
    entityId,
    action,
    performedBy: "local-admin",
    createdAt: new Date().toISOString(),
    metadata,
  });
}

export function listActivitiesForEntity(entityType, entityId) {
  return ActivityLogRepository
    .list()
    .filter((activity) => activity.entityType === entityType && String(activity.entityId) === String(entityId))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export function listRecentActivities(limit = 10) {
  return ActivityLogRepository
    .list()
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}
