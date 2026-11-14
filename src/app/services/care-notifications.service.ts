import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type {
  LocalNotificationSchema,
  PendingLocalNotificationSchema,
} from '@capacitor/local-notifications';
import type { PetRecord } from '../models';

const channelId = 'petcare-care-reminders';
const historyKey = 'petcare-reminder-history';

@Injectable({ providedIn: 'root' })
export class CareNotificationsService {
  private pendingWork = Promise.resolve();
  private reminderVersion = 0;

  async refresh(owner: string, loadRecords: () => Promise<PetRecord[]>): Promise<void> {
    if (!this.supported()) return;
    this.reminderVersion++;
    const versionAtStart = this.reminderVersion;
    try {
      const records = await loadRecords();
      await this.enqueue(async () => {
        if (versionAtStart !== this.reminderVersion) return;
        await this.syncNotifications(owner, records, () => true);
      });
    } catch (error) {
      console.warn('Could not refresh phone reminders.', error);
    }
  }

  save(owner: string, record: PetRecord): Promise<void> {
    this.reminderVersion++;
    return this.enqueue(() =>
      this.syncNotifications(owner, [record], (item) => item.extra.recordId === record.id),
    );
  }

  remove(owner: string, field: 'recordId' | 'petId', id: string): Promise<void> {
    this.reminderVersion++;
    return this.enqueue(() => this.syncNotifications(owner, [], (item) => item.extra[field] === id));
  }

  clear(): Promise<void> {
    this.reminderVersion++;
    return this.enqueue(async () => {
      await LocalNotifications.cancelAll();
      await LocalNotifications.removeAllDeliveredNotifications();
      const now = Date.now();
      const history = this.readHistory(new Date(now).setHours(0, 0, 0, 0));
      for (const key of Object.keys(history)) {
        if (history[key] > now) delete history[key];
      }
      localStorage.setItem(historyKey, JSON.stringify(history));
    });
  }

  private supported(): boolean {
    return (
      Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('LocalNotifications')
    );
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    if (!this.supported()) return Promise.resolve();
    this.pendingWork = this.pendingWork.then(work).catch((error) => {
      console.warn('Could not update phone reminders.', error);
    });
    return this.pendingWork;
  }

  private async syncNotifications(
    owner: string,
    records: PetRecord[],
    inScope: (item: PendingLocalNotificationSchema) => boolean,
  ): Promise<void> {
    const { notifications: stored } = await LocalNotifications.getPending();
    const currentNotifications: PendingLocalNotificationSchema[] = [];
    const notificationsByKey = new Map<string, PendingLocalNotificationSchema>();
    let highestId = 0;

    for (const notification of stored) {
      highestId = Math.max(highestId, notification.id);
      if (notification.extra?.channel === channelId && inScope(notification)) {
        currentNotifications.push(notification);
        notificationsByKey.set(notification.extra.key, notification);
      }
    }

    const idsToKeep = new Set<number>();
    const notificationsToSchedule: LocalNotificationSchema[] = [];
    const now = Date.now();
    const startOfToday = new Date(now).setHours(0, 0, 0, 0);
    const history = this.readHistory(startOfToday);

    for (const record of records) {
      if (!record.nextDate) continue;
      for (const daysBefore of [1, 0]) {
        const at = new Date(`${record.nextDate}T09:00:00`);
        at.setDate(at.getDate() - daysBefore);
        const time = at.getTime();
        if (!Number.isFinite(time) || time < startOfToday) continue;

        const key = JSON.stringify([owner, record.id, record.nextDate, daysBefore]);
        const body = `${record.title} is due ${daysBefore ? 'tomorrow' : 'today'}.`;
        const existing = notificationsByKey.get(key);
        const timePassed = time <= now;
        if (existing && (timePassed || (existing.extra.time === time && existing.body === body))) {
          idsToKeep.add(existing.id);
          history[key] = time;
          continue;
        }
        if (timePassed && history[key] !== undefined) continue;
        highestId++;
        notificationsToSchedule.push({
          id: highestId,
          title: 'Petcare reminder',
          body,
          channelId,
          isExactNotification: false,
          schedule: { at, allowWhileIdle: true },
          extra: { channel: channelId, key, recordId: record.id, petId: record.petId, time },
        });
      }
    }

    const idsToCancel: number[] = [];
    for (const notification of currentNotifications) {
      if (idsToKeep.has(notification.id)) continue;
      idsToCancel.push(notification.id);
      if (notification.extra.time > now) {
        delete history[notification.extra.key];
      }
    }

    if (idsToCancel.length) {
      await LocalNotifications.cancel({ notifications: idsToCancel.map((id) => ({ id })) });
      await LocalNotifications.removeDeliveredNotificationsById({ ids: idsToCancel });
    }
    localStorage.setItem(historyKey, JSON.stringify(history));

    if (!notificationsToSchedule.length) return;

    let permission = await LocalNotifications.checkPermissions();
    if (permission.display === 'prompt') {
      permission = await LocalNotifications.requestPermissions();
    }
    if (permission.display !== 'granted') return;

    await LocalNotifications.createChannel({
      id: channelId,
      name: 'Care reminders',
      importance: 3,
      visibility: 0,
      vibration: true,
    });
    await LocalNotifications.schedule({ notifications: notificationsToSchedule });
    for (const notification of notificationsToSchedule) {
      history[notification.extra.key] = notification.extra.time;
    }
    localStorage.setItem(historyKey, JSON.stringify(history));
  }

  private readHistory(startOfToday: number): Record<string, number> {
    try {
      const stored: Record<string, number> = JSON.parse(localStorage.getItem(historyKey) || '{}');
      return Object.fromEntries(Object.entries(stored).filter(([, time]) => time >= startOfToday));
    } catch {
      return {};
    }
  }
}
