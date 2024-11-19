import { Uri, workspace, type CancellationToken, type CustomDocumentOpenContext, type CustomReadonlyEditorProvider, type WebviewPanel } from "vscode"
import { TTFDocument } from "./TTFDocument"

export class TTFEditor implements CustomReadonlyEditorProvider<TTFDocument> {

	private static readonly decoder = new TextDecoder("utf-8")

	private readonly extensionUri: Uri

	public constructor(extensionUri: Uri) {
		this.extensionUri = extensionUri
	}

	public async openCustomDocument(uri: Uri, openContext: CustomDocumentOpenContext, token: CancellationToken): Promise<TTFDocument> {
		return new TTFDocument(uri, new Uint8Array(await workspace.fs.readFile(uri)))
	}

	public async resolveCustomEditor(document: TTFDocument, webviewPanel: WebviewPanel, token: CancellationToken): Promise<void> {
		const dist = Uri.joinPath(this.extensionUri, "apps/ttf-editor/dist")
		const html = TTFEditor.decoder.decode(await workspace.fs.readFile(Uri.joinPath(dist, "index.html")))

		webviewPanel.webview.options = { enableScripts: true }
		webviewPanel.webview.html = html
			.replaceAll("%BASE%", `${webviewPanel.webview.asWebviewUri(dist).toString()}/`)

		webviewPanel.webview.postMessage(document.content)

		webviewPanel.onDidChangeViewState(() => {
			if (webviewPanel.visible) {
				webviewPanel.webview.postMessage(document.content)
			}
		})
	}
}
