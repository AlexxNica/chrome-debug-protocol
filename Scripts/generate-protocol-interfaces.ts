﻿import fs = require("fs");
import path = require("path");
var protocol = require("../protocol.json");

function indent(level: number) {
    return Array((level * 4) + 1).join(" ")
}

var domains = protocol.domains;
var chromeDomains = "";

for (var i = 0; i < domains.length; i++) {
    chromeDomains += `${indent(2)}${domains[i].domain}: I${domains[i].domain};\r\n`;
}

var domainInterfaces = "";
var methodParameterInterfaces = "";
for (var i = 0; i < domains.length; i++) {
    emitInterface(domains[i]);
}

function emitInterface(domain: any) {
    methodParameterInterfaces += `${indent(1)}module ${domain.domain} {\r\n`;
    domainInterfaces += `${indent(1)}interface I${domain.domain} {\r\n`;
    var commands: any[] = domain.commands;
    if (commands && commands.length > 0) {
        for (var i = 0; i < commands.length; i++) {
            emitCommand(domain.domain, commands[i]);
        }
    }
    methodParameterInterfaces += `${indent(1)}}\r\n`;
    domainInterfaces += indent(1) + "}\r\n";
}

function emitCommand(domainName: string, command: any) {
    if (command.description) {
        domainInterfaces += `${indent(2)} /**\r\n`;
        domainInterfaces += `${indent(2)} * ${command.description}\r\n`;
        domainInterfaces += `${indent(2)} */\r\n`;
    }
    domainInterfaces += indent(2) + command.name;
    domainInterfaces += "(";
    var parameters: any[] = command.parameters;
    if (parameters && parameters.length > 0) {
        var optional = containsOptionalParameters(parameters);
        var commandName  = command.name.replace(/(.)/,(val) => val.toUpperCase());
        var name = `I${domainName}${commandName}Params`;
        domainInterfaces += `params${(optional ? "?" : "")}: ${domainName}.${name}`;

        emitParameterInterface(name, parameters);
        domainInterfaces += ", ";
    }
    domainInterfaces += "cb?: Function";
    domainInterfaces += ");\r\n";
}

function emitParameterInterface(name: string, parameters: any[]) {
    methodParameterInterfaces += `${indent(2)}export interface ${name} {\r\n`;
    for (var j = 0; j < parameters.length; j++) {
        var p = parameters[j];
        if (p.description) {
            methodParameterInterfaces += `${indent(3)} /**\r\n`;
            methodParameterInterfaces += `${indent(3)} * ${p.description}\r\n`;
            methodParameterInterfaces += `${indent(3)} */\r\n`;
        }

        methodParameterInterfaces += `${indent(3)}${p.name}${(p.optional ? "?" : "")}: ${getTypeScriptType(p.type)};\r\n`;
    }
    methodParameterInterfaces += `${indent(2)}}\r\n`;
}

function getTypeScriptType(name: string) {
    switch (name) {
        case "boolean":
        case "string":
            return name;
        case "integer":
            return "number";
        case "array":
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

var importRegex = /import (?:.+;)/g;
var imports = "";

var match: RegExpExecArray;
while ((match = importRegex.exec(maindts)) != null) {
    imports += indent(1) + match[0] + "\r\n";
}

var header = `// Type definitions for ws
// Project: https://github.com/DickvdBrink/chrome-debug-protocol
// Definitions by: Dick van den Brink <https://github.com/DickvdBrink>
// Definitions: https://github.com/borisyankov/DefinitelyTyped

/// <reference path="../node/node.d.ts" />
`;

maindts = header + maindts.replace(/import (?:.+;)/g, "")
    .replace(
        /(class ChromeDebugger (?:.+) {)([\s\S]+?)([ ]+)}/g,
        `$1$2${chromeDomains}$3}\r\n${domainInterfaces}${methodParameterInterfaces}`
    ).replace(/declare module Chrome {/, "declare module \"chrome-debug-protocol\" {\r\n" + imports)
    .replace("export = Chrome;", "");

fs.writeFileSync(path.join(__dirname, "typings/chrome-debug-protocol/chrome-debug-protocol.d.ts"), maindts);
