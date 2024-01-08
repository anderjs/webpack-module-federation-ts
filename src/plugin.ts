import fs from "fs";
import path from "path";
import {
  Compiler,
  container,
  Compilation,
  WebpackPluginInstance,
} from "webpack";
import parser from "@babel/parser";

import { properties } from "./utils";

const { ModuleFederationPlugin } = container;

export type ModuleFederationPluginOptions = ConstructorParameters<
  typeof ModuleFederationPlugin
>[0];

export interface ModuleFederationTypeScriptPluginOptions {
  dir?: string;
  path?: string;
  sync?: "folder" | "remote";
  config: ModuleFederationPluginOptions;
}

export class ModuleFederationTypeScriptPlugin
  implements WebpackPluginInstance
{
  /**
   * @description
    * Production build dist folder.
    */
    public dir?: string = "dist";

  /**
   * @description
   * Compiler options dev server directory.
   */
  public dist?: string;

  /**
   * @description
   * Path to extract and save types.
   */
  public path: ModuleFederationTypeScriptPluginOptions["path"] = "shared";

  /**
   * @description
   * Sync to remote or dir.
   * Dir: means that you wanna explore outside dir, or a folder, to look for a project.
   * And extract types in compilation mode.
   *
   * Remote: defaults to remote and extract where the static files are served.
   */
  public sync: ModuleFederationTypeScriptPluginOptions["sync"] = "remote";

  /**
   * @description
   * Build folder.
   */
  public build?: string;

  /**
   * @description
   * Compiler options of tsconfig.
   */
  public tsCompiler: any;

  /**
   * @description
   * Module Federation config.
   */
  public config: ModuleFederationPluginOptions;

  /**
   * @description
   * Compiler context.
   */
  public context?: Compiler["context"];

  /**
   * @description
   * Configure all options before compilation time.
   */
  constructor(options: ModuleFederationTypeScriptPluginOptions) {
    this.sync = options.sync;

    this.path = options.path;

    if (options.dir) {
      this.dir = options.dir;
    }

    this.config = options.config;
  }

  public apply(compiler: Compiler) {
    /**
     * @description
     * Obtaining dir of devServer, otherwise just get the dist folder.
     */
    if (compiler.options.devServer?.static?.directory) {
      this.dist = compiler.options.devServer?.static?.directory as string;
    }

    if (this.sync === "remote" && this.dist && this.path) {
      const ModuleFederation = compiler.options.plugins.find((plugin) => {
        return plugin?.constructor?.name === "ModuleFederationPlugin";
      });

      /**
       * @description
       * Needs to check if the ModuleFederationPlugin is included to start doing work.
       * @see https://webpack.js.org/plugins/module-federation-plugin/
       */
      if (ModuleFederation) {
        this.context = compiler.context;

        compiler.hooks.afterCompile.tap(
          "Webpack Module Federation TypeScript",
          (compilation) => {
            if (compiler.options.mode === "development") {
              this.taskGenerateTypes(compilation);
            }
          }
        );
      } else {
        throw new Error(
          "ModuleFederationPlugin Is Not Listed as Plugin. You should included as part of the configuration."
        );
      }
    }
  }


  public async analyze (file: string) {

  }

  /**
   * @description
   * Start doing async work for generated types.
   */
  public async taskGenerateTypes(compilation: Compilation) {
    /**
     * @description
     * Check if there's a exposes record.
     */
    if (properties(this.config.exposes)) {
      await this.exportTypeScriptConfig();
    }
  }

  public async exportTypeScriptConfig() {
    /**
     * @description
     * Checking that this context is declared or path.
     */
    if (this.context && this.path) {
      if (Array.isArray(this.config.exposes)) {
        const files: string [] = [];

        for (const file of this.config.exposes) {
          if (typeof file === "string") {
            const value = this.analyze(file);
          }
        }
      }
    } else {
      throw new Error("Context or path is not declared.");
    }
  }
}
