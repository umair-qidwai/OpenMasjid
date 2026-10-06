import { expect, it } from 'vitest';
import { validateSite } from '../../packages/core/src/index';
import { demo } from './support';

const program = { id: 'prayer', title: 'Prayer', description: 'Gather together', campusIds: [] };
it.each([
  ['null', null],
  ['unknown campus', [{ ...program, campusIds: ['missing'] }]],
  ['duplicate ID', [program, program]],
  ['duplicate campus', [{ ...program, campusIds: ['garden', 'garden'] }]],
  ['unknown key', [{ ...program, kind: 'service' }]],
  ['missing campusIds', [{ id: 'prayer', title: 'Prayer', description: 'Description' }]],
  ['null campusIds', [{ ...program, campusIds: null }]],
  ['bad ID', [{ ...program, id: '../bad' }]],
  ['long ID', [{ ...program, id: 'x'.repeat(65) }]],
  ['blank title', [{ ...program, title: '   ' }]],
  ['long title', [{ ...program, title: 'x'.repeat(201) }]],
  ['blank description', [{ ...program, description: ' ' }]],
  ['long description', [{ ...program, description: 'x'.repeat(10001) }]],
  ['too many programs', Array.from({ length: 501 }, (_, i) => ({ ...program, id: `program-${i}` }))],
  ['too many campuses', [{ ...program, campusIds: Array.from({ length: 21 }, (_, i) => `campus-${i}`) }]],
])('rejects programs with %s', (_label, programs) => {
  expect(() => validateSite({ ...demo(), programs })).toThrow();
});


it('requires editable content when a details page is enabled', () => {
  const programs = [{ ...program, details: { enabled: true, content: '   ' } }];
  expect(() => validateSite({ ...demo(), programs })).toThrow();
});

it.each([
  ['null services', { services: null }],
  ['null details', { programs: [{ ...program, details: null }] }],
  ['details missing enabled', { programs: [{ ...program, details: { content: '' } }] }],
  ['details missing content', { programs: [{ ...program, details: { enabled: false } }] }],
])('rejects %s instead of applying partial defaults', (_label, change) => {
  expect(() => validateSite({ ...demo(), ...change })).toThrow();
});

it('accepts campus-scoped programs and defaults old schema-v1 documents', () => {
  const legacy = validateSite(demo()) as any;
  expect(legacy.programs).toEqual([]);
  expect(legacy.services).toEqual([]);

  const programs = [
    { id: 'prayer', title: 'Prayer', description: 'Gather together', campusIds: [] },
    { id: 'learning', title: 'Learning', description: 'Learn together', campusIds: ['garden'], details: { enabled: true, content: 'Weekly classes for every age.' } },
  ];
  const services = [
    { id: 'care', title: 'Care', description: 'Serve together', campusIds: ['garden', 'riverside'], details: { enabled: false, content: '' } },
  ];
  const parsed = validateSite({ ...demo(), programs, services }) as any;
  expect(parsed.programs[0].details).toEqual({ enabled: false, content: '' });
  expect(parsed.programs[1]).toEqual(programs[1]);
  expect(parsed.services).toEqual(services);
});
