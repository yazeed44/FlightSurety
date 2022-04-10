const webpack = require('webpack');
const path = require('path');
const nodeExternals = require('webpack-node-externals')
const WebpackShellPluginNext = require('webpack-shell-plugin-next');
module.exports = {
    entry: [
        'webpack/hot/poll?1000',
        './src/server/index'
    ],
    watch: true,
    target: 'node',
    externals: [nodeExternals({
        allowlist: ['webpack/hot/poll?1000']
    })],
    module: {
        rules: [{
            test: /\.js?$/,
            use: 'babel-loader',
            exclude: /node_modules/
        }]
    },
    plugins: [
        new WebpackShellPluginNext({
            onBuildEnd:{
              scripts: ['node prod/server/server.js'],
              blocking: false,
              parallel: true
            }
          }),
        new webpack.HotModuleReplacementPlugin(),
        new webpack.NoEmitOnErrorsPlugin(),
        new webpack.DefinePlugin({
            "process.env": {
                "BUILD_TARGET": 'development'
            }
        }),
    ],
    output: {
        path: path.join(__dirname, 'prod/server'),
        filename: 'server.js'
    }
}