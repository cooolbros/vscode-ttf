import { window, type ExtensionContext } from "vscode"
import { TTFEditor } from "./TTF/TTFEditor"

export function activate(context: ExtensionContext) {
	context.subscriptions.push(window.registerCustomEditorProvider("vscode-ttf.TTFEditor", new TTFEditor(context.extensionUri)))
}
