import type { CustomDocument, Uri } from "vscode"

export class TTFDocument implements CustomDocument {

	public readonly uri: Uri
	public readonly content: Uint8Array

	public constructor(uri: Uri, content: Uint8Array) {
		this.uri = uri
		this.content = content
	}

	public dispose(): void {
	}
}
