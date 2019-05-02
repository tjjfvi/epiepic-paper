module.exports = class {

	constructor(root){
		let self = this;
		const { ko, $ } = root.globals;

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

		self.rightClick = ko.observable([]);
		self.cardPopup = ko.observable(null);

		self.deckChoice = new function(){
			this.done = ko.observable(false);
			this.wrong = ko.observable(false);
			this.deckId = ko.observable("");
			this.submitDeck = () => {
				fetch(`/api/deck:${this.deckId()}/`)
					.then(r => r.json()).then(d => d.cards)
					.then(cards => root.ws.s("move", "deck", cards))
					.then(() => this.done(true))
					.catch(() => this.wrong(true))
			};
		}();
		self.started = ko.observable(false);
		self.n = ko.observable(0);
		self.oUser = ko.observable();
		self.pUser = ko.observable();
		"Deck Disc Supp Play Hand".split(" ").map(n => {
			self["p" + n] = ko.observableArray([]);
			self["o" + n] = ko.observableArray([]);
		});

		self.cards = {};

		let isBool = b => ~[true, false].indexOf(b);
		self.vs = {
			goldFaction: f => ~["", "GOLD", "SAGE", "EVIL", "WILD"].indexOf(f),
			gold: isBool,
			health: n => !isNaN(+n) && +n === Math.floor(+n),
			turn: isBool,
			phase: p => ~phases.indexOf(p),
			initiative: isBool,
			waitingOn: isBool,
		};


		self.moveFuncs = { "": () => {} };

		"Deck Disc Supp Play Hand".split(" ").map(n => self.moveFuncs[n.toLowerCase()] = (oa, card) => {
			root.ws.s("move", "move", card._id, `p${self.n()}.${n.toLowerCase()}`);
			oa.remove(card);
			self["p" + n].unshift(card);
			card.damage(0);
			card.counters(0);
			card.state("");
		});

		self.moveFuncs.playCard = (oa, card) =>
			self.moveFuncs[card.card().type === "CHAMPION" ? "play" : "supp"](oa, card);

		self.moveFuncs.battle = (oa, card) => {
			if(card.inBattle())
				return card.inBattle(false);
			let attacking = +self.game.turn() === +self.n();
			if(attacking && self.game.phase() === "main") {
				self.game.phase("battle-0");
				self.p.waitingOn(true);
				self.o.waitingOn(false);
			}
			if(self.game.phase() !== (attacking ? "battle-0" : "battle-2"))
				return;
			card.inBattle(!card.inBattle());
		};

		self.moveFuncs.mark = (oa, card) => card.marked(!card.marked());

		self.moveFuncs.banish = (oa, card) => {
			root.ws.s("move", "banish", card._id, `p${self.n()}.deck`);
			self.pDeck.push(card);
			oa.remove(card);
		}

		self.moveFuncs.reveal = (oa, card) =>
			root.ws.s("move", "reveal", card._id);

		self.moveFuncs.unbanish = oa =>
			self.moveFuncs.supp(oa, oa()[oa().length - 1]);

		self.moveFuncs.unreveal = (oa, card) =>
			root.ws.s("move", "unreveal", card._id);

		self.moveFuncs.unrevealO = (oa, card) =>
			card.card(null);

		self.moveFuncNames = {
			disc: "Discard",
			supp: "Supplemental",
			deck: "Top of Deck",
			unrevealO: "Unreveal",
		};

		self.phaseName = ko.computed(() => self.started() ? {
			start: "Start phase",
			main: "Main phase",
			"battle-0": "Declare Attackers",
			"battle-1": "Attack Events",
			"battle-2": "Declare Blockers",
			"battle-3": "Block Events",
			"battle-4": "Assign Damage",
			end: "End phase",
		}[self.game.phase()] : "");

		self.hideInitiative = ko.computed(() => self.started() ? ~[
			"start",
			"battle-0",
			"battle-2",
			"battle-4",
			"end",
		].indexOf(self.game.phase()) : false);

		"expend flip prepare".split(" ").map(n => self.moveFuncs[n] = (oa, card) => {
			let ned = n === "flip" ? "flipped" : n + "ed";
			card.state(ned);
		});


		let wsObservables = {
			n: self.n
		};

		self.cyclePhase = () => {
			let phase = self.game.phase();
			let change = {
				start:      ["main", true, false, false],
				main:       ["end", true, true, false],
				"battle-0": ["battle-1", true, false, false],
				"battle-1": ["battle-2", true, false, true],
				"battle-2": ["battle-3", false, false, false],
				"battle-3": ["battle-4", true, true, false],
				"battle-4": ["main", true, false, false],
				end:        ["start", false, false, true],
			}[phase];

			change[1] ^= !self.game.turn();
			if(self.game.turn())
				[change[2], change[3]] = [change[3], change[2]];
			[self.game.phase, self.game.initiative, self.game.p0.waitingOn, self.game.p1.waitingOn]
				.map((o, i) => o(change[i]));

			if(phase === "end") {
				self.o.gold(true);
				self.o.goldFaction("");
				self.p.gold(true);
				self.p.goldFaction("");
				self.game.turn(!self.game.turn());
			} else if(phase === "battle-0") {
				let zone = self[(self.game.turn() ^ self.n() ? "o" : "p") + "Play"];
				zone().filter(c => c.inBattle()).map(c => self.moveFuncs.expend(zone, c));
			} else if(phase === "battle-2") {
				let zone = self[(self.game.turn() ^ self.n() ? "p" : "o") + "Play"];
				zone().filter(c => c.inBattle()).map(c => self.moveFuncs.flip(zone, c));
			} else if(phase === "battle-4") {
				[self.oPlay, self.pPlay].map(z => z().map(c => c.inBattle() ? self.moveFuncs.battle(z, c) : {}));
			}
		}

		self.cyclePhaseAlt = () => {
			self.game.phase({
				start: "end",
				main: "start",
				end: "main",
				"battle-0": "main",
				"battle-1": "battle-0",
				"battle-2": "battle-1",
				"battle-3": "battle-2",
				"battle-4": "battle-3",
			}[self.game.phase()]);

			self.game.initiative(!!self.n());
			self.p.waitingOn(true);
			self.o.waitingOn(false);
		}

		root.on("ws", ({ type, data }) => {
			if(type === "game") {
				let [game] = data;
				self.game = game;
				self.p = game.p = game["p" + self.n()];
				self.o = game.o = game["p" + +!self.n()];
				console.log(self.p, self.n());
				let f = n => {
					let o = ko.observable(n.split(".").reduce((o, p) => o[p], game));
					let c = ko.computed({
						read: o,
						write: v => {
							o(v);
							if(self.vs[n.split(".").pop()](v))
								root.ws.s("move", n, v);
						},
					});
					n.split(".").reduce((ob, p, i, a) => i === a.length - 1 ? ob[p] = c : ob[p], game);
					wsObservables[n] = o;
					return o;
				}
				`
					p0.gold p0.goldFaction
					p1.gold p1.goldFaction
					p0.health p1.health
					p0.waitingOn p1.waitingOn
					turn phase initiative
				`
					.trim().split(/\s+/g).map(f);
				self.oUser(game.o.user);
				self.pUser(game.p.user);
				"Deck Disc Play Supp Hand".split(" ").map(z => ["p", "o"].map(p =>
					self[p + z](game[p].zones[z.toLowerCase()].map(c => {
						c.card = ko.observable(c.card);
						"inBattle state marked notes counters damage"
							.split(" ")
							.map(n => {
								let o = c["_" + n] = ko.observable(c[n]);
								c[n] = ko.computed({
									read: o,
									write: v => {
										o(v);
										if((self.vs[n] || (() => true))(v))
											root.ws.s("move", n, c._id, v);
									},
								});
							});
						c.src = ko.computed(() => `/images/${c.card() ? c.card()._id : "back"}.jpg`);
						self.cards[c._id] = c;
						return c;
					}))
				));
				self.started(true);
			}
			if(type === "identity") {
				let [id, identity] = data;
				self.cards[id].card(identity);
			}
			if(type === "move" || type === "banish") {
				let [id, zoneName] = data;
				let c, zone;
				"Deck Disc Play Hand Supp"
					.split(" ")
					.flatMap(a => ["o" + a, "p" + a])
					.map(n => [n, self[n]])
					.map(([n, z]) => {
						console.log(n, z);
						if((self.n() ^ (n[0] === "p") ^ zoneName[1]) && n.slice(1).toLowerCase() === zoneName.slice(3))
							zone = z;
						return z;
					})
					.find(z => {
						c = z().find(c => c._id === id);
						if(c) z.remove(c);
						return !!c;
					});
				if(type === "banish")
					zone.push(c);
				else
					zone.unshift(c);

			}
			if(~"inBattle state marked notes counters damage".split(" ").indexOf(type))
				self.cards[data[0]]["_" + type](data[1]);
			(wsObservables[type] || (() => {}))(data[0]);
		});

		ko.bindingHandlers.cards = {
			init: (el, valAcc, allBinds, vm, bindCtx) => ko.bindingHandlers.component.init(
				el,
				ko.computed(() => ({
					name: "cards",
					params: { ...allBinds(), cards: valAcc() },
				})),
				allBinds,
				vm,
				bindCtx,
			),
		}

		ko.bindingHandlers.rightClick = {
			init: (el, valAcc) => {
				$(el).on("contextmenu", e => {
					let items = ko.unwrap(valAcc());
					let y = e.originalEvent.clientY;
					let height = 30 * items.length + 1;
					let vh = $("body").height()
					self.rightClick(items);
					$(".rightClick").offset({
						left: e.originalEvent.clientX + 1,
						top: Math.min(y, vh - height),
					});
					return false;
				});
			},
		}

		$("*").on("click contextmenu", () => self.rightClick([]));

		ko.components.register("cards", {
			viewModel: function({ cards, main = "", alt = main }){
				if(!alt.includes("mark"))
					alt = "mark " + alt;
				this.cards = cards;
				this.main = self.moveFuncs[main];
				this.rightClick = c => alt.trim().split(/\s+/g).map(n => ({
					name: self.moveFuncNames[n] || (n[0].toUpperCase() + n.slice(1)).split(/(?=[A-Z][a-z]+)/g).join(" "),
					func: () => self.moveFuncs[n](cards, c),
				}));
				this.click = c => self.double(
					() => this.main(cards, c),
					() => c.card() && !$("input:focus").length && self.cardPopup(c),
				);
			},
			template: `<!-- ko foreach: cards -->
				<div class="card" data-bind="
					css: { battle: inBattle(), marked, expended: state() === 'expended', flipped: state() === 'flipped' },
					click: $parent.click($data),
					rightClick: $parent.rightClick($data),
				">
					<img class="_" src="/314x314.jpg"/>
					<img data-bind="attr: { src }"/>
					<input class="damage" data-bind="textInput: damage, css: { show: damage }"/>
					<input class="counters" data-bind="textInput: counters, css: { show: counters }"/>
				</div>
			<!-- /ko -->`,
		});

		let clickTarget;
		let clickTimeout;
		self.double = (a, b) => {
			let f = () => {
				clearTimeout(clickTimeout);
				if(clickTimeout && clickTarget === f) {
					clickTimeout = null;
					return a();
				}
				clickTarget = f;
				clickTimeout = setTimeout(() => {
					clickTimeout = null;
					b();
				}, 250);
			};
			return f;
		};

		self.draw = self.double(() => self.moveFuncs.hand(self.oDeck, self.oDeck()[0]), () => {});

	}

}
