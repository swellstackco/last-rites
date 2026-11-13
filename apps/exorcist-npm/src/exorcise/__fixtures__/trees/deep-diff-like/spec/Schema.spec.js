const dd = require('deep-diff');

describe('schema', () => {
  it('is unchanged', () => {
    const a = { a: 1 };
    const b = { a: 1 };
    expect(dd(a, b)).toEqual(undefined);
  });

  it('is unchanged across lines', () => {
    const a = { a: 1 };
    const b = { a: 1 };
    expect(
      dd(a, b)
    )
      .toEqual(
        undefined
      );
  });
});
