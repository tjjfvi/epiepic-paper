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
let vs = {
	goldFaction: f => ~["", "GOLD", "SAGE", "EVIL", "WILD"].indexOf(f),
	gold: isBool,
	health: n => !isNaN(+n) && +n === Math.floor(+n),
	turn: isBool,
	phase: p => ~phases.indexOf(p),
	initiative: isBool,
	waitingOn: isBool,
	nnInt: n => !isNaN(+n) && +n === Math.floor(+n) && +n >= 0,
};

function handle(ws, type, ...data){
	let { sp } = ws;
	ws.sp = ws.o.sp = (async () => {
		await sp;
		let { game } = ws;
		switch(type) {
			case "deck": {
				if(ws.deck) break;
				ws.deck = [].concat(...data[0].map(({ count, card }) => [...Array(count)].map(() => ({ card }))));
				if(!ws.o.deck) break;
				game.p0.zones.deck = ws.p0.deck.shuffle();
				game.p1.zones.deck = ws.p1.deck.shuffle();
				let obj = game.toJSON();
				[...obj.p0.zones.deck, ...obj.p1.zones.deck].map(c => {
					delete c.card
				});
				ws.s(...ws.o.s("game", obj));
				break;
			}
			case "unreveal":
			case "reveal": {
				let [id] = data;
				let c = game["p" + ws.n].zones.hand.find(c => c._id.toString() === id);
				if(!c)
					break;
				ws.o.s("identity", id, type === "reveal" ? c.card : null);
				c.public = true;
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
				let [, source] = [].concat(...[
					Object.entries(game.toJSON().p0.zones),
					Object.entries(game.toJSON().p1.zones),
				].map((z, i) => z.map(([n, z]) => [i, n, z]))).find(([i, n, z]) => {
					c = z.find(c => c._id.toString() === id);
					if(!c) return false;
					console.log(game["p" + i].zones[n]);
					game["p" + i].zones[n].splice(z.indexOf(c), 1);
					return true;
				}) || [];
				if(!source) break;
				if(c.card.packCode === "tokens" && !zone.endsWith(".play")) {
					ws.s(...ws.o.s("delete", id));
					break;
				}
				if(type !== "banish" || !zone.endsWith(".deck"))
					dest.unshift(c);
				else
					dest.push(c);
				if(zone.endsWith(".hand"))
					ws[zone.slice(0, 2)].s("identity", id, c.card);
				else if(!zone.endsWith(".deck")) {
					ws.s(...ws.o.s("identity", id, c.card));
					c.public = true;
				}
				ws.o.s(type, ...data);
				break;
			}
			case "token": {
				let [cardId] = data;
				let card = await fetch(process.env.API_BASE_URL + `api/card:${cardId}/`)
					.then(r => r.json())
					.catch(() => {});
				if(!card)
					break;
				let _id = new mongoose.Types.ObjectId();
				let c = { _id, card, damage: 0, counters: 0 };
				game["p" + ws.n].zones.play.unshift(c);
				ws.s(...ws.o.s("token", "p" + ws.n, c));
				break;
			}
			case "inBattle":
			case "marked":
			case "notes":
			case "damage":
			case "counters":
			case "state": {
				let [id, val] = data;
				let c =
					game.p0.zones.play.find(c => c._id.toString() === id) ||
					game.p1.zones.play.find(c => c._id.toString() === id);
				if(!c) break;
				if(!~({
					state: ["prepared", "flipped", "expended"],
					inBattle: [true, false],
					notes: [val === val.toString() ? val : NaN],
					damage: [vs.nnInt(val) ? val : NaN],
					counters: [vs.nnInt(val) ? val : NaN],
					marked: [true, false],
				}[type]).indexOf(val))
					break;
				c[type] = val;
				ws.o.s(type, ...data);
				break;
			}
			case "concede": {
				game.remove();
				break;
			}
		}
		let last = type.split(".").reverse()[0];
		if(
			~"p0.waitingOn p1.waitingOn p0.gold p0.goldFaction p1.gold p1.goldFaction p0.health p1.health turn phase initiative"
				.split(" ").indexOf(type) &&
		vs[last] &&
		vs[last](data[0])
		) {
			ws.o.s(type, ...data);
			type.split(".").reduce((ob, p, i, a) => i === a.length - 1 ? ob[p] = data[0] : ob[p], game);
		}
		await game.save();
	})();
}

function setup(ws1, ws2){
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
		waitingOn: ws === ws1,
	});
	let game = new Game({
		p0: genP(ws1),
		p1: genP(ws2),
		turn: false,
		phase: "start",
		initiative: false,
	});
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
}

function reconnect(ws1, ws2, game){
	if(ws1.user._id !== game.p0.user._id)
		[ws2, ws1] = [ws1, ws2];
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
	let obj = game.toJSON();
	[obj.p1.zones.hand, obj.p0.zones.deck, obj.p1.zones.deck].map(z => z.map(c =>
		c.public || delete c.card
	));
	ws1.s("game", obj);
	obj = game.toJSON();
	[obj.p0.zones.hand, obj.p0.zones.deck, obj.p1.zones.deck].map(z => z.map(c =>
		c.public || delete c.card
	));
	ws2.s("game", obj);
}

module.exports = { setup, handle, reconnect };
