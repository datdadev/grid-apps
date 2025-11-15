const path = require('path');

module.exports = {
    entry: './bin/webpack-manifold-bundle.js',
    mode: 'production',
    output: {
        path: path.resolve(__dirname, '../src/ext'),
        filename: 'manifold.js',
        library: {
            type: 'module'
        }
    },
    experiments: {
        outputModule: true
    }
};