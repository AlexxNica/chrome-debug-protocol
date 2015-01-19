﻿import fs = require("fs");
import path = require("path");
var protocol = require("../protocol.json");

var domains = protocol.domains;

class Emitter {
    private buffer: string[] = [];
    private level: number = 0;
    private newline: string;
    private isInComment: boolean = false;

    constructor(startLevel?: number) {
        this.newline = "\r\n";
        this.level = startLevel;
    }

    public indent() {
        this.level++;
    }

    public unindent() {
        this.level--;
    }

    public writeIndent() {
        this.buffer.push(this.createIndentString());
    }

    public write(str: string) {
        this.buffer.push(str);
    }

    public writenewline() {
        this.buffer.push(this.newline);
    }

    public writeline(str: string) {
        if (this.isInComment) {
            this.buffer.push(`${this.createIndentString()} * ${str}${this.newline}`);
        } else {
            this.buffer.push(`${this.createIndentString()}${str}${this.newline}`);
        }
    }

    public writeTypeDescription(str: string) {
        this.writeStartMultilineComment();
        this.writeline(str);
        this.writeEndMultilineComment();
    }

    public writeStartMultilineComment() {
        this.isInComment = true;
        this.buffer.push(`${this.createIndentString()} /**${this.newline}`);
    }

    public writeEndMultilineComment() {
        this.buffer.push(`${this.createIndentString()} */${this.newline}`);
        this.isInComment = false;
    }

    public writeJsDocParameter(name: string, description: string) {
        if (!this.isInComment) {
            throw new Error("Not in a comment block")
        }
        this.buffer.push(` * @param ${name} ${description}`);
    }

    private createIndentString(level?: number) {
        level = typeof level === "undefined" ? this.level : level;
        return Array((level * 4) + 1).join(" ")
    }

    public toString() {
        return this.buffer.join("");
    }
}

// Write "domain" properties for the ChromeDebugger class
var domainEmitter = new Emitter(2);
for (var i = 0; i < domains.length; i++) {
    var domain = domains[i];
    if (domain.description) {
        domainEmitter.writeTypeDescription(domain.description);
    }
    domainEmitter.writeline(`${domain.domain}: I${domain.domain};`);
}

// Write a module wit the parameter interfaces
var moduleEmitter = new Emitter(1);
for (var i = 0; i < domains.length; i++) {
    var domain = domains[i];
    moduleEmitter.writeline(`module ${domain.domain} {`);
    moduleEmitter.indent();
    var commands: any[] = domain.commands;
    if (commands && commands.length > 0) {
        for (var j = 0; j < commands.length; j++) {
            var command = commands[j];
            var parameters: any[] = command.parameters;
            if (parameters && parameters.length > 0) {
                var optional = containsOptionalParameters(parameters);
                var commandName = command.name.replace(/(.)/,(val) => val.toUpperCase());
                var name = `I${commandName}Params`;
                emitInterface(name, parameters, domain);
            }
        }
    }
    if (domain.types) {
        for (var j = 0; j < domain.types.length; j++) {
            var type = domain.types[j];
            if (type.type == "object") {
                if (type.description) {
                    moduleEmitter.writeTypeDescription(type.description);
                }
                emitInterface(type.id, type.properties || [], domain);
            }
        }
    }

    if (domain.events) {
        for (var j = 0; j < domain.events.length; j++) {
            var event = domain.events[j];
            var commandName = event.name.replace(/(.)/,(val) => val.toUpperCase());
            var name = `I${commandName}Event`;
            emitInterface(name, event.parameters || [], domain);
        }
    }

    moduleEmitter.unindent();
    moduleEmitter.writeline("}");
}

function emitInterface(name: string, properties: any[], currentDomain: any) {
    moduleEmitter.writeline(`export interface ${name} {`);
    moduleEmitter.indent();
    for (var i = 0; i < properties.length; i++) {
        var p = properties[i];
        if (p.description) {
            moduleEmitter.writeTypeDescription(p.description);
        }

        moduleEmitter.writeline(`${p.name}${(p.optional ? "?" : "") }: ${getTypeScriptTypeFromParameter(p, currentDomain, false) };`);
    }
    moduleEmitter.unindent();
    moduleEmitter.writeline("}");
}

// Write the actual implementation interfaces with methodes, parameters and callbacks
var domainInterfaceEmitter = new Emitter(1);
for (var i = 0; i < domains.length; i++) {
    var domain = domains[i];
    domainInterfaceEmitter.writeline(`interface I${domain.domain} {`);
    var commands: any[] = domain.commands;
    domainInterfaceEmitter.indent();
    if (commands && commands.length > 0) {
        for (var j = 0; j < commands.length; j++) {
            var command = commands[j];
            var parameters: any[] = command.parameters;
            if (command.description) {
                domainInterfaceEmitter.writeTypeDescription(command.description);
            }
            domainInterfaceEmitter.writeIndent();
            domainInterfaceEmitter.write(`${command.name}(`);
            if (parameters && parameters.length > 0) {
                var optional = containsOptionalParameters(parameters);
                var commandName  = command.name.replace(/(.)/,(val) => val.toUpperCase());
                var name = `I${commandName}Params`;
                domainInterfaceEmitter.write(`params${(optional ? "?" : "")}: ${domain.domain}.${name}`);
                domainInterfaceEmitter.write(", ");
            }
            if (command.returns && command.returns.length > 0) {
                var returnType: string = "{";
                for (var k = 0; k < command.returns.length; k++) {
                    var ret = command.returns[k];
                    returnType += `${ret.name}: ${getTypeScriptTypeFromParameter(ret, domain, true) };`;
                    if (k < command.returns.length - 1) {
                        returnType += " ";
                    }
                }
                returnType += "}";
                domainInterfaceEmitter.write(`cb?: ChromeCallBack<${returnType}>);`);
            } else {
                domainInterfaceEmitter.write("cb?: ChromeCallBack<any>);");
            }
            domainInterfaceEmitter.writenewline();
        }
    }

    if (domain.events && domain.events.length > 0) {
        for (var j = 0; j < domain.events.length; j++) {
            var event = domain.events[j];
            if (event.description) {
                domainInterfaceEmitter.writeTypeDescription(event.description);
            }
            var eventName = event.name.replace(/(.)/,(val) => val.toUpperCase());
            var name = `I${eventName}Event`;

            domainInterfaceEmitter.writeline(`on(event: "${event.name}", listener: ChromeCallBack<${domain.domain}.${name}>): NodeJS.EventEmitter;`);
        }
        domainInterfaceEmitter.writeline(`on(event: string, listener: ChromeCallBack<any>): NodeJS.EventEmitter;`);
    }

    domainInterfaceEmitter.unindent();
    domainInterfaceEmitter.writeline("}")
}

function getTypeScriptTypeFromParameter(parameter: any, currentDomain: any, withModulePrefix: boolean) {
    var paramType: string;

    if (parameter["$ref"]) {
        var typeId: string = parameter["$ref"];
        var splitted = typeId.split(".");

        var typeDomain = splitted.length == 1
            ? currentDomain
            : (<any[]>domains).filter((item) => item.domain == splitted[0])[0];

        var typeName: string = splitted.length == 1
            ? typeId
            : splitted[1];

        var customType = (<any[]>typeDomain.types).filter((item) => item.id == typeName)[0];

        if (customType.type == "object") {
            if (splitted.length == 1 && withModulePrefix) {
                return `${typeDomain.domain}.${typeId}`;
            }
            return typeId;
        } else {
            paramType = customType.type;
        }
    } else {
        paramType = parameter.type;
    }

    switch (paramType) {
        case "boolean":
        case "string":
            return paramType;
        case "integer":
            return "number";
        case "array":
            if (parameter.items) {
                return getTypeScriptTypeFromParameter(parameter.items, domain, withModulePrefix) + "[]";
            }
            return "any[]";
        default:
            return "any";
    }
}

function containsOptionalParameters(params: any[]) {
    for (var i = 0; i < params.length; i++) {
        if (params[i].optional) {
            return true;
        }
    }
    return false;
}

var maindts = fs.readFileSync(path.join(__dirname, "../main.d.ts"), "utf8");

var importsEmitter = new Emitter(1);
var importRegex = /import (?:.+;)/g;
var match: RegExpExecArray;
while ((match = importRegex.exec(maindts)) != null) {
    importsEmitter.writeline(match[0]);
}

var header = `// Type definitions for chrome-debug-protocol
// Project: https://github.com/DickvdBrink/chrome-debug-protocol
// Definitions by: Dick van den Brink <https://github.com/DickvdBrink>
// Definitions: https://github.com/borisyankov/DefinitelyTyped

/// <reference path="../node/node.d.ts" />
`;

maindts = header + maindts.replace(/import (?:.+;)/g, "")
    .replace(
        /(class ChromeDebugger (?:.+) {)([\s\S]+?)([ ]+)}/g,
        `$1$2${domainEmitter.toString()}$3}\r\n${domainInterfaceEmitter.toString()}${moduleEmitter.toString()}`
    ).replace(/declare module Chrome {/, "declare module \"chrome-debug-protocol\" {\r\n" + importsEmitter .toString())
    .replace("export = Chrome;", "");

fs.writeFileSync(path.join(__dirname, "typings/chrome-debug-protocol/chrome-debug-protocol.d.ts"), maindts);
