import fs from "fs";
import path from "path";
import request from "superagent";
import prettier from "prettier";
import { Compiler, container, WebpackPluginInstance } from "webpack";
import {
  Node,
  EmitHint,
  NewLineKind,
  forEachChild,
  ScriptTarget,
  createPrinter,
  createSourceFile,
  isEnumDeclaration,
  isInterfaceDeclaration,
  isTypeAliasDeclaration,
  SourceFile,
} from "typescript"; // Import TypeScript parser

import { properties } from "./utils";

const { ModuleFederationPlugin } = container;

export type ModuleFederationPluginOptions = ConstructorParameters<
  typeof ModuleFederationPlugin
>[0];

export interface ModuleFederationTypeScriptPluginOptions {
  dir?: string;
  path?: string;
  host?: string;
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
   * Flag.
   */
  public done: boolean = false;
  /**
   * Creates an instance of ModuleFederationTypeScriptPlugin.
   * @param options - The plugin options.
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

  /**
   * Applies the plugin instance to the webpack compiler.
   * @param compiler - The webpack compiler instance.
   */
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
          async (compilation) => {
            if (compilation.errors && compilation.errors.length > 0) {
              compilation.errors.forEach((err) => console.error(err.message));

              console.error(
                "Compilation errors found. Plugin execution stopped."
              );

              return;
            }

            if (compiler.options.mode === "development") {
              if (this.done === false) {
                await this.taskGenerateTypes(compiler);

                this.done = true;
              }
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
   * Starts the process of generating TypeScript types.
   * @param compiler - The webpack compiler instance.
   */
  public async taskGenerateTypes(compiler: Compiler) {
    /**
     * @description
     * Check if there's a exposes record.
     */
    if (properties(this.config.exposes)) {
      await this.generateTypesForExposes();
    }

    /**
     * @description
     * Check if there's a remotes record.
     */
    if (properties(this.config.remotes)) {
      await this.generateTypesForRemotes();
    }

    return 0;
  }

  public async generateTypesForRemotes() {
    const remotes = this.config.remotes;

    if (typeof remotes === "object" && this.context) {
      for (const resource in remotes) {
        const fetching = remotes as Record<string, string>;

        if (this.debug) {
          console.debug("Downloading...", fetching[resource]);
        }

        try {
          const response = await request.get(
            "http://localhost:8080/index.d.ts"
          );

          if (response.ok && this.path) {
            const dist = path.join(this.context, this.path);

            const code = response.text;

            const output = path.join(dist, "index.d.ts");

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

            fs.writeFileSync(output, code, "utf-8");
          }
        } catch (e) {
          console.error("Fail to fetch source code: ", e);
        }
      }
    }
  }

  /**
   * Generates TypeScript types for exposed modules.
   * @param compiler - The webpack compiler instance.
   */
  public async generateTypesForExposes() {
    const exposes = this.config.exposes;

    if (typeof exposes === "object" && this.context) {
      let allTypeDeclarations = "";

      for (const alias in exposes) {
        const exposing = exposes as Record<string, string>;

        const file = path.resolve(this.context, exposing[alias]);

        if (!flags.test(file)) {
          continue;
        }

        try {
          const { source } = this.analyze(file);

          if (this.debug) {
            console.log("Exposes", exposing);

            console.log("Source check", source.getFullText());
          }

          let typeDeclarations = this.extractTypeDeclarations(source);

          const component = alias.lastIndexOf("/") + 1;

          const resolve = alias.substring(component);

          const propsName = `${resolve}Props`;

          allTypeDeclarations += `declare module "${this.path}/${resolve}" {\n${typeDeclarations}\n \nconst ${resolve}: React.FunctionComponent<${propsName}>;\nexport default ${resolve};\n}\n`;
        } catch (e) {
          console.error("Fail to generate types", e);
        }
      }

      if (allTypeDeclarations) {
        const formattedTypeDeclarations = await prettier.format(
          allTypeDeclarations,
          {
            parser: "typescript",
          }
        );

        this.saveTypes("index", formattedTypeDeclarations);
      }
    }
  }

  private extractTypeDeclarations(source: SourceFile): string {
    let declarations = "";

    const printer = createPrinter({ newLine: NewLineKind.LineFeed });

    const extract = (node: Node) => {
      if (
        isInterfaceDeclaration(node) ||
        isTypeAliasDeclaration(node) ||
        isEnumDeclaration(node)
      ) {
        const result = printer.printNode(EmitHint.Unspecified, node, source);

        declarations += result + "\n\n";
      }
      forEachChild(node, extract);
    };

    forEachChild(source, extract);

    return declarations;
  }

  /**
   * Saves generated TypeScript types to a file.
   * @param alias - The alias of the module.
   * @param declare - The type declarations to be saved.
   */
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

  /**
   * Analyzes a file and extracts TypeScript code.
   * @param file - The file to be analyzed.
   * @returns An object containing the source code and the TypeScript source file.
   */
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
