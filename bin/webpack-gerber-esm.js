const path = require('path');

module.exports = {
    entry: './bin/webpack-gerber-bundle.js',
    mode: 'production',
    output: {
        path: path.resolve(__dirname, '../src/ext'),
        filename: 'gerber.js',
        library: {
            type: 'module'
        }
    },
    experiments: {
        outputModule: true
    }
};