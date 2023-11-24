const {Transformer} = require("@parcel/plugin");
const mimeTypes = require("mime-types");

module.exports = new Transformer({
	async transform({asset}) {

		asset.specifierType = asset.specifierType || asset.type;
		if (asset.type === 'json') {
			const source = await asset.getCode();
			asset.setCode(`module.exports=${JSON.stringify(source)}`)
			asset.type = "js";
			return [asset];
		}

		if (asset.type === 'js') {
			if (asset.specifierType !== "js") return [asset];
			const source = await asset.getCode();
			asset.setCode(`module.exports=${JSON.stringify(source)}`)
			asset.pipeline = "";
			asset.type = 'js';
			return [asset];
		}

		const mimeType = mimeTypes.types[asset.type] ?? "";
		if (mimeType.startsWith("text/")) {
			const source = await asset.getCode();
			asset.setCode(`module.exports=${JSON.stringify(source)}`);
			// asset.setCode(`export const type = "text"; export const source = ${JSON.stringify(source)};`);
			asset.type = 'js';
			return [asset];
		}

		const buffer = await asset.getBuffer();
		asset.setCode(`module.exports=Uint8Array.of(${[...buffer]})`)
		asset.type = 'js';
		return [asset];
	}
});
