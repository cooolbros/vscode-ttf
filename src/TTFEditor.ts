import dedent from "dedent"
import { render } from "svelte/server"
import { Uri, workspace, type CancellationToken, type CustomDocumentOpenContext, type CustomReadonlyEditorProvider, type WebviewPanel } from "vscode"
import App from "./App.svelte"
import { TTFDocument } from "./TTFDocument"

export class TTFEditor implements CustomReadonlyEditorProvider<TTFDocument> {

	public async openCustomDocument(uri: Uri, openContext: CustomDocumentOpenContext, token: CancellationToken): Promise<TTFDocument> {
		return new TTFDocument(uri, await workspace.fs.readFile(uri))
	}

	public async resolveCustomEditor(document: TTFDocument, webviewPanel: WebviewPanel, token: CancellationToken): Promise<void> {

		const [_, ...rest] = document.uri.path.split("/").reverse()
		webviewPanel.webview.options = {
			localResourceRoots: [
				document.uri.with({ path: rest.reverse().join("/") })
			]
		}

		const { head, body } = render(App, {
			props: {
				ttf: document.ttf
			}
		})

		webviewPanel.webview.html = dedent`
		<!DOCTYPE html>
		<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<style>
				@font-face {
					font-family: "${document.ttf.fontFamily}";
					src: url("${webviewPanel.webview.asWebviewUri(document.uri)}");
				}
				</style>
				${head}
			</head>
			<body>
				${body}
			</body>
		</html>`
	}
}
