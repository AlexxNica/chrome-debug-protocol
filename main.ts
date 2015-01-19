﻿import http = require("http");
import WebSocket = require("ws");
import util = require("util");
import event = require("events");
var protocol = require("./protocol.json");

module Chrome {
    export interface ChromeTab {
        description: string;
        devtoolsFrontendUrl: string;
        id: string;
        title: string;
        type: string;
        url: string;
        webSocketDebuggerUrl: string;
    }

    export interface ChromeCallBack<T> {
        (result: T, error: ChromeError ): void;
    }

    export interface ChromeError {
        code: number;
        message: string;
    }

    export function createDebugger(tab: string|ChromeTab) {
        if (typeof tab === "string") {
            return new Chrome.ChromeDebugger(tab);
        } else {
            return new Chrome.ChromeDebugger(tab.webSocketDebuggerUrl);
        }
    }

    export function getTabs(options, callback: (tabs: ChromeTab[]) => void) {
        var req = http.request(options, function (res) {
            var body = "";
            res.on('data', function (chunk) {
                body += chunk;
            });
            res.on('end', function () {
                callback(JSON.parse(body));
            });
        });
        req.end();
    }

    export class ChromeDebugger extends event.EventEmitter {
        private ws: WebSocket;

        private callbackId: number = 0;
        private callbacks: { [id: string]: Function; } = {};

        constructor(websocketUrl: string) {
            super();
            this.addProtocol();
            var ws = this.ws = new WebSocket(websocketUrl);
            ws.on("message", this.messageRecieved);
            ws.on("error", (error) => {
                this.emit("error", error);
            });
        }

        public close() {
            this.ws.close();
        }

        public send<T>(method: string, params: any, callback: ChromeCallBack<T>) {
            if (this.ws.readyState == WebSocket.CONNECTING) {
                this.ws.on("open",() => {
                    this.sendInternal(method, params, callback);
                });
            } else {
                this.sendInternal(method, params, callback);
            }
        }

        private sendInternal<T>(method: string, params: any, callback: ChromeCallBack<T>) {
            this.ws.send(JSON.stringify({ method, params, id: this.callbackId }));
            this.callbacks[this.callbackId] = callback;
            this.callbackId++;
        }

        private messageRecieved = (data: any, flags: any) => {
            var obj = JSON.parse(data);
            if (typeof obj.id !== "undefined") {
                // When an id is present, this means it is the return value from a method
                var cb = this.callbacks[obj.id];
                if (cb) {
                    if (obj.error) {
                        cb(null, obj.error);
                    } else {
                        cb(obj.result, null);
                    }
                    delete this.callbacks[this.callbackId];
                }
            } else {
                // This is an event
                this.emit(obj.method, obj.params);
            }
        }

        private addProtocol() {
            var domains = protocol.domains;
            for (var i = 0; i < domains.length; i++) {
                var domain = domains[i];
                var domainObject = this[domain.domain] = <any>{};
                domainObject.on = ((domain: any) => {
                    return () => {
                        this.on.call(this, `${domain.domain}.${arguments[0]}`, arguments[1]);
                    };
                })(domain);
                var commands: any[] = domain.commands;
                if (commands && commands.length > 0) {
                    for (var j = 0; j < commands.length; j++) {
                        this.implementCommand(domain, domainObject, commands[j]);
                    }
                }
            }
        }

        private implementCommand(domain: any, object: Object, command: any) {
            object[command.name] = (args: Object) => {
                var callback: ChromeCallBack<any>;
                if (arguments.length == 1 && typeof arguments[0] == "function") {
                    callback = arguments[0];
                    args = null;
                } else {
                    callback = arguments[1];
                }
                this.send(`${domain.domain}.${command.name}`, args, callback);
            };
        }
    }
}

export = Chrome;
