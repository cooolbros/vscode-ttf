import dedent from "dedent"
import { render } from "svelte/server"
import { Disposable, RelativePattern, Uri, workspace, type CancellationToken, type CustomDocumentOpenContext, type CustomReadonlyEditorProvider, type WebviewPanel } from "vscode"
import App from "./App.svelte"
import { TTFDocument } from "./TTFDocument"

export class TTFEditor implements CustomReadonlyEditorProvider<TTFDocument> {

	public async openCustomDocument(uri: Uri, openContext: CustomDocumentOpenContext, token: CancellationToken): Promise<TTFDocument> {
		return new TTFDocument(uri, await workspace.fs.readFile(uri))
	}

	public async resolveCustomEditor(document: TTFDocument, webviewPanel: WebviewPanel, token: CancellationToken): Promise<void> {

		const stack = new DisposableStack()
		webviewPanel.onDidDispose(() => stack.dispose())

		function dispose(disposable: Disposable) {
			disposable.dispose()
		}

		const [basename, ...rest] = document.uri.path.split("/").reverse()
		const dirname = document.uri.with({ path: rest.reverse().join("/") })

		webviewPanel.webview.options = {
			localResourceRoots: [dirname]
		}

		const { head, body } = render(App, {
			props: {
				ttf: document.ttf
			}
		})

		let version = 0
		update()

		let timeout: ReturnType<typeof setTimeout>
		stack.defer(() => clearTimeout(timeout))

		const watcher = stack.adopt(workspace.createFileSystemWatcher(new RelativePattern(dirname, basename), true, false, true), dispose)
		stack.adopt(watcher.onDidChange(() => {
			clearTimeout(timeout)
			timeout = setTimeout(update, 100)
		}), dispose)

		function update() {
			webviewPanel.webview.html = dedent`
			<!DOCTYPE html>
			<html lang="en">
				<head>
					<meta charset="UTF-8">
					<meta name="viewport" content="width=device-width, initial-scale=1.0">
					<!-- version: ${version++} -->
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
}
