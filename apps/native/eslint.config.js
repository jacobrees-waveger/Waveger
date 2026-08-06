const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

// The native app's own rules. The root config covers `packages/` only — see
// eslint.config.mjs there for why that boundary is the one worth enforcing.
module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*'] },
]);
