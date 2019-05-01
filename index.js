require("dotenv").config();
require("./utils");

const express = require("express");
const browserify = require("browserify");
const watchify = require("watchify");
const crypto = require("crypto");
const fs = require("fs");
const stylus = require("stylus");
const { promisify } = require("util");
const fetch = require("node-fetch");

const gm = require("./gm");

const b = browserify({
	entries: [__dirname + "/static/js/index.js"],
	cache: {},
	packageCache: {},
	debug: true,
	plugin: [watchify],
})

const { BASE_URL, API_BASE_URL } = process.env;

b.on("update", bundle)
bundle()

function bundle(){
	console.log("Bundling client JS");
	b.bundle()
		.on("end", () => console.log("Bundled client JS"))
		.on("error", console.error)
		.pipe(fs.createWriteStream(__dirname + "/static/bundle.js"))
}

const app = express();
require("express-ws")(app);

app.use(express.static(__dirname + "/static/"));

app.get("/bundle.css", async (req, res) => {
	res.set("Content-Type", "text/css").send(await promisify(stylus.render)(
		`@import '${__dirname + "/static/stylus/"}*'`,
		{ filename: "_.styl" },
	));
});

let wss = {
	waiting: [],
	hosting: [],
	byId:    {},
}

app.use(require("cookie-parser")());

app.ws("/ws", async (ws, req) => {

	let token = req.cookies.token;

	let user = await fetch(`${API_BASE_URL}api/user/current`, {
		headers: { Cookie: `token=${token}` }
	}).then(r => r.json()).catch(() => (ws.end(), null));

	if(!user) return;

	ws.user = user;

	ws.s = function(...data){
		if(this.readyState !== 1)
			return;

		this.send(JSON.stringify(data));

		return data;
	}

	ws.status = "waiting";

	wss.waiting.push(ws);

	sendGames([ws]);

	setInterval(() => ws.s("ping"), 1000);

	ws.on("message", message => {
		let type, data;
		try {
			[type, ...data] = JSON.parse(message);
		} catch (e) {
			return;
		}

		switch(type) {
			case "move": {
				if(ws.status !== "playing")
					return;

				gm.handle(ws, ...data);

				break;
			}

			case "join": {
				if(ws.status !== "waiting")
					return;

				let [id, pswd] = data;

				let ws2 = wss.byId[id];

				if(!ws2 || !~wss.hosting.indexOf(ws2) || pswd !== ws2.pswd)
					return ws.s("joinFailed");

				wss.hosting.splice(wss.hosting.indexOf(ws2), 1);
				wss.waiting.splice(wss.waiting.indexOf(ws), 1);
				sendGames();

				ws.o  = ws2;
				ws2.o =  ws;

				ws.status = ws2.status = "playing";
				sendStatus(ws, ws2);

				gm.setup(ws2, ws);

				break;
			}

			case "host": {
				if(ws.status !== "waiting")
					return;

				let [name, pswd] = data;

				ws.id = genId();
				wss.byId[ws.id] = ws;
				ws.name = name;
				ws.pswd = pswd;

				wss.waiting.splice(wss.waiting.indexOf(ws), 1);
				wss.hosting.push(ws);
				sendGames();

				ws.status = "hosting";

				sendStatus(ws);

				break;
			}
		}
	})

	ws.on("close", () => {
		switch(ws.status) {
			case "waiting":
				wss.waiting.splice(wss.waiting.indexOf(ws), 1);
				break;

			case "hosting":
				wss.hosting.splice(wss.hosting.indexOf(ws), 1);
				sendGames();
				break;

			case "playing":
				ws.o.s("close");
				ws.o.close();
		}
	})

})

app.get("/login", (req, res) => res.redirect(API_BASE_URL + "api/discord/login?redirect=" + encodeURIComponent(BASE_URL)))
app.use("/api", (req, res) => res.redirect(API_BASE_URL + "api" + req.path));
app.use("/images", (req, res) => res.redirect(API_BASE_URL + "images" + req.path));

const port = process.env.PORT || 22563;

app.listen(port, () => console.log(`Listening on http://localhost:${port}/`))

function sendGames(ws_ = wss.waiting){
	ws_.map(ws => ws.s("games", wss.hosting.map(({ id, name, pswd }) => ({
		id,
		name,
		pswd: !!pswd,
	}))));
}

function sendStatus(...wss){
	wss.map(ws => ws.s("status", ws.status));
}

function genId(){
	return crypto.randomBytes(4).toString("hex");
}
