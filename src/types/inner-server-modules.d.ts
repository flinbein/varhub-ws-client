declare module "varhub:room" {
	
	export interface Client {
		get online(): boolean;
		get joinTime(): number;
		get id(): string;
		send(...args: any): void;
		kick(message: string): boolean;
	}
	
	export interface JoinEvent extends Event {
		get client(): Client;
		get message(): any;
		get messages(): any[];
	}
	
	export interface LeaveEvent extends Event {
		get client(): Client;
	}
	
	interface RoomEvents {
		"join": JoinEvent,
		"leave": LeaveEvent
	}
	
	interface TypedEventListener<T extends Event> {
		(evt: T): void;
	}
	interface TypedEventListenerObject<T extends Event> {
		handleEvent(object: T): void;
	}
	
	export interface Room {
		getClients(): Client[],
		getClientById(id: string): Client | undefined,
		addEventListener<T extends keyof RoomEvents>(
			type: T,
			listener: TypedEventListener<RoomEvents[T]> | TypedEventListenerObject<RoomEvents[T]>,
			options?: AddEventListenerOptions | boolean,
		): void,
		removeEventListener<T extends keyof RoomEvents>(
			type: T,
			listener: TypedEventListener<RoomEvents<T>> | TypedEventListenerObject<RoomEvents<T>>,
			options?: EventListenerOptions | boolean,
		): void,
		send(clients: Client|string|(Client|string)[], ...message: any): void
		broadcast(...message: any): void
		close(reason: string): void
	}
	
	const room: Room
	export default room;
}

declare module "varhub:config" {
	const value: any
	export default value;
}
declare module "varhub-modules:*" {
	import {ModuleDescription} from "varhub-ws-client";
	export const __MODULE_FAKE__: ModuleDescription;
}