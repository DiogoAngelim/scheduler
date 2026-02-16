import { AppError, type AuthContext, type NotificationType } from '../domain/types';
import type { TransactionManager } from '../repositories/interfaces';

interface PushNotificationInput {
  type: NotificationType;
  referenceId: string;
  message: string;
}

export class NotificationService {
  constructor(private readonly txManager: TransactionManager) { }

  async pushOrRead(
    actor: AuthContext,
    userId: string,
    payload: { notifications?: PushNotificationInput[]; markReadIds?: string[] }
  ) {
    return this.txManager.runInTransaction(async (repos) => {
      if (payload.notifications && payload.notifications.length > 0) {
        if (actor.role !== 'SYSTEM') {
          throw new AppError('Only system can push notifications', 403);
        }

        await repos.notifications.createMany(
          payload.notifications.map((entry) => ({
            userId,
            type: entry.type,
            referenceId: entry.referenceId,
            message: entry.message
          }))
        );
      }

      if (payload.markReadIds && payload.markReadIds.length > 0) {
        if (actor.role !== 'SYSTEM' && actor.userId !== userId) {
          throw new AppError('Cannot mark notifications for another user', 403);
        }

        await repos.notifications.markRead(userId, payload.markReadIds);
      }

      return repos.notifications.listByUserId(userId);
    });
  }
}
