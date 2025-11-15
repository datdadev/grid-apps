const path = require('path');

module.exports = {
    entry: './bin/webpack-tween-bundle.js',
    mode: 'production',
    output: {
        path: path.resolve(__dirname, '../src/ext'),
        filename: 'tween.js',
        library: {
            type: 'module'
        }
    },
    experiments: {
        outputModule: true
    }
};