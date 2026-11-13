// @flow
import intersect from 'intersect';

export function commonIds(lists: Array<Array<string>>, big: boolean): Array<string> {
  const allIds: Array<Array<string>> = lists;
  let result: Array<string>;
  if (big) {
    result = intersect.big(allIds);
  } else {
    result = intersect(allIds);
  }
  return result;
}
