/** Prints the graph as a Mermaid diagram: `npm run graph` (paste into https://mermaid.live). */
import { buildGraph } from "./graph";

const graph = await buildGraph().getGraphAsync();
console.log(graph.drawMermaid());
