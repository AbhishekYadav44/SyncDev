import http from "http";
import app from "./app.js";
import { initws } from "./ws/index.js";
const server = http.createServer(app);
initws(server);
server.listen(8080, "0.0.0.0", () => {
    console.log("running");
});
//# sourceMappingURL=server.js.map