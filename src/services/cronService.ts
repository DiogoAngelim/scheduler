import { type NotificationType } from '../domain/types';
import type { ContractGateway } from '../integrations/contractGateway';
import type { TransactionManager } from '../repositories/interfaces';
import { inWindow, startOfBrazilDayUtc } from '../utils/date';

export class CronService {
  constructor(private readonly txManager: TransactionManager, private readonly contractGateway: ContractGateway) { }

  async run(now = new Date()) {
    return this.txManager.runInTransaction(async (repos) => {
      const slots = await repos.slots.listAll();
      const createdEvents: Array<{ userId: string; type: NotificationType; referenceId: string; message: string }> = [];

      for (const slot of slots.filter((slot) => slot.status === 'SCHEDULED' || slot.status === 'IN_PROGRESS')) {
        const startAt = startOfBrazilDayUtc(slot.startDate);
        const reminders = [
          { hours: 24, label: '24H' },
          { hours: 1, label: '1H' }
        ];

        for (const reminder of reminders) {
          const target = new Date(startAt.getTime() - reminder.hours * 60 * 60 * 1000);
          if (inWindow(now, target)) {
            for (const userId of [slot.ownerId, slot.executiveId]) {
              const message = `MEETING_REMINDER_${reminder.label}: Slot ${slot.slotId} starts at ${slot.startDate}. Meeting: ${slot.googleMeetLink}`;
              const exists = await repos.notifications.existsBySignature({
                userId,
                type: 'MEETING_REMINDER',
                referenceId: slot.slotId,
                message
              });

              if (!exists) {
                createdEvents.push({
                  userId,
                  type: 'MEETING_REMINDER',
                  referenceId: slot.slotId,
                  message
                });
              }
            }
          }
        }

        if (now.getTime() >= startAt.getTime() && slot.status === 'SCHEDULED') {
          await repos.slots.updateStatus(slot.slotId, 'IN_PROGRESS');
        }

        if (slot.contractDeadlineDate) {
          const deadlineAt = startOfBrazilDayUtc(slot.contractDeadlineDate);

          for (const reminder of reminders) {
            const target = new Date(deadlineAt.getTime() - reminder.hours * 60 * 60 * 1000);
            if (inWindow(now, target)) {
              for (const userId of [slot.ownerId, slot.executiveId]) {
                const message = `DEADLINE_ALERT_${reminder.label}: Contract ${slot.contractId} deadline at ${slot.contractDeadlineDate}`;
                const exists = await repos.notifications.existsBySignature({
                  userId,
                  type: 'DEADLINE_ALERT',
                  referenceId: slot.contractId,
                  message
                });

                if (!exists) {
                  createdEvents.push({
                    userId,
                    type: 'DEADLINE_ALERT',
                    referenceId: slot.contractId,
                    message
                  });
                }
              }
            }
          }

          if (now.getTime() >= deadlineAt.getTime()) {
            const resolution = await this.contractGateway.evaluateContract(slot.contractId);
            if (resolution === 'COMPLETED') {
              await repos.slots.updateStatus(slot.slotId, 'COMPLETED');
            }

            if (resolution === 'BREACHED') {
              await repos.slots.updateStatus(slot.slotId, 'CANCELED');
            }
          }
        }
      }

      if (createdEvents.length > 0) {
        await repos.notifications.createMany(createdEvents);
      }

      return { createdNotifications: createdEvents.length };
    });
  }
}
