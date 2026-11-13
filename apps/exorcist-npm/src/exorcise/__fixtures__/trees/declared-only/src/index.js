// Declares a dependency in package.json but never imports it.
module.exports = function hello() {
  return 'hello';
};
