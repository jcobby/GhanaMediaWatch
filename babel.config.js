module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // `jsxImportSource: nativewind` routes JSX through NativeWind so className
      // props are compiled into styles. Required by NativeWind v4.
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: { '@': './src' },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
      ],
      // react-native-worklets/plugin must be last. Reanimated 4 delegates its
      // worklet transform to this package.
      'react-native-worklets/plugin',
    ],
  };
};
