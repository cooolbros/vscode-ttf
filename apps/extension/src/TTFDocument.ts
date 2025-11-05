import type { CustomDocument, Uri } from "vscode"
import { TrueTypeFont } from "./TrueType"

export class TTFDocument implements CustomDocument {

	public readonly uri: Uri
	public readonly ttf: TrueTypeFont

	public constructor(uri: Uri, content: Uint8Array) {
		this.uri = uri
		this.ttf = new TrueTypeFont(content as any)
	}

	public dispose(): void {
	}
}
