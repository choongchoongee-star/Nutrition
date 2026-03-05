const { getDefaultConfig } = require('expo/metrobundler-config');

const config = getDefaultConfig(__dirname);

// GitHub Pages의 서브디렉토리 경로를 명시적으로 설정
config.transformer.publicPath = '/Nutrition/';

module.exports = config;
