import { RelativePattern, Uri, workspace, type CancellationToken, type CustomDocumentOpenContext, type CustomReadonlyEditorProvider, type Disposable, type ExtensionContext, type WebviewPanel } from "vscode"
import { TTFDocument } from "./TTFDocument"

export class TTFEditor implements CustomReadonlyEditorProvider<TTFDocument> {

	constructor(private readonly context: ExtensionContext) { }

	public async openCustomDocument(uri: Uri, openContext: CustomDocumentOpenContext, token: CancellationToken): Promise<TTFDocument> {
		return new TTFDocument(uri, await workspace.fs.readFile(uri))
	}

	public async resolveCustomEditor(document: TTFDocument, webviewPanel: WebviewPanel, token: CancellationToken): Promise<void> {

		const stack = new DisposableStack()
		webviewPanel.onDidDispose(() => stack.dispose())

		function dispose(disposable: Disposable) {
			disposable.dispose()
		}

		const dist = Uri.joinPath(this.context.extensionUri, "apps/ttf-editor/dist")

		const [basename, ...rest] = document.uri.path.split("/").reverse()
		const dirname = document.uri.with({ path: rest.reverse().join("/") })

		webviewPanel.webview.options = {
			enableScripts: true,
			localResourceRoots: [dist, dirname]
		}

		const html = new TextDecoder("utf-8")
			.decode(await workspace.fs.readFile(Uri.joinPath(dist, "index.html")))
			.replace("%BASE%", `${webviewPanel.webview.asWebviewUri(dist).toString()}/`)
			.replace("%FONTFAMILY%", document.ttf.fontFamily)

		const style = `
			<style>
			@font-face {
				font-family: "${document.ttf.fontFamily}";
				src: url("${webviewPanel.webview.asWebviewUri(document.uri)}");
			}
			</style>
		`

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
			webviewPanel.webview.html = html.replace("<!--app-head-->", style + `<!-- version: ${version++} -->`)
		}
	}
}
