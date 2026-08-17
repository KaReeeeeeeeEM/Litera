import { createServer } from "node:http";
import { createGeometryStoryboardHtml } from "../src/lib/device-pipeline/geometry-storyboard-engine";

const html = createGeometryStoryboardHtml(
  {
    number: 22,
    width: 700,
    height: 900,
    layoutBlocks: [
      {
        type: "text",
        bbox: { x: 70, y: 90, w: 540, h: 42 },
        text: "Zoezi la 4",
        font: { size: 28, weight: "bold", color: "#99510f" },
      },
      {
        type: "text",
        bbox: { x: 70, y: 190, w: 470, h: 28 },
        text: "(a) 9000 + 800 + 70 + 2 =",
        font: { size: 20, weight: "bold" },
      },
      { type: "image", bbox: { x: 555, y: 218, w: 105, h: 3 } },
    ],
  },
  {},
  { decoration: { top: "#f7f4e8", bottom: "#f7f4e8", accent: "#b45309" } },
);

createServer((_request, response) => {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}).listen(4179, "127.0.0.1", () => {
  console.log("Math question verification page: http://127.0.0.1:4179");
});
