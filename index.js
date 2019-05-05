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
const Game = require("./Game");

const generateCard = require("./generateCard");

const b = browserify({
	entries: [__dirname + "/static/js/index.js"],
	cache: {},
	packageCache: {},
	debug: !!process.env.DEBUG,
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
	reconnecting: {},
	byId:    {},
}

app.use(require("cookie-parser")());

app.ws("/ws", async (ws, req) => {

	let token = req.cookies.token;

	let user = await fetch(`${API_BASE_URL}api/user/current`, {
		headers: { Cookie: `token=${token}` }
	}).then(r => r.json()).catch(() => (ws.close(), null));

	if(!user) return;

	ws.user = user;

	ws.reconnectGames = Game.find({ $or: [{ "p0.user._id": user._id }, { "p1.user._id": user._id }] }).then(games => {
		ws.s("reconnectGames", games.map(game => {
			let oUser = game.p0.user._id === user._id ? game.p1.user : game.p0.user;
			let oConnected = !!wss.reconnecting[game];
			return { oUser, oConnected, _id: game._id };
		}))
		return games;
	});

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

	ws.on("message", async message => {
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

				gm.handle(ws, ...data).catch(gmError(ws));

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

				gm.setup(ws2, ws).catch(gmError(ws));

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
			case "reconnect": {
				if(ws.status !== "waiting")
					return;

				let [id] = data;

				let games = await ws.reconnectGames;
				console.log(games);
				let game = games.find(g => g._id.toString() === id);

				if(!game)
					return;

				let ws2 = wss.reconnecting[id];

				if(ws2 === ws)
					return;

				if(ws2) {
					ws.status = ws2.status = "playing";
					sendStatus(ws, ws2);
					return gm.reconnect(ws, ws2, game).catch(gmError(ws));
				}

				ws.status = "reconnectWait";
				sendStatus(ws);

				wss.reconnecting[id] = ws;

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
app.use("/api", (req, res) =>
	req.pipe(require("request")(API_BASE_URL + "api" + req.url, { headers: req.headers }).on("response", r => {
		res.set(r.headers)
	})).pipe(res)
);
app.get("/images/:id.svg", (req, res) =>
	fetch(API_BASE_URL + `api/card:${req.params.id}/`)
		.then(r => r.json())
		.then(c => res.set("Content-Type", "image/svg+xml").send(generateCard(c)))
);
app.get("/images/:id", (req, res) => res.redirect(302, BASE_URL + req.path.slice(1) + ".svg"));

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

function gmError(ws){
	return e => {
		ws.status = ws.o.status = "error";
		sendStatus(ws, ws.o);
		console.error(ws.game._id, e);
	}
}
