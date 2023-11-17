export interface RoomDescription {
	type: "js",
	source?: string,
	evaluate?: boolean
	hooks?: string[] | Record<string, string|boolean>
}