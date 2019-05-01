const mongoose = require("mongoose");
mongoose.connect(process.env.DB_URL, { useNewUrlParser: true });

const gameSchema = require("./schema");
const Game = mongoose.model("Game", gameSchema, "Game");

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
	goldVal: v => ~"01GSEW".split("").indexOf(v),
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
			case "move":
			case "banish": {
				let [id, zone] = data;
				if(!/^p[01]\.(deck|disc|play|supp|hand)$/.test(zone))
					break;
				let dest = (game["p" + zone[1]] || {}).zones[zone.slice(3)];
				console.log(id, zone, dest);
				if(!dest) break;
				let c;
				let [, source] = [].concat(
					Object.entries(game.toJSON().p0.zones),
					Object.entries(game.toJSON().p1.zones),
				).find(([, z]) => {
					c = z.find(c => c._id.toString() === id);
					if(!c) return false;
					z.splice(z.indexOf(c), 1);
					return true;
				}) || [];
				if(!source) break;
				if(type !== "banish" || !zone.endsWith(".deck"))
					dest.unshift(c);
				else
					dest.push(c);
				if(zone.endsWith(".hand"))
					ws[zone.slice(0, 2)].s("identity", id, c.card);
				else if(!zone.endsWith(".deck"))
					ws.s(...ws.o.s("identity", id, c.card));
				ws.o.s(type, ...data);
				break;
			}
			case "battle":
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
					battle: [true, false],
					notes: [val === val.toString() ? val : NaN],
					damage: [...Array(100)].map((_, i) => i),
					counters: [...Array(100)].map((_, i) => i),
					marked: [true, false],
				}[type]).indexOf(val))
					break;
				c[type === "battle" ? "inBattle" : type] = val;
				ws.o.s(type, ...data);
			}
		}
		let last = type.split(".").reverse()[0];
		if(
			~"p0.gold p0.goldFaction p1.gold p1.goldFaction p0.health p1.health turn phase initiative"
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
		}
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
	ws2.s("n", 1);
}

module.exports = { setup, handle };
