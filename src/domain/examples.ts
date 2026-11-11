import type { JsonValue } from './patch';

export type Example = {
  id: string;
  title: string;
  file: string;
  description: string;
  before: JsonValue;
  after: JsonValue;
};
export const examples: Example[] = [
  {
    id: 'hearth',
    title: 'Smart home',
    file: 'hearth.config.json',
    description: 'A local assistant gains a quieter evening routine.',
    before: {
      assistant: { name: 'Hearth', wakeWord: 'hello hearth', volume: 65 },
      lights: { 'living/room': { brightness: 85, temperature: 4000 }, kitchen: { brightness: 90 } },
      routines: ['morning', 'away'],
      telemetry: true,
      timeout: 30,
    },
    after: {
      assistant: { name: 'Hearth', wakeWord: 'hey hearth', volume: 35 },
      lights: { 'living/room': { brightness: 40, temperature: 2700 }, kitchen: { brightness: 90 } },
      routines: ['morning', 'away', 'quiet-evening'],
      telemetry: false,
      timeout: '30s',
      localOnly: true,
    },
  },
  {
    id: 'service',
    title: 'API settings',
    file: 'service.config.json',
    description: 'Review a service configuration before a release.',
    before: {
      service: 'inventory-api',
      version: 1,
      retry: { attempts: 3, delayMs: 250, jitter: false },
      cache: { ttl: 60, maxEntries: 1000 },
      origins: ['http://localhost:3000'],
      legacyRoute: '/v1/stock',
      features: { 'beta~search': false, audit: null },
    },
    after: {
      service: 'inventory-api',
      version: 2,
      retry: { attempts: 5, delayMs: 500, jitter: true },
      cache: { ttl: 120, maxEntries: 5000 },
      origins: ['http://localhost:3000', 'https://example.com'],
      features: { 'beta~search': true, audit: { enabled: true, retentionDays: 30 } },
    },
  },
  {
    id: 'inventory',
    title: 'Workshop inventory',
    file: 'workshop.json',
    description: 'Inspect a small inventory migration with nested arrays.',
    before: {
      workshop: 'Bench 04',
      revision: 1,
      bins: [
        { id: 'A1', part: 'M8 washer', count: 240 },
        { id: 'A2', part: 'M8 nut', count: 180 },
        { id: 'B1', part: 'M6 bolt', count: 75 },
      ],
      reorder: { threshold: 50, contact: null },
      archived: ['old-stock'],
    },
    after: {
      workshop: 'Bench 04',
      revision: 2,
      bins: [
        { id: 'A1', part: 'M8 washer', count: 210 },
        { id: 'A2', part: 'M8 nut', count: 165 },
      ],
      reorder: { threshold: 80, enabled: true },
      archived: [],
      inspected: true,
    },
  },
];
