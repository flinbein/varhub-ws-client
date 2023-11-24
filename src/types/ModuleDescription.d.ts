export type ModuleDescription = ModuleJsDescription | ModuleJsonDescription | ModuleTextDescription | ModuleBinDescription;
export interface ModuleJsDescription {
	type: "js",
	source?: string,
	evaluate?: boolean
	hooks?: string[] | Record<string, string|boolean> | "*"
}
export interface ModuleJsonDescription {
	type: "json",
	source: string
}

export interface ModuleTextDescription {
	type: "text",
	source: string
}
export interface ModuleBinDescription {
	type: "bin",
	source: Uint8Array
}