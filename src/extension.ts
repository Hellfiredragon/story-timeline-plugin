// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import exp = require('constants');
import * as vscode from 'vscode';

// const NUMBER_MATCHER = /^[+-]\s+\[(?<name>[^\]]+)\]\s+(?<num>\d+)\s*$/;

const ATTR_REGEX = /^[+-]\s*\[(?<char>.*?)\]\s*(?<attr>.*?)\s*:\s*(?<val>\d+)\s*$/;

// const TEXT_MATCHER = /^[+-]\s+\[(?<name>[^\]]+)\]\s+(?<str>.+)\s*$/;

const GOAL_MATCHER = /^[+-]\s*\[(?<char>.*?)\]\s*(?<type>.*?)\s*:\s*(?<goal>.+)\s*$/;

export class AttributeProvider implements vscode.TreeDataProvider<string> {

	private attr: { [char: string]: {[attr: string]: number} } = {};

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
		if(split.length === 1) {
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
			if(split.length === 1) {
				const char = split[0];
				const attr = Object.keys(this.attr[char]);
				return Promise.resolve(attr.map(x => char + "/" + x));
			}
		} else {
			const chars = Object.keys(this.attr);
			return Promise.resolve(chars);
		}
	}

	numberAdd(line: string) {
		const matches = line.match(ATTR_REGEX);
		if (matches && matches.groups) {
			const char = matches.groups["char"].trim();
			const attr = matches.groups["attr"].trim();
			const val = Number(matches.groups["val"]);
			if(!this.attr[char]) { this.attr[char] = {}; }
			if(!this.attr[char][attr]) { this.attr[char][attr] = 0; }
			this.attr[char][attr] = this.attr[char][attr] + val;
			return true;
		}
		return false;
	}

	numberRemove(line: string) {
		const matches = line.match(ATTR_REGEX);
		if (matches && matches.groups) {
			const char = matches.groups["char"].trim();
			const attr = matches.groups["attr"].trim();
			const val = Number(matches.groups["val"]);
			if(!this.attr[char]) { this.attr[char] = {}; }
			if(!this.attr[char][attr]) { this.attr[char][attr] = 0; }
			this.attr[char][attr] = this.attr[char][attr] - val;
			if(this.attr[char][attr] === 0) { 
				delete this.attr[char][attr]; 
				const keys = Object.keys(this.attr[char]);
				if(keys.length === 0) {
					delete this.attr[char];
				}
			}
			return true;
		}
		return false;
	}

}

export class GoalProvider implements vscode.TreeDataProvider<string> {

	private goals: { [char: string]: string[] } = {};

    private _onDidChangeTreeData: vscode.EventEmitter<string | null> = new vscode.EventEmitter<string | null>();
    readonly onDidChangeTreeData: vscode.Event<string | null> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire(null);
    }

	clear(): void {
		this.goals = {};
	}

	getTreeItem(element: string): vscode.TreeItem | Thenable<vscode.TreeItem> {
		const split = element.split("/");
		if(split.length === 1) {
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
			if(split.length === 1) {
				const char = split[0];
				return Promise.resolve(this.goals[char].map(x => char + "/" + x));
			}
		} else {
			const chars = Object.keys(this.goals);
			return Promise.resolve(chars);
		}
	}

	textAdd(line: string) {
		const matches = line.match(GOAL_MATCHER);
		if (matches && matches.groups) {
			const char = matches.groups["char"].trim();
			const type = matches.groups["type"].trim();
			const goal = matches.groups["goal"].trim();
			if(!this.goals[char]) { this.goals[char] = []; }
			const text = type + ": " + goal;
			this.goals[char].push(text);
			return true;
		}
		return false;
	}

	textRemove(line: string) {
		const matches = line.match(GOAL_MATCHER);
		if (matches && matches.groups) {
			const char = matches.groups["char"].trim();
			const type = matches.groups["type"].trim();
			const goal = matches.groups["goal"].trim();
			if(!this.goals[char]) { return true; }
			const text = type + ": " + goal;
			this.goals[char] = this.goals[char].filter(x => x !== text);
			if(this.goals[char].length === 0) {
				delete this.goals[char];
			}
			return true;
		}
		return false;
	}
}

function handleLines(lines: string[], attributeProvider: AttributeProvider, goalProvider: GoalProvider) {
	attributeProvider.clear();
	goalProvider.clear();
	for (let line of lines) {
		if (line === "") { continue; }
		if (line[0] === "+") {
			if (attributeProvider.numberAdd(line)) { continue; }
			if (goalProvider.textAdd(line)) { continue; }
		} else if (line[0] === "-") {
			if (attributeProvider.numberRemove(line)) { continue; }
			if (goalProvider.textRemove(line)) { continue; }
		}
	}
	attributeProvider.refresh();
	goalProvider.refresh();
}


let activeLine = 0;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	activeLine = 0;

	const attributeProvider = new AttributeProvider();
	const goalProvider = new GoalProvider();
	vscode.window.registerTreeDataProvider("story-timeline-attributes", attributeProvider);
	vscode.window.registerTreeDataProvider("story-timeline-goals", goalProvider);

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
					handleLines(linesUpToCursor, attributeProvider, goalProvider);

				}
			}

		}
	});
}

// This method is called when your extension is deactivated
export function deactivate() { }
