import { join } from "path"
import type { CompileOptions } from "svelte/compiler"
import type { Configuration } from "webpack"

export default {
	mode: "production",
	target: "node",
	entry: {
		extension: join(import.meta.dirname, "src/extension.ts")
	},
	output: {
		path: join(import.meta.dirname, "dist"),
		libraryTarget: "commonjs2"
	},
	externals: {
		vscode: "commonjs vscode"
	},
	resolve: {
		extensions: [".ts"]
	},
	module: {
		rules: [
			{
				test: /\.ts$/,
				use: {
					loader: "ts-loader",
					options: {
						onlyCompileBundledFiles: true
					}
				}
			},
			{
				test: /\.svelte$/,
				use: {
					loader: "svelte-loader",
					options: {
						compilerOptions: {
							generate: "server"
						} as CompileOptions
					}
				}
			}
		]
	}
} satisfies Configuration
