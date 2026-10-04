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


it('accepts campus-scoped programs and defaults old schema-v1 documents', () => {
  expect((validateSite(demo()) as any).programs).toEqual([]);
  const programs = [
    { id: 'prayer', title: 'Prayer', description: 'Gather together', campusIds: [] },
    { id: 'learning', title: 'Learning', description: 'Learn together', campusIds: ['garden'] },
    { id: 'care', title: 'Care', description: 'Serve together', campusIds: ['garden', 'riverside'] },
  ];
  expect((validateSite({ ...demo(), programs }) as any).programs).toEqual(programs);
});
