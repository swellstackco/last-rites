const dd = require('deep-diff');

describe('schemas', () => {
  it('compares', () => {
    expect(dd({ _id: 'x' }, { _id: 'x' })).toBeUndefined();
    expect(dd({ '*': 1 }, { '*': 2 })).not.toBeUndefined();
  });
});
