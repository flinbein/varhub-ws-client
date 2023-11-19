export type ModuleDescription = ModuleJsDescription | ModuleJsonDescription;
export interface ModuleJsDescription {
	type: "js",
	source?: string,
	evaluate?: boolean
	hooks?: string[] | Record<string, string|boolean>
}
export interface ModuleJsonDescription {
	type: "json",
	source: string
}