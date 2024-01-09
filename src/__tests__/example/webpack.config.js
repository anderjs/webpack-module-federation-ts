const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const { ModuleFederationPlugin } = require("webpack").container;
const { ModuleFederationTypeScriptPlugin } = require("./dist/plugin");

const config = {
  name: "example",
  filename: "remoteEntry.js",
  exposes: {
    "./AudioPlayer": "./src/Component.tsx",
  },
};

/**
 * @type {import ('webpack').Configuration}
 */
const webpackConfig = {
  entry: "./src/index.js",
  output: {
    path: path.resolve(__dirname, "build"),
    filename: "app.bundle.js",
  },
  devServer: {
    static: {
      directory: path.join(__dirname, "public"),
    },
    compress: true,
    port: 9200,
  },
  mode: "development",
  devtool: "inline-source-map",
  plugins: [
    new HtmlWebpackPlugin({
      template: "./public/index.html",
    }),
    new ModuleFederationTypeScriptPlugin({
      debug: true,
      config,
    }),
    new ModuleFederationPlugin({
      ...config,
    }),
  ],
};

module.exports = webpackConfig;
