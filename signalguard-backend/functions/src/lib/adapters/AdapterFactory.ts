import * as admin from 'firebase-admin';
import { AlertAdapter } from './AlertAdapter';
import { SlackAdapter } from './SlackAdapter';
import { PagerDutyAdapter } from './PagerDutyAdapter';
import { DiscordAdapter } from './DiscordAdapter';

export interface ChannelRouteConfig {
  adapter: 'slack' | 'pagerduty' | 'discord';
  target: string; // e.g. '#sre-alerts', routing key, or webhook url
}

export type ChannelRoutingDoc = Record<string, ChannelRouteConfig>;

let cachedRouting: ChannelRoutingDoc | null = null;
let lastRoutingFetchTime = 0;
const ROUTING_CACHE_TTL_MS = 60 * 1000;

export async function getChannelRouting(
  firestore?: admin.firestore.Firestore
): Promise<ChannelRoutingDoc> {
  const now = Date.now();
  if (cachedRouting && now - lastRoutingFetchTime < ROUTING_CACHE_TTL_MS) {
    return cachedRouting;
  }

  try {
    const db = firestore || admin.firestore();
    const docSnap = await db.collection('config').doc('channelRouting').get();

    if (docSnap.exists) {
      cachedRouting = docSnap.data() as ChannelRoutingDoc;
      lastRoutingFetchTime = now;
      return cachedRouting;
    }
  } catch (err) {
    console.warn('[AdapterFactory] Failed to fetch channelRouting from Firestore, using default:', err);
  }

  return {};
}

export class AdapterFactory {
  static async getAdapterForService(
    service: string,
    firestore?: admin.firestore.Firestore
  ): Promise<AlertAdapter> {
    const routing = await getChannelRouting(firestore);
    const serviceRoute = routing[service] || routing['default'];

    if (!serviceRoute) {
      // Default to Slack adapter
      return new SlackAdapter();
    }

    switch (serviceRoute.adapter) {
      case 'pagerduty':
        return new PagerDutyAdapter(serviceRoute.target);
      case 'discord':
        return new DiscordAdapter(serviceRoute.target);
      case 'slack':
      default:
        return new SlackAdapter(serviceRoute.target);
    }
  }
}
