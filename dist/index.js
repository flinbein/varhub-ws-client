import { parse, serialize } from "xjmapper";
function createEventBox() {
    const target = new EventTarget();
    const targetMap = new WeakMap();
    return {
        dispatch(type, detail) {
            target.dispatchEvent(new CustomEvent(type, { detail }));
        },
        subscriber: {
            on(event, handler) {
                let eventHandler = targetMap.get(handler);
                if (!eventHandler) {
                    eventHandler = (event) => {
                        handler(...event.detail);
                    };
                    targetMap.set(handler, eventHandler);
                }
                target.addEventListener(event, eventHandler);
            },
            once(event, handler) {
                let eventHandler = targetMap.get(handler);
                if (!eventHandler) {
                    eventHandler = (event) => {
                        handler(...event.detail);
                    };
                    targetMap.set(handler, eventHandler);
                }
                target.addEventListener(event, eventHandler, { once: true });
            },
            off(event, handler) {
                let eventHandler = targetMap.get(handler);
                if (!eventHandler)
                    return;
                target.removeEventListener(event, eventHandler);
            },
        }
    };
}
export default class VarhubClient {
    #ws;
    #responseEventTarget = new EventTarget();
    #messagesEventBox = createEventBox();
    #eventBox = createEventBox();
    #roomId;
    #state = "init";
    messages = this.#messagesEventBox.subscriber;
    events = this.#eventBox.subscriber;
    methods = new Proxy(Object.freeze(Object.create(null)), {
        has: () => false,
        get: (t, method) => (...args) => this.call(method, ...args),
    });
    getRoomId() {
        return this.#roomId;
    }
    getState() {
        return this.#state;
    }
    #setState(state) {
        if (this.#state === state)
            return;
        this.#state = state;
        this.#eventBox.dispatch("state", [state]);
    }
    waitForInit() {
        if (this.#state === "closed")
            return Promise.reject(new Error("ws closed"));
        if (this.#state !== "init")
            return Promise.resolve(this);
        return new Promise((resolve, reject) => {
            const onStateChange = (state) => {
                if (state === "init")
                    return;
                this.events.off("state", onStateChange);
                if (state === "closed")
                    reject(new Error("ws closed"));
                resolve(this);
            };
            this.events.on("state", onStateChange);
        });
    }
    constructor(url) {
        this.#ws = new WebSocket(url);
        this.#ws.binaryType = "arraybuffer";
        this.#ws.addEventListener("message", event => {
            const binData = new Uint8Array(event.data);
            const [type, ...parsedData] = parse(binData);
            if (type === 2) {
                this.#eventBox.dispatch("message", parsedData);
                if (parsedData.length >= 1) {
                    const [eventType, ...eventData] = parsedData;
                    if (typeof eventType === "string") {
                        this.#messagesEventBox.dispatch(eventType, eventData);
                    }
                }
            }
            else {
                const [callId, response] = parsedData;
                if (typeof callId !== "number" && typeof callId !== "string")
                    return;
                this.#responseEventTarget.dispatchEvent(new CustomEvent(callId, { detail: [type, response] }));
            }
        });
        this.#ws.addEventListener("open", event => {
            this.#setState("ready");
        }, { once: true });
        this.#ws.addEventListener("close", event => {
            this.#setState("closed");
            this.#eventBox.dispatch("close", [event.reason]);
        }, { once: true });
    }
    close(reason) {
        this.#setState("closed");
        this.#ws.close(4000, reason);
    }
    async createRoom(data) {
        if (this.#state === "init" || this.#state === "closed") {
            throw new Error(`'createRoom' not available in state '${this.#state}'`);
        }
        return await this.#send("room", data);
    }
    async joinRoom(roomId, hash, ...data) {
        if (this.#state !== "ready")
            throw new Error("'joinRoom' available only in state 'ready'");
        this.#setState("join");
        try {
            const success = await this.#send("join", roomId, hash, ...data);
            if (!success)
                return false;
            this.#roomId = roomId;
            this.#setState("room");
            this.#eventBox.dispatch("joinRoom", [roomId]);
            return success;
        }
        catch (error) {
            this.#setState("init");
            throw error;
        }
    }
    async call(method, ...data) {
        if (this.#state !== "room")
            throw new Error("'call' available only in state 'room'");
        return await this.#send("call", method, ...data);
    }
    #callId = 0;
    #send(...args) {
        return new Promise((resolve, reject) => {
            const currentCallId = this.#callId++;
            const binData = serialize(currentCallId, ...args);
            this.#ws.send(binData);
            const onResponse = (event) => {
                if (!(event instanceof CustomEvent))
                    return;
                const eventData = event.detail;
                if (!Array.isArray(eventData))
                    return;
                const [type, response] = eventData;
                clearEvents();
                if (type === 0)
                    resolve(response);
                else
                    reject(response);
            };
            const onClose = (reason) => {
                clearEvents();
                reject(new Error(reason));
            };
            const clearEvents = () => {
                this.#responseEventTarget.removeEventListener(currentCallId, onResponse);
                this.events.off("close", onClose);
            };
            this.#responseEventTarget.addEventListener(currentCallId, onResponse, { once: true });
            this.events.once("close", onClose);
        });
    }
}
