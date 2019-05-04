const mongoose = require("mongoose");

let cSchema = new mongoose.Schema({
	card: {},
	marked: Boolean,
	public: Boolean,
	owner: Boolean,
});

let pSchema = new mongoose.Schema({
	user: {},
	zones: {
		deck: [cSchema],
		hand: [cSchema],
		supp: [cSchema],
		play: [{
			card: {},
			damage: Number,
			counters: Number,
			notes: String,
			inBattle: Boolean,
			state: { type: String, enum: ["prepared", "flipped", "expended"] },
			marked: Boolean,
			public: Boolean,
			owner: Boolean,
		}],
		disc: [cSchema],
	},
	health: Number,
	gold: Boolean,
	goldFaction: { type: String, enum: ["GOOD", "SAGE", "EVIL", "WILD", ""] },
	waitingOn: Boolean,
});

module.exports = new mongoose.Schema({
	p0: pSchema,
	p1: pSchema,
	turn: Boolean,
	phase: {
		type: String,
		enum: [
			"start",
			"main",
			"battle-0",
			"battle-1",
			"battle-2",
			"battle-3",
			"battle-4",
			"end",
		]
	},
	initiative: Boolean,
	log: [{}],
})
