const fetch = require("node-fetch");
const mongoose = require("mongoose");
mongoose.connect(process.env.DB_URL, { useNewUrlParser: true });

const Game = require("./Game");

const phases = [
	"start",
	"main",
	"battle-0",
	"battle-1",
	"battle-2",
	"battle-3",
	"battle-4",
	"end",
];
let isBool = b => ~[true, false].indexOf(b);
let int = n => !isNaN(+n) && +n === Math.floor(+n);
let nnInt = n => int(n) && +n >= 0
let vs = {
	goldFaction: f => ~["", "GOLD", "SAGE", "EVIL", "WILD"].indexOf(f),
	gold: isBool,
	health: int,
	turn: isBool,
	phase: p => ~phases.indexOf(p),
	initiative: isBool,
	waitingOn: isBool,
	attention: isBool,
	inBattle: isBool,
	marked: isBool,
	deploying: isBool,
	damage: nnInt,
	counters: nnInt,
	offAdjust: nnInt,
	defAdjust: nnInt,
	state: s => ~["prepared", "expended", "flipped"].indexOf(s),
};

const games = {};

async function handle(ws, _type, ..._data){
	if(ws.ss) return;
	let { sp } = ws;
	await (ws.sp = ws.o.sp = (async () => {
		await sp;
		let { game } = ws;
		if(_type !== "batch")
			_data = [[_type, ..._data]];
		for(let [type, ...data] of _data) {
			switch(type) {
				case "deck": {
					if(ws.deck) break;
					ws.deck = [].concat(...data[0].map(({ count, card }) => [...Array(count)].map(() => ({
						card,
						marked: false,
						owner: !!ws.n,
					}))));
					if(!ws.o.deck) break;
					game.p0.zones.deck = ws.p0.deck.shuffle();
					game.p1.zones.deck = ws.p1.deck.shuffle();
					let obj = game.toJSON();
					[...obj.p0.zones.deck, ...obj.p1.zones.deck].map(c => {
						delete c.card
					});
					ws.allS("game", obj);
					ws.allS("oActive", true);
					module.exports.pushGame(game);
					break;
				}
				case "unreveal":
				case "reveal": {
					let [id] = data;
					let c = game["p" + ws.n].zones.hand.find(c => c._id.toString() === id);
					if(!c)
						break;
					ws.allS("identity", id, type === "reveal" ? c.card : null);
					c.public = type === "reveal";
					ws.allS("public", id, c.public);
					log(ws, { type, p: ws.n, card: id });
					break;
				}
				case "move":
				case "banish": {
					let [id, zone] = data;
					if(!/^p[01]\.(deck|disc|play|supp|hand)$/.test(zone))
						break;
					let dest = (game["p" + zone[1]] || {}).zones[zone.slice(3)];
					if(!dest) break;
					let c;
					let [sourceP, sourceZone, source] = [].concat(...[
						Object.entries(game.toJSON().p0.zones),
						Object.entries(game.toJSON().p1.zones),
					].map((z, i) => z.map(([n, z]) => [i, n, z]))).find(([i, n, z]) => {
						c = z.find(c => c._id.toString() === id);
						if(!c) return false;
						game["p" + i].zones[n].splice(z.indexOf(c), 1);
						return true;
					}) || [];
					if(!source) break;
					if(c.card.packCode === "tokens" && !zone.endsWith(".play")) {
						ws.allS("delete", id);
						log(ws, { type: "delete", card: id, p: sourceP });
						break;
					}
					if(type !== "banish" || !zone.endsWith(".deck"))
						dest.unshift(c);
					else
						dest.push(c);
					if(zone.endsWith(".hand"))
						ws[zone.slice(0, 2)].s("identity", id, c.card);
					else if(!zone.endsWith(".deck")) {
						ws.allS("identity", id, c.card);
						c.public = true;
						ws.allS("public", id, c.public);
					}
					ws.allS(type, ...data);
					log(ws, { type, card: id, source: `p${sourceP}.${sourceZone}`, dest: zone });
					break;
				}
				case "token": {
					let [cardId, n] = data;
					let card = await fetch(process.env.API_BASE_URL + `api/card:${cardId}/`)
						.then(r => r.json())
						.catch(() => {});
					if(!card)
						break;
					let _id = new mongoose.Types.ObjectId();
					let c = { _id, card, damage: 0, counters: 0, offAdjust: 0, defAdjust: 0, marked: false, owner: !!n, deploying: true };
					game["p" + n].zones.play.unshift(c);
					ws.allS("token", "p" + n, c);
					log(ws, { type: "move", card: _id, dest: `p${ws.n}.play` });
					break;
				}
				case "inBattle":
				case "deploying":
				case "marked":
				case "notes":
				case "damage":
				case "counters":
				case "offAdjust":
				case "defAdjust":
				case "state": {
					let [id, val] = data;
					let c = type === "marked" ?
						[].concat(..."play deck disc supp hand".split(" ").map(n => [...game.p0.zones[n], ...game.p1.zones[n]]))
							.find(c => c._id.toString() === id) :
						game.p0.zones.play.find(c => c._id.toString() === id) ||
					game.p1.zones.play.find(c => c._id.toString() === id);
					if(!c) break;
					if(!vs[type](val))
						break;
					let from = c[type];
					c[type] = val;
					ws.allS(type, ...data);
					if(val !== from)
						log(ws, { type: "cardSet", p: ws.n, card: id, prop: type, val, from });
					break;
				}
				case "concede": {
					game.finished = true;
					ws.allS("won");
					ws.close();
					if(ws.o.close) ws.o.close();
					module.exports.popGame(game);
					break;
				}
				default: {
					console.log(type, data);
					let last = type.split(".").reverse()[0];
					if(
						~"p0.waitingOn p1.waitingOn p0.attention p1.attention p0.gold p0.goldFaction p1.gold p1.goldFaction p0.health p1.health turn phase initiative"
							.split(" ").indexOf(type) &&
						vs[last] &&
						vs[last](data[0])
					) {
						let from;
						ws.allS(type, ...data);
						type.split(".").reduce((ob, p, i, a) =>
							i === a.length - 1 ? (from = ob[p], ob[p] = data[0]) : ob[p]
						, game);
						log(ws, { type: "set", prop: type, val: data[0], p: ws.n, from });
					}
				}
			}
		}
		await game.save();
	})());
}

function log(ws, ...log){
	ws.allS("log", ...log);
	ws.game.log.push(...log);
}

async function setup(ws1, ws2, password){
	if(Math.random() > .5)
		[ws1, ws2] = [ws2, ws1];
	let genP = ws => ({
		user: ws.user,
		health: 30,
		gold: 1,
		goldFaction: "",
		zones: {
			deck: [],
			supp: [],
			disc: [],
			play: [],
			hand: [],
		},
		waitingOn: true,
	});
	let game = new Game({
		p0: genP(ws1),
		p1: genP(ws2),
		turn: false,
		phase: "start",
		initiative: false,
		log: [],
		password,
	});
	games[game._id.toString()] = game;
	game.p0.ws = ws1;
	game.p1.ws = ws2;
	game.ss = [];
	ws1.game = game;
	ws2.game = game;
	ws1.o = ws2;
	ws2.o = ws1;
	ws1.p0 = ws1;
	ws2.p0 = ws1;
	ws1.p1 = ws2;
	ws2.p1 = ws2;
	ws1.s("n", 0);
	ws1.n = 0;
	ws2.s("n", 1);
	ws2.n = 1;
	ws1.s("pUser", game.p0.user);
	ws1.s("oUser", game.p1.user);
	ws2.s("pUser", game.p1.user);
	ws2.s("oUser", game.p0.user);
	ws1.allS = ws2.allS = allS(() => [ws1, ws2, ...game.ss]);
}

async function reconnect(ws, game){
	games[game._id.toString()] = game = games[game._id.toString()] || game;
	if(!game.ss) game.ss = [];
	ws.n = +(ws.user._id !== game.p0.user._id || (game.p0.ws || { readyState: -1 }).readyState === 1);
	game["p" + ws.n].ws = ws;
	ws.game = game;
	ws.o = game["p" + +!ws.n].ws || { s: (...a) => a, fake: true };
	ws.o.o = ws;
	ws.p0 = ws.n ? ws.o : ws;
	ws.p1 = ws.n ? ws : ws.o;
	ws.s("n", ws.n);
	ws.s("log", ...game.log);
	let obj = game.toJSON();
	[obj["p" + +!ws.n].zones.hand, obj.p0.zones.deck, obj.p1.zones.deck].map(z => z.map(c =>
		c.public || delete c.card
	));
	ws.s("game", obj);
	ws.s("oActive", !ws.o.fake);
	ws.o.s("oActive", true);
	ws.allS = ws.o.allS = allS(() => [ws, ws.o, ...game.ss]);
}

async function spectate(ws, id, pswd){
	let game = games[id.toString()] = games[id.toString()] || await Game.findById(id);
	if(!game.ss) game.ss = [];
	if(game.password && pswd !== game.password)
		return ws.s("joinFailed");
	ws.s("status", ws.status = "playing");
	ws.ss = true;
	ws.s("spectate", true);
	let obj = game.toJSON();
	[obj.p0.zones.deck, obj.p1.zones.deck, obj.p0.zones.hand, obj.p1.zones.hand].map(z => z.map(c =>
		c.public || delete c.card
	));
	ws.s("game", obj);
	ws.s("log", ...game.log);
	ws.s("n", 0);
	game.ss.push(ws);
}

function allS(f){
	return (...data) => f().map(ws => ws.s(...data));
}

module.exports = { setup, handle, reconnect, spectate };
