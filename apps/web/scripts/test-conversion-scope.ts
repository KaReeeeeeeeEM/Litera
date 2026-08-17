import assert from "node:assert/strict";
import { defaultConversionConfig } from "../src/components/device/device-types";
import { selectedSourcePages } from "../src/lib/device-pipeline/conversion-scope";

assert.deepEqual(selectedSourcePages(10, defaultConversionConfig), [1,2,3,4,5,6,7,8,9,10]);
assert.deepEqual(selectedSourcePages(20, { ...defaultConversionConfig, scope: "range", pageFrom: "7", pageTo: "10" }), [7,8,9,10]);
assert.deepEqual(selectedSourcePages(184, { ...defaultConversionConfig, scope: "split", pageParts: "7-10, 42, 157-159" }), [7,8,9,10,42,157,158,159]);
assert.deepEqual(selectedSourcePages(10, { ...defaultConversionConfig, scope: "split", pageParts: "9-20, 3" }), [3,9,10]);

console.log("Conversion scope regression tests passed.");
