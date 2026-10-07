import { expect, it } from 'vitest';
import { validateSite } from '../../packages/core/src/index';
import { demo } from './support';

const disabled = {
  enabled: false,
  title: 'Volunteer with us',
  description: 'Share your time and talents with the community.',
  mode: 'external',
  buttonLabel: 'Become a volunteer',
  externalUrl: null,
  opportunities: [],
};

it('defaults legacy schema-v1 documents to a disabled volunteer section', () => {
  expect(validateSite(demo()).volunteer).toEqual(disabled);
});

it('accepts one direct volunteer form link', () => {
  const volunteer = { ...disabled, enabled: true, externalUrl: 'https://forms.example.org/volunteer' };
  expect(validateSite({ ...demo(), volunteer }).volunteer).toEqual(volunteer);
});

it('accepts a volunteer page with multiple linked opportunities', () => {
  const volunteer = {
    ...disabled,
    enabled: true,
    mode: 'page',
    externalUrl: null,
    opportunities: [
      { id: 'sunday-school', title: 'Sunday school', description: 'Help children learn and grow each week.', buttonLabel: 'Apply for Sunday school', url: 'https://forms.example.org/sunday-school' },
      { id: 'event-team', title: 'Event team', description: 'Welcome guests and support community events.', buttonLabel: 'Join the event team', url: 'https://forms.example.org/events' },
    ],
  };
  expect(validateSite({ ...demo(), volunteer }).volunteer).toEqual(volunteer);
});

it.each([
  ['enabled direct mode without a link', { ...disabled, enabled: true }],
  ['direct mode with opportunities', { ...disabled, enabled: true, externalUrl: 'https://forms.example.org/volunteer', opportunities: [{ id: 'events', title: 'Events', description: 'Help at events.', buttonLabel: 'Apply', url: 'https://forms.example.org/events' }] }],
  ['enabled page mode without opportunities', { ...disabled, enabled: true, mode: 'page' }],
  ['page mode with an external URL', { ...disabled, enabled: true, mode: 'page', externalUrl: 'https://forms.example.org/volunteer', opportunities: [{ id: 'events', title: 'Events', description: 'Help at events.', buttonLabel: 'Apply', url: 'https://forms.example.org/events' }] }],
  ['unsafe opportunity URL', { ...disabled, enabled: true, mode: 'page', opportunities: [{ id: 'events', title: 'Events', description: 'Help at events.', buttonLabel: 'Apply', url: 'http://forms.example.org/events' }] }],
  ['duplicate opportunity IDs', { ...disabled, enabled: true, mode: 'page', opportunities: Array.from({ length: 2 }, () => ({ id: 'events', title: 'Events', description: 'Help at events.', buttonLabel: 'Apply', url: 'https://forms.example.org/events' })) }],
])('rejects %s', (_label, volunteer) => {
  expect(() => validateSite({ ...demo(), volunteer })).toThrow();
});
