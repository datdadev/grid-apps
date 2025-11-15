const path = require('path');

module.exports = {
    entry: './bin/webpack-earcut-bundle.js',
    mode: 'production',
    output: {
        path: path.resolve(__dirname, '../src/ext'),
        filename: 'earcut.js',
        library: {
            type: 'module'
        }
    },
    experiments: {
        outputModule: true
    }
};