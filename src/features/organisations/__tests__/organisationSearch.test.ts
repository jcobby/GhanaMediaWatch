import { filterOrganisations } from '../organisationSearch';

const list = [
  { name: 'Enjoy FM', sector: 'media' },
  { name: 'Joy News', sector: 'media' },
  { name: 'Adom TV News', sector: 'media' },
  { name: 'Electricity Company of Ghana', sector: 'utility' },
  { name: 'Ghana Water Limited', sector: 'utility' },
];

test('an empty search keeps the directory order', () => {
  expect(filterOrganisations(list, '   ')).toEqual(list);
});

test('every word must match, in any order', () => {
  expect(filterOrganisations(list, 'news adom').map((o) => o.name)).toEqual(['Adom TV News']);
});

test('names that start with the search come first', () => {
  expect(filterOrganisations(list, 'joy').map((o) => o.name)).toEqual(['Joy News', 'Enjoy FM']);
});

test('case and accents are ignored', () => {
  expect(filterOrganisations([{ name: 'Cité FM' }], 'CITE')).toHaveLength(1);
});

test('extra words, such as the sector, can be searched too', () => {
  const found = filterOrganisations(list, 'utility', (o) => o.sector).map((o) => o.name);
  expect(found).toEqual(['Electricity Company of Ghana', 'Ghana Water Limited']);
});
