import fs from "fs";
import path from "path";
import { Compiler, container, WebpackPluginInstance } from "webpack";
import { createPrinter, createSourceFile, EmitHint, forEachChild, isEnumDeclaration, isInterfaceDeclaration, isTypeAliasDeclaration, NewLineKind, Node, ScriptTarget } from "typescript"; // Import TypeScript parser

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
  debug?: boolean;
}

export class ModuleFederationTypeScriptPlugin implements WebpackPluginInstance {
  public debug?: boolean;

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
    if (options?.path) {
      this.path = options.path;
    }

    if (options?.sync) {
      this.sync = options.sync;
    }

    if (options?.dir) {
      this.dir = options.dir;
    }

    if (options?.debug) {
      this.debug = options?.debug;
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
          () => {
            if (compiler.options.mode === "development") {
              this.taskGenerateTypes(compiler);
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

  /**
   * @description
   * Start doing async work for generated types.
   */
  public async taskGenerateTypes(compiler: Compiler) {
    /**
     * @description
     * Check if there's a exposes record.
     */
    if (properties(this.config.exposes)) {
      this.generateTypes(compiler);
    }
  }

  public async generateTypes(compiler: Compiler) {
    const exposes = this.config.exposes;

    if (typeof exposes === "object" && this.context) {
      for (const alias in exposes) {
        const exposing = exposes as Record<string, string>;

        /**
         * @description
         * File checking.
         */
        const file = path.resolve(this.context, exposing[alias]);

        /**
         * @description
         * Skipping if the file doesn't contain a TypeScript extension.
         */
        if (!flags.test(file)) {
          continue; 
        }

        try {
          const { source } = this.analyze(file);

          if (this.debug) {
            console.log("Source check", source.getFullText());
          }

          let typeDeclarations = "";

          const parse = (node: Node) => {
            if (isInterfaceDeclaration(node) || isTypeAliasDeclaration(node) || isEnumDeclaration(node)) {
              const printer = createPrinter({ newLine: NewLineKind.LineFeed });

              const result = printer.printNode(EmitHint.Unspecified, node, source);

              typeDeclarations += result + '\n\n';
            }
        
            forEachChild(node, parse);
          }
        
          forEachChild(source, parse);
        
          /**
           * @description
           * Generating types in shared folder.
           */
          this.saveTypes(alias, typeDeclarations);
        } catch (e) {
          console.error("Fail to generate types", e);
        }
      }
    }
  }

  public async saveTypes(alias: string, declare: string) {
    if (this.path && this.context) {
      const dist = path.join(this.context, this.path);

      const output = path.join(this.context, this.path, `${alias}.d.ts`);

      if (this.debug) {
        console.log("output path:", output);
      }

      try {
        const distContent = fs.readdirSync(dist);

        if (distContent) {
          if (this.debug) {
            console.debug("Content", distContent);
          }
        }
      } catch (e) {
        const shared = fs.mkdirSync(dist);

        if (this.debug) {
          console.log("Shared:", shared);
        }
      }

      fs.writeFileSync(output, declare, "utf-8");
    }
  }

  public analyze(file: string) {
    const code = fs.readFileSync(file, "utf-8");

    if (this.debug) {
      console.debug("Checking", {
        file,
        code,
      });
    }

    const source = createSourceFile(file, code, ScriptTarget.Latest, true);

    return {
      code,
      source,
    };
  }
}


const flags = new RegExp(/\.(ts|tsx)$/);