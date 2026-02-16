import crypto from 'crypto';

export interface GoogleMeetProvider {
  createMeeting(params: { slotId: string; executiveId: string; ownerId: string }): Promise<string>;
}

export class SimulatedGoogleMeetProvider implements GoogleMeetProvider {
  async createMeeting(params: { slotId: string; executiveId: string; ownerId: string }): Promise<string> {
    const token = crypto
      .createHash('sha256')
      .update(`${params.slotId}:${params.executiveId}:${params.ownerId}:${crypto.randomUUID()}`)
      .digest('hex')
      .slice(0, 12);

    return `https://meet.google.com/${token.slice(0, 3)}-${token.slice(3, 7)}-${token.slice(7, 12)}`;
  }
}
