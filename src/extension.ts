// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { strict } from 'assert';
import exp = require('constants');
import { stat } from 'fs';
import { type } from 'os';
import * as vscode from 'vscode';

const ATTR_REGEX = /^[+*-]\s*\[(?<char>.*?)\]\s*(?<attr>.*?)\s*:\s*[+]?(?<value>-?\d+)\s*$/;
const NOTE_MATCHER = /^[+-]\s*\[(?<char>.*?)\]\s*(?<note>.+)\s*$/;
const STATE_MATCHER = /^[>]\s*(?<path>.*?)\s*:\s*(?<value>.+)\s*$/;

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

}

export class AttributesProvider implements vscode.TreeDataProvider<string> {

	private attr: { [char: string]: { [attr: string]: number } } = {};

	private _onDidChangeTreeData: vscode.EventEmitter<string | null> = new vscode.EventEmitter<string | null>();
	readonly onDidChangeTreeData: vscode.Event<string | null> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire(null);
	}

	clear(): void {
		this.attr = {};
	}

	getTreeItem(element: string): vscode.TreeItem | Thenable<vscode.TreeItem> {
		const split = element.split("/");
		if (split.length === 1) {
			const char = split[0];
			return {
				label: char,
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded
			};
		} else {
			const char = split[0];
			const attr = split[1];
			return {
				label: attr + ": " + this.attr[char][attr],
				collapsibleState: vscode.TreeItemCollapsibleState.None
			};
		}
	}

	getChildren(element?: string | undefined): vscode.ProviderResult<string[]> {
		if (element) {
			const split = element.split("/");
			if (split.length === 1) {
				const char = split[0];
				const attr = Object.keys(this.attr[char]);
				attr.sort();
				return Promise.resolve(attr.map(x => char + "/" + x));
			}
		} else {
			const chars = Object.keys(this.attr);
			chars.sort();
			return Promise.resolve(chars);
		}
	}

	numberAdd(line: string) {
		const matches = line.match(ATTR_REGEX);
		if (matches && matches.groups) {
			const char = matches.groups["char"].trim();
			const attr = matches.groups["attr"].trim();
			const value = Number(matches.groups["value"]);
			if (!this.attr[char]) { this.attr[char] = {}; }
			if (!this.attr[char][attr]) { this.attr[char][attr] = 0; }
			this.attr[char][attr] = this.attr[char][attr] + value;
			return true;
		}
		return false;
	}

	numberRemove(line: string) {
		const matches = line.match(ATTR_REGEX);
		if (matches && matches.groups) {
			const char = matches.groups["char"].trim();
			const attr = matches.groups["attr"].trim();
			const value = Number(matches.groups["value"]);
			if (!this.attr[char]) { this.attr[char] = {}; }
			if (!this.attr[char][attr]) { this.attr[char][attr] = 0; }
			this.attr[char][attr] = this.attr[char][attr] - value;
			if (this.attr[char][attr] === 0) {
				delete this.attr[char][attr];
				const keys = Object.keys(this.attr[char]);
				if (keys.length === 0) {
					delete this.attr[char];
				}
			}
			return true;
		}
		return false;
	}

}

export class NotesProvider implements vscode.TreeDataProvider<string> {

	private notes: { [char: string]: string[] } = {};

	private _onDidChangeTreeData: vscode.EventEmitter<string | null> = new vscode.EventEmitter<string | null>();
	readonly onDidChangeTreeData: vscode.Event<string | null> = this._onDidChangeTreeData.event;

	refresh(): void {
		this._onDidChangeTreeData.fire(null);
	}

	clear(): void {
		this.notes = {};
	}

	getTreeItem(element: string): vscode.TreeItem | Thenable<vscode.TreeItem> {
		const split = element.split("/");
		if (split.length === 1) {
			const char = split[0];
			return {
				label: char,
				collapsibleState: vscode.TreeItemCollapsibleState.Expanded
			};
		} else {
			const char = split[0];
			const text = split[1];
			return {
				label: text,
				collapsibleState: vscode.TreeItemCollapsibleState.None
			};
		}
	}

	getChildren(element?: string | undefined): vscode.ProviderResult<string[]> {
		if (element) {
			const split = element.split("/");
			if (split.length === 1) {
				const char = split[0];
				const notes = this.notes[char];
				notes.sort();
				return Promise.resolve(notes.map(x => char + "/" + x));
			}
		} else {
			const chars = Object.keys(this.notes);
			chars.sort();
			return Promise.resolve(chars);
		}
	}

	textAdd(line: string) {
		const matches = line.match(NOTE_MATCHER);
		if (matches && matches.groups) {
			const char = matches.groups["char"].trim();
			const note = matches.groups["note"].trim();
			if (!this.notes[char]) { this.notes[char] = []; }
			this.notes[char].push(note);
			return true;
		}
		return false;
	}

	textRemove(line: string) {
		const matches = line.match(NOTE_MATCHER);
		if (matches && matches.groups) {
			const char = matches.groups["char"].trim();
			const note = matches.groups["note"].trim();
			if (!this.notes[char]) { return true; }
			this.notes[char].push(note);
			this.notes[char] = this.notes[char].filter(x => x !== note);
			if (this.notes[char].length === 0) {
				delete this.notes[char];
			}
			return true;
		}
		return false;
	}
}

function handleLines(lines: string[],
	attributeProvider: AttributesProvider,
	noteProvider: NotesProvider,
	stateProvider: StateProvider,
) {
	attributeProvider.clear();
	noteProvider.clear();
	stateProvider.clear();
	for (let line of lines) {
		if (line === "") { continue; }
		const firstChar = line[0];

		switch (firstChar) {
			case "*":
				if (attributeProvider.numberAdd(line)) { continue; }
				break;
			case "+":
				if (attributeProvider.numberAdd(line)) { continue; }
				if (noteProvider.textAdd(line)) { continue; }
				break;
			case "-":
				if (attributeProvider.numberRemove(line)) { continue; }
				if (noteProvider.textRemove(line)) { continue; }
				break;
			case ">":
				if (stateProvider.setState(line)) { continue; }
				break;
		}
	}
	attributeProvider.refresh();
	noteProvider.refresh();
	stateProvider.refresh();
}


let activeLine = 0;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	activeLine = 0;

	const attributeProvider = new AttributesProvider();
	const noteProvider = new NotesProvider();
	const stateProvider = new StateProvider();
	vscode.window.registerTreeDataProvider("story-timeline-attributes", attributeProvider);
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
					handleLines(linesUpToCursor, attributeProvider, noteProvider, stateProvider);

				}
			}

		}
	});
}

// This method is called when your extension is deactivated
export function deactivate() { }
