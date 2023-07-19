// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { strict } from 'assert';
import exp = require('constants');
import { stat } from 'fs';
import { type } from 'os';
import * as vscode from 'vscode';

const NOTE_MATCHER = /^[+-]\s*(?<path>.*?)\s*:\s*(?<value>.+)\s*$/;
const STATE_MATCHER = /^[>]\s*(?<path>.*?)\s*:\s*(?<value>.+)\s*$/;
const CLEAR_MATCHER = /^[-]\s*(?<path>.*?)\s*$/;

function onlyUnique<T>(value: T, index: number, array: T[]) {
	return array.indexOf(value) === index;
}

interface StateDict {
	[key: string]: StateDict | string | undefined | null;
}

export class StateProvider implements vscode.TreeDataProvider<string> {

	private state: StateDict = {};

	private _onDidChangeTreeData: vscode.EventEmitter<string | null> = new vscode.EventEmitter<string | null>();
	readonly onDidChangeTreeData: vscode.Event<string | null> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire(null);
	}

	clear(): void {
		this.state = {};
	}

	getTreeItem(element: string): vscode.TreeItem | Thenable<vscode.TreeItem> {
		const path = element.trim().split("/");

		let part = "";
		let dict = this.state;
		while (path.length > 0) {
			part = <string>path.shift();
			const next = dict[part];
			if (typeof (next) === "string") {
				return {
					label: part + ": " + next,
					collapsibleState: vscode.TreeItemCollapsibleState.None
				};
			} else if (next) {
				dict = next;
			}
		}

		return {
			label: part,
			collapsibleState: vscode.TreeItemCollapsibleState.Expanded
		};
	}

	getChildren(element?: string | undefined): vscode.ProviderResult<string[]> {
		let result: string[] = [];
		if (element) {
			const path = element.trim().split("/");

			let prefix = "";
			let dict = this.state;

			while (path.length > 0) {
				const part = <string>path.shift();
				if (prefix === "") { prefix = part; }
				else { prefix = prefix + "/" + part; }
				const next = dict[part];
				if (next && typeof (next) === "object") {
					dict = next;
				}
			}
			result = Object.keys(dict).map(x => prefix + "/" + x);
		} else {
			result = Object.keys(this.state);
		}
		result.sort();
		return Promise.resolve(result);
	}

	setState(line: string) {
		const matches = line.match(STATE_MATCHER);
		if (matches && matches.groups) {
			const path = matches.groups["path"].trim().split(/\s+/);
			const value = matches.groups["value"].trim();

			if (path.length === 0) { return false; }

			let dict = this.state;
			while (path.length > 0) {
				const part = <string>path.shift();
				const next = dict[part];
				if (path.length === 0) {
					dict[part] = value;
				} else {
					if (typeof (next) === "string" || !next) {
						dict = dict[part] = {};
					} else {
						dict = next;
					}
				}
			}
			return true;
		}
		return false;
	}

	recDel(path: string[], dict: StateDict) {
		if (path.length === 0) { return; }

		const part = <string>path.shift();
		const next = dict[part];

		if (typeof (next) === "string") {
			delete dict[part];
		} else if (next) {
			this.recDel(path, next);
			if (Object.keys(next).length === 0) {
				delete dict[part];
			}
		}
	}

	clearState(line: string) {
		const matches = line.match(CLEAR_MATCHER);
		if (matches && matches.groups) {
			const path = matches.groups["path"].trim().split(/\s+/);
			this.recDel(path, this.state);
			return true;
		}
		return false;
	}

}

interface NoteDict {
	[key: string]: NoteDict | string[] | undefined | null;
}

export class NotesProvider implements vscode.TreeDataProvider<string> {

	private notes: NoteDict = {};

	private _onDidChangeTreeData: vscode.EventEmitter<string | null> = new vscode.EventEmitter<string | null>();
	readonly onDidChangeTreeData: vscode.Event<string | null> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire(null);
	}

	clear(): void {
		this.notes = {};
	}

	getTreeItem(element: string): vscode.TreeItem | Thenable<vscode.TreeItem> {
		const path = element.trim().split("/");

		let part = "";
		let dict = this.notes;
		while (path.length > 0) {
			part = <string>path.shift();
			const next = dict[part];
			if (!next) {
				return {
					label: part,
					collapsibleState: vscode.TreeItemCollapsibleState.None
				};
			}
			dict = <NoteDict>next;
		}
		return {
			label: part,
			collapsibleState: vscode.TreeItemCollapsibleState.Expanded
		};
	}

	getChildren(element?: string | undefined): vscode.ProviderResult<string[]> {
		let result: string[] = [];
		if (element) {
			const path = element.trim().split("/");

			let prefix = "";
			let dict = this.notes;

			while (path.length > 0) {
				const part = <string>path.shift();
				if (prefix === "") { prefix = part; }
				else { prefix = prefix + "/" + part; }
				const next = dict[part];
				if (Array.isArray(next)) {
					result = next.map(x => prefix + "/" + x);
					break;
				} else if (next) {
					dict = next;
					if (path.length === 0) {
						const preResult = [];
						for (let key of Object.keys(dict)) {
							const next = dict[key];
							if (Array.isArray(next)) {
								preResult.push(next.map(x => key + ": " + x));
							} else {
								preResult.push(key);
							}
						}
						result = preResult.flat().map(x => prefix + "/" + x);
					}
				} else {
					result = [];
					break;
				}
			}
		} else {
			result = Object.keys(this.notes);
		}
		result.sort();
		return Promise.resolve(result);
	}

	addNote(line: string) {
		const matches = line.match(NOTE_MATCHER);
		if (matches && matches.groups) {
			const path = matches.groups["path"].trim().split(/\s+/);
			const value = matches.groups["value"].trim();

			if (path.length === 0) { return false; }

			let dict = this.notes;
			while (path.length > 0) {
				const part = <string>path.shift();
				const next = dict[part];
				if (path.length === 0) {
					if (Array.isArray(next)) {
						next.push(value);
					} else {
						dict[part] = [value];
					}
				} else {
					if (Array.isArray(next) || !next) {
						dict = dict[part] = {};
					} else {
						dict = next;
					}
				}
			}

			return true;
		}
		return false;
	}

	recDel(path: string[], dict: NoteDict) {
		if (path.length === 0) { return; }

		const part = <string>path.shift();
		const next = dict[part];

		console.log(path, part, next);

		if (Array.isArray(next)) {
			const value = <string>path.shift();
			console.log("value: ", value);
			dict[part] = next.filter(x => x !== value);
			if (dict[part]?.length === 0) { delete dict[part]; }
		} else if (next) {
			this.recDel(path, next);
			if (Object.keys(next).length === 0) {
				delete dict[part];
			}
		}
	}

	removeNote(line: string) {
		const matches = line.match(NOTE_MATCHER);
		if (matches && matches.groups) {
			const path = matches.groups["path"].trim().split(/\s+/);
			const value = matches.groups["value"].trim();
			path.push(value);
			this.recDel(path, this.notes);
			return true;
		}
		return false;
	}
}

function handleLines(lines: string[],
	noteProvider: NotesProvider,
	stateProvider: StateProvider,
) {
	noteProvider.clear();
	stateProvider.clear();
	for (let line of lines) {
		if (line === "") { continue; }
		const firstChar = line[0];

		switch (firstChar) {
			case "+":
				if (noteProvider.addNote(line)) { continue; }
				break;
			case ">":
				if (stateProvider.setState(line)) { continue; }
				break;
			case "-":
				stateProvider.clearState(line);
				noteProvider.removeNote(line);
				break;

		}
	}
	noteProvider.refresh();
	stateProvider.refresh();
}


let activeLine = 0;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	activeLine = 0;

	const noteProvider = new NotesProvider();
	const stateProvider = new StateProvider();
	vscode.window.registerTreeDataProvider("story-timeline-notes", noteProvider);
	vscode.window.registerTreeDataProvider("story-timeline-state", stateProvider);

	console.log('Congratulations, your extension "StoryTimeline" is now active!');

	vscode.window.onDidChangeTextEditorSelection((event) => {
		const editor = vscode.window.activeTextEditor;
		if (editor) {
			const document = editor.document;
			if (document.languageId === "markdown") {
				const line = event.selections[0].active.line;
				if (line !== activeLine) {
					activeLine = line;

					const linesUpToCursor = document.getText().split('\n').slice(0, line + 1);
					handleLines(linesUpToCursor, noteProvider, stateProvider);

				}
			}

		}
	});
}

// This method is called when your extension is deactivated
export function deactivate() { }
