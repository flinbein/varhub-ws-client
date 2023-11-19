declare module "varhub:room" {
	
	class Client {
		get online(): boolean;
		get joinTime(): number;
		get id(): string;
		send(...args: any): void;
		kick(message: string): boolean;
	}
	
	class JoinEvent extends Event {
		get client(): Client;
		get message(): any;
		get messages(): any[];
	}
	class LeaveEvent extends Event {
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
	
	export const getClients: () => Client[]
	export const getClientById: (id: string) => Client | undefined
	export const addEventListener: <T extends keyof RoomEvents>(
		type: RoomEvents[T],
		listener: TypedEventListener<T> | TypedEventListenerObject<T>,
		options?: AddEventListenerOptions | boolean,
	) => void;
	
	export const removeEventListener: <T extends keyof RoomEvents>(
		type: RoomEvents[T],
		listener: TypedEventListener<T> | TypedEventListenerObject<T>,
		options?: EventListenerOptions | boolean,
	) => void;
	
	export const send: (clients: Client|string|(Client|string)[], ...message: any) => void
	export const broadcast: (...message: any) => void
	
	export const close: (reason: string) => void
}

declare module "varhub:config" {
	const value: any
	export default value;
}

declare module "inner:timer" {
	export const syncTime: () => number
}