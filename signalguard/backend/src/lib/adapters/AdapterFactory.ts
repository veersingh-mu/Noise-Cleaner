import fs from 'fs';
import path from 'path';
import { AlertAdapter, AlertSendResult, IncidentAlertPayload } from './AlertAdapter.js';
import { SlackAdapter } from './SlackAdapter.js';
import { PagerDutyAdapter } from './PagerDutyAdapter.js';
import { DiscordAdapter } from './DiscordAdapter.js';

export interface ChannelConfig {
  default: string[];
  services: Record<string, string[]>;
  endpoints: {
    slack?: { enabled: boolean; webhookUrl?: string };
    pagerduty?: { enabled: boolean; routingKey?: string; endpoint?: string };
    discord?: { enabled: boolean; webhookUrl?: string };
  };
}

let activeChannelConfig: ChannelConfig;
const configPath = path.resolve(process.cwd(), 'src/config/channels.json');

const defaultChannels: ChannelConfig = {
  default: ['slack', 'discord'],
  services: {
    'payments-service': ['slack', 'pagerduty', 'discord'],
    'checkout-service': ['slack', 'pagerduty'],
    'auth-service': ['slack', 'discord'],
    'notification-worker': ['discord']
  },
  endpoints: {
    slack: { enabled: true },
    pagerduty: { enabled: true },
    discord: { enabled: true }
  }
};

function loadChannelConfig(): void {
  try {
    if (fs.existsSync(configPath)) {
      const content = fs.readFileSync(configPath, 'utf8');
      activeChannelConfig = JSON.parse(content);
    } else {
      activeChannelConfig = defaultChannels;
    }
  } catch (err: any) {
    console.warn('[AdapterFactory] Could not load channels.json, using defaults:', err.message);
    activeChannelConfig = defaultChannels;
  }
}

loadChannelConfig();

// Watch for file changes
try {
  if (fs.existsSync(configPath)) {
    fs.watch(configPath, (eventType) => {
      if (eventType === 'change') {
        console.log('[AdapterFactory] Detected file change in channels.json, reloading...');
        loadChannelConfig();
      }
    });
  }
} catch {}

export function getChannelConfig(): ChannelConfig {
  return activeChannelConfig || defaultChannels;
}

export function updateChannelConfig(cfg: ChannelConfig): void {
  activeChannelConfig = cfg;
  try {
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (err: any) {
    console.error('[AdapterFactory] Failed to save channels.json:', err.message);
  }
}

export class MultiChannelAdapter implements AlertAdapter {
  public name = 'multi-channel';
  private adapters: AlertAdapter[];

  constructor(adapters: AlertAdapter[]) {
    this.adapters = adapters;
  }

  public async send(incident: IncidentAlertPayload): Promise<AlertSendResult> {
    const results: AlertSendResult[] = [];
    for (const adapter of this.adapters) {
      try {
        const res = await adapter.send(incident);
        results.push(res);
      } catch (err: any) {
        console.error(`[MultiChannelAdapter] Failed to send via ${adapter.name}:`, err.message);
      }
    }

    const primaryRef = results[0]?.channelRef || `ref_${Date.now()}`;
    return {
      channelRef: primaryRef,
      channel: this.adapters.map(a => a.name).join('+'),
      delivered: results.some(r => r.delivered),
      notes: results.map(r => `${r.channel}:${r.channelRef}`).join(', ')
    };
  }

  public async updateThread(incident: IncidentAlertPayload, deltaCount: number, isBurst: boolean): Promise<void> {
    for (const adapter of this.adapters) {
      try {
        await adapter.updateThread(incident, deltaCount, isBurst);
      } catch (err: any) {
        console.error(`[MultiChannelAdapter] Failed to update thread via ${adapter.name}:`, err.message);
      }
    }
  }
}

export class AdapterFactory {
  public static getAdapterForService(service: string): AlertAdapter {
    const cfg = getChannelConfig();
    const targetNames = (cfg.services && cfg.services[service]) || cfg.default || ['slack', 'discord'];

    const adapters: AlertAdapter[] = [];

    for (const name of targetNames) {
      const lower = name.toLowerCase();
      if (lower === 'slack' && (cfg.endpoints.slack?.enabled ?? true)) {
        adapters.push(new SlackAdapter(cfg.endpoints.slack?.webhookUrl));
      } else if (lower === 'pagerduty' && (cfg.endpoints.pagerduty?.enabled ?? true)) {
        adapters.push(new PagerDutyAdapter(cfg.endpoints.pagerduty?.routingKey, cfg.endpoints.pagerduty?.endpoint));
      } else if (lower === 'discord' && (cfg.endpoints.discord?.enabled ?? true)) {
        adapters.push(new DiscordAdapter(cfg.endpoints.discord?.webhookUrl));
      }
    }

    if (adapters.length === 0) {
      adapters.push(new SlackAdapter());
    }

    return new MultiChannelAdapter(adapters);
  }
}
