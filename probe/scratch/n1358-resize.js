const sharp = require("sharp");
const [,, inFile, outFile] = process.argv;
sharp(inFile).resize(1600, 1600, { fit: "inside" }).jpeg({ quality: 85 }).toFile(outFile)
  .then(info => console.log("resized", info))
  .catch(e => { console.error(e); process.exit(1); });
