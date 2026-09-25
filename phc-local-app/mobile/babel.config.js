module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module-resolver', {
        root: ['./netrasetu'],
        extensions: ['.ts', '.tsx', '.js', '.jsx'],
        alias: {
          '@': './netrasetu',
        },
      }],
    ],
  };
};
