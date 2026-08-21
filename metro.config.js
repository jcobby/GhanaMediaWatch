const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const config = getDefaultConfig(__dirname);

// `.sql` is emitted by drizzle-kit; Metro must treat migrations as assets so
// they can be bundled and read at runtime by the migrator.
config.resolver.sourceExts.push('sql');

module.exports = withNativeWind(config, { input: './global.css' });
