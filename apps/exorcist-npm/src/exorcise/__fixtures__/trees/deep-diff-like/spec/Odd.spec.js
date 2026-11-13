const dd = require('deep-diff');

describe('odd', () => {
  it('uses the full diff', () => {
    const changes = dd({ a: 1 }, { a: 2 });
    expect(changes.length).toBe(1);
  });
});
