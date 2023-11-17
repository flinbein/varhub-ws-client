import { parse, serialize, XJData } from "xjmapper";
import type { RoomDescription } from "./types/RoomDescription.js";


interface EventSubscriber<T extends Record<string, unknown[]>> {
	on<E extends keyof T>(eventName: E, handler: (...args: T[E]) => void): void
	once<E extends keyof T>(eventName: E, handler: (...args: T[E]) => void): void
	off<E extends keyof T>(eventName: E, handler: (...args: T[E]) => void): void
}
interface EventBox<T extends Record<string, unknown[]>> {
	dispatch<E extends keyof T>(type: E, detail: T[E]): void,
	subscriber: EventSubscriber<T>
}

function createEventBox<T extends Record<string, unknown[]>>(): EventBox<T> {
	const target = new EventTarget();
	const targetMap = new WeakMap<(...args: any) => void, (...args: any) => void>()
	return {
		dispatch<E extends keyof T>(type: E, detail: T[E]){
			target.dispatchEvent(new CustomEvent(type as any, {detail}))
		},
		subscriber: {
			on(event: string, handler: (...args: any) => void) {
				let eventHandler = targetMap.get(handler);
				if (!eventHandler) {
					eventHandler = (event: CustomEvent) => {
						handler(...event.detail);
					}
					targetMap.set(handler, eventHandler);
				}
				target.addEventListener(event, eventHandler as any);
			},
			once(event: string, handler: (...args: any) => void) {
				let eventHandler = targetMap.get(handler);
				if (!eventHandler) {
					eventHandler = (event: CustomEvent) => {
						handler(...event.detail)
					}
					targetMap.set(handler, eventHandler);
				}
				target.addEventListener(event, eventHandler as any, {once: true});
			},
			off(event: string, handler: (...args: any) => void) {
				let eventHandler = targetMap.get(handler);
				if (!eventHandler) return;
				target.removeEventListener(event, eventHandler);
			},
		} as any
	}
	
}

type VarhubClientState = "init"|"ready"|"join"|"room"|"closed";
type VarhubClientEvents = {
	message: XJData[]
	joinRoom: [string]
	close: [string]
	state: [VarhubClientState]
}
export default class VarhubClient<
	METHODS extends Record<string, any> = Record<string, (...args: XJData[]) => XJData>,
	EVENTS extends Record<string, any> = Record<string, XJData[]>
> {
	#ws: WebSocket;
	#responseEventTarget = new EventTarget();
	#messagesEventBox = createEventBox<EVENTS>();
	#eventBox = createEventBox<VarhubClientEvents>();
	#roomId: string|undefined;
	#state: VarhubClientState = "init";
	
	messages = this.#messagesEventBox.subscriber;
	events = this.#eventBox.subscriber;
	methods: {[K in keyof METHODS]: (...args: Parameters<METHODS[K]>) => Promise<ReturnType<METHODS[K]>>} = new Proxy(
		Object.freeze(Object.create(null)),
		{
			has: () => false,
			get: (t, method) => (...args: any) => this.call(method as any, ...args),
		}
	);
	
	getRoomId(){
		return this.#roomId;
	}
	
	getState(): VarhubClientState {
		return this.#state;
	}
	
	#setState(state: VarhubClientState){
		if (this.#state === state) return;
		this.#state = state;
		this.#eventBox.dispatch("state", [state]);
	}
	
	waitForInit(): Promise<this> {
		if (this.#state === "closed") return Promise.reject(new Error("ws closed"));
		if (this.#state !== "init") return Promise.resolve(this);
		return new Promise((resolve, reject) => {
			const onStateChange = (state: VarhubClientState) => {
				if (state === "init") return;
				this.events.off("state", onStateChange);
				if (state === "closed") reject(new Error("ws closed"));
				resolve(this);
			}
			this.events.on("state", onStateChange);
		});
	}
	
	constructor(url: string) {
		this.#ws = new WebSocket(url);
		this.#ws.binaryType = "arraybuffer";
		this.#ws.addEventListener("message", event => {
			const binData = new Uint8Array(event.data as ArrayBuffer);
			const [type, ...parsedData] = parse(binData);
			if (type === 2) {
				this.#eventBox.dispatch("message", parsedData);
				if (parsedData.length >= 1) {
					const [eventType, ...eventData] = parsedData;
					if (typeof eventType === "string") {
						this.#messagesEventBox.dispatch(eventType,eventData as any);
					}
				}
			} else {
				const [callId, response] = parsedData;
				if (typeof callId !== "number" && typeof callId !== "string") return;
				this.#responseEventTarget.dispatchEvent(new CustomEvent(callId as any, {detail: [type, response]}));
			}
		});
		this.#ws.addEventListener("open", event => {
			this.#setState("ready");
		}, {once: true});
		
		this.#ws.addEventListener("close", event => {
			this.#setState("closed");
		}, {once: true});
	}
	
	close(reason: string){
		this.#setState("closed");
		this.#ws.close(4000, reason);
	}
	
	async createRoom(data: {modules: Record<string, RoomDescription>}): Promise<string> {
		if (this.#state === "init" || this.#state === "closed") {
			throw new Error(`'createRoom' not available in state '${this.#state}'`);
		}
		return await this.#send("room", data as any) as string;
	}
	
	async joinRoom(roomId: string, ...data: XJData[]): Promise<boolean> {
		if (this.#state !== "ready") throw new Error("'joinRoom' available only in state 'ready'");
		this.#setState("join");
		try {
			const success = await this.#send("join", roomId, ...data) as boolean;
			if (!success) return false;
			this.#roomId = roomId;
			this.#setState("room");
			this.#eventBox.dispatch("joinRoom", [roomId]);
			return success;
		} catch (error) {
			this.#setState("init");
			throw error;
		}
	}
	
	async call<T extends keyof METHODS>(method: string, ...data: Parameters<METHODS[T]>): Promise<ReturnType<METHODS[T]>>{
		if (this.#state !== "room") throw new Error("'call' available only in state 'room'");
		return await this.#send("call", method, ...data as any) as any;
	}
	
	#callId = 0;
	#send(...args: XJData[]): Promise<XJData> {
		return new Promise((resolve, reject) => {
			const currentCallId = this.#callId++;
			const binData = serialize(currentCallId, ...args);
			this.#ws.send(binData);
			const onResponse = (event: Event) => {
				if (!(event instanceof CustomEvent)) return;
				const eventData = event.detail;
				if (!Array.isArray(eventData)) return;
				const [type, response] = eventData;
				clearEvents();
				if (type === 0) resolve(response);
				else reject(response);
			}
			const onClose = (reason: string) => {
				clearEvents();
				reject(new Error(reason));
			}
			const clearEvents = () => {
				this.#responseEventTarget.removeEventListener(currentCallId as any, onResponse);
				this.events.off("close", onClose);
			}
			this.#responseEventTarget.addEventListener(currentCallId as any, onResponse, {once: true});
			this.events.once("close", onClose);
		})
	}
}