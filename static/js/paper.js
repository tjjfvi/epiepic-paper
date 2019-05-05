module.exports = class {

	constructor(root){
		let self = this;
		const { ko, $ } = root.globals;

		const phases = [
			"start",
			"main",
			"end",
			"battle-0",
			"battle-1",
			"battle-2",
			"battle-3",
			"battle-4",
		];

		self.rightClick = ko.observable([]);
		self.cardPopup = ko.observable(null);

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

		self.log = ko.observableArray([]);

		self.logHelpers = {
			pClass: n => ({ class: n ^ self.n() ? "them" : "you" }),
			psName: n => n ^ self.n() ? "Their" : "Your",
			pName: n => n ^ self.n() ? "Them" : "You",
			cardName: c => (self.cards[c] || { card: () => '[removed]' }).card() ? self.cards[c].card().name : '?',
			zoneNameFull: z => (z[1] ^ self.n() ? 'Their ' : 'Your ') + self.logHelpers.zoneName(z),
			zoneNameAnti: (z, n) => (z[1] ^ n ? "their " : "") + self.logHelpers.zoneName(z),
			zoneName: z => ({
				supp: 'supplemental',
				disc: 'discard',
			}[z.slice(3)] || z.slice(3)),
			phaseName: p => self.phaseNames[p],
			propName: p => ({
				health: "Health",
				gold: "Gold",
				goldFaction: "Gold Alignment",
				inBattle: "in Battle",
				damage: "Damage",
				counters: "Counters",
				state: "State",
				marked: "Marked",
				deploying: "Deploying",
			})[p],
			valName: (p, v) => ({
				gold: { true: "1", false: "0" },
				health: {},
				goldFaction: {
					"": "None",
					GOOD: "Good",
					SAGE: "Sage",
					EVIL: "Evil",
					WILD: "Wild",
				},
				inBattle: {},
				counters: {},
				damage: {},
				state: {},
				marked: {},
				deploying: {},
			}[p][v] || v)
		};

		self.deckChoice = new function(){
			this.done = ko.observable(false);
			this.wrong = ko.observable(false);
			this.input = ko.observable("");
			this.submitDeck = () => {
				if(/^[0-9a-f]+$/.test(this.input()))
					fetch(`/api/deck:${this.input()}/`)
						.then(r => r.json()).then(d => d.cards)
						.then(cards => root.ws.s("move", "deck", cards))
						.then(() => this.done(true))
						.catch(() => this.wrong(true))
				else
					fetch(`/api/deck/parseList`, {
						method: "POST",
						body: this.input(),
					})
						.then(r => r.json())
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
			self["p" + n].z = "p" + n;
			self["o" + n].z = "o" + n;
		});

		self.tokens = ko.observable(() => []);

		fetch(`/api/card/.json`).then(r => r.json()).then(cs => self.tokens(n => cs
			.filter(c => c.packCode === "tokens")
			.map(c => ({
				name: c.name,
				func: () => root.ws.s("move", "token", c._id, n),
			}))
		));

		self.inc = o => (_, e) => (o(+o() + 1), e.stopPropagation());
		self.dec = (o, m) => (_, e) => (o(Math.max(+o() - 1, m ? 0 : -Infinity)), e.stopPropagation());

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

		"Deck Disc Supp Play Hand".split(" ").map(n => {
			["p", "o"].map((p, i) => self.moveFuncs[p + n] = (oa, card) => {
				root.ws.s("move", "move", card._id, `p${i ^ self.n()}.${n.toLowerCase()}`);
				oa.remove(card);
				self[p + n].unshift(card);
				if(n !== "Play") {
					card.damage(0);
					card.counters(0);
					card.state("prepared");
				}
				card.deploying(true);
				card.marked(false);
				delete card.click;
			});
			self.moveFuncs[n.toLowerCase()] = (oa, card) => {
				let f = oa.z;
				if(n === "Play" || n === "Supp")
					return self.moveFuncs[f[0] + n](oa, card);
				self.moveFuncs[(card.owner ^ self.n() ? "o" : "p") + n](oa, card);
			}
		});

		self.moveFuncs.changeControl = (oa, card) =>
			self.moveFuncs[(oa.z[0] === "o" ? "p" : "o") + (card.card().type[0] === "C" ? "Play" : "Supp")](oa, card);

		self.moveFuncs.playCardGold = (oa, card) => {
			if(card.card().cost && !(self.p.gold() && (
				!self.p.goldFaction() ||
					self.p.goldFaction() === card.card().factionCode.toUpperCase()
			))) return
			self.moveFuncs.playCard(oa, card);
			if(!card.card().cost)
				return;
			self.p.gold(false);
			self.p.goldFaction(false);
		}

		self.moveFuncs.playCard = (oa, card) => {
			self.moveFuncs[card.card().type === "CHAMPION" ? "play" : "supp"](oa, card);
		}

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

		self.moveFuncs.break = self.moveFuncs.disc;

		self.moveFuncs.toggleDeploying = (oa, card) =>
			card.deploying(true);

		self.moveFuncs.transform = (oa, card) => {
			self.moveFuncs.banish(oa, card);
			root.ws.s("move", "token", "tokens-wolf_token", (oa.z[0] === "o") ^ self.n());
		}

		self.moveFuncNames = {
			play: "In-Play",
			disc: "Discard",
			supp: "Supplemental",
			deck: "Top of Deck",
			unrevealO: "Unreveal",
			playCard: "Play",
			playCardGold: "Auto-Play",
		};

		self.moveFuncClasses = {
			disc: "evil",
			break: "evil",
			banish: "good",
			hand: "sage",
			transform: "wild",
		}

		self.phaseNames = {
			start: "Start Phase",
			main: "Main Phase",
			end: "End Phase",
			"battle-0": "Declare Attackers",
			"battle-1": "Attack Events",
			"battle-2": "Declare Blockers",
			"battle-3": "Block Events",
			"battle-4": "Assign Damage",
		}

		self.phaseName = ko.computed(() => self.started() ? self.phaseNames[self.game.phase()] : "");

		self.hideInitiative = ko.computed(() => self.started() ? ~[
			"start",
			"battle-0",
			"battle-2",
			"battle-4",
			"end",
		].indexOf(self.game.phase()) : false);

		"expend flip prepare".split(" ").map(n => self.moveFuncs[n] = (oa, card) => {
			let ned = {
				expend: "expended",
				flip: "flipped",
				prepare: "prepared",
			}[n];
			card.state(ned);
		});

		self.goldRightClick = p => [{
			name: "Any",
			func: () => p.goldFaction(""),
		}, ...["Good", "Sage", "Evil", "Wild"].map(a => ({
			name: a,
			func: () => (p.gold(true), p.goldFaction(a.toUpperCase())),
			class: a.toLowerCase(),
		}))];

		let wsObservables = {
			n: self.n
		};


		self.isTurn = ko.computed(
			() => self.started() && (+self.game.turn() === self.n())
		);

		self.hasInitiative = ko.computed(
			() => self.started() && (+self.game.initiative() === self.n())
		);

		self.waitingForOpp = ko.computed(
			() => self.started() && self.o.waitingOn()
		);

		self.canProceed = ko.computed(
			() => (self.hasInitiative() || self.hideInitiative())  && !self.waitingForOpp()
		);

		self.canPass = ko.computed(
			() => self.hasInitiative() && !self.hideInitiative()
		);


		self.passInitiative = () => self.game.initiative(!self.n());

		self.phaseClick = self.double(
			() => self.canProceed() && self.cyclePhase(),
			() => self.canPass() && self.passInitiative(),
		);

		self.phaseRightClick = [{
			name: "Next phase",
			func: () => self.cyclePhase()
		}, {
			name: "Previous phase",
			func: () => self.cyclePhaseAlt()
		}, {
			name: "Next turn",
			func: () => (self.game.phase("end"), self.cyclePhase())
		}, ...phases.map(p => ({
			name: self.phaseNames[p],
			func: () => {
				self.game.phase(p);
				self.game.initiative(!!self.n());
				self.o.waitingOn(false);
				self.p.waitingOn(true);
			},
		}))];

		self.cyclePhase = () => {
			let phase = self.game.phase();
			let change = {
				start:      ["main", true, false, false],
				main:       ["end", true, true, true],
				"battle-0": ["battle-1", true, false, false],
				"battle-1": ["battle-2", false, false, true],
				"battle-2": ["battle-3", false, false, false],
				"battle-3": ["battle-4", true, true, true],
				"battle-4": ["main", true, false, false],
				end:        ["start", true, true, true],
			}[phase];

			change[1] ^= !self.game.turn();
			if(self.game.turn())
				[change[2], change[3]] = [change[3], change[2]];
			[self.game.phase, self.game.initiative, self.game.p0.waitingOn, self.game.p1.waitingOn]
				.map((o, i) => o(change[i]));

			if(phase === "start")
				self[(self.game.turn() ^ self.n() ? "o" : "p") + "Play"]()
					.map(c => {
						c.state("prepared");
						c.deploying(false);
					});
			else if(phase === "end") {
				self.o.gold(true);
				self.o.goldFaction("");
				self.p.gold(true);
				self.p.goldFaction("");
				self.game.turn(!self.game.turn());
				[...self.oPlay(), ...self.pPlay()].filter(c => c.damage()).map(c => c.damage(0));
			} else if(phase === "battle-0") {
				let zone = self[(self.game.turn() ^ self.n() ? "o" : "p") + "Play"];
				zone().filter(c => c.inBattle()).map(c => self.moveFuncs.expend(zone, c));
			} else if(phase === "battle-2") {
				let zone = self[(self.game.turn() ^ self.n() ? "p" : "o") + "Play"];
				zone().filter(c => c.inBattle()).map(c => self.moveFuncs.flip(zone, c));
			} else if(phase === "battle-4")
				[self.oPlay, self.pPlay].map(z => z().map(c => c.inBattle() ? self.moveFuncs.battle(z, c) : {}));
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

			if(self.game.phase() === "end")
				self.game.turn(!self.game.turn());
		}

		self.toggleInitWait = () => {
			self.hideInitiative() ?
				self.p.waitingOn() ?
					(self.p.waitingOn(false), self.o.waitingOn(true)) :
					self.o.waitingOn() ?
						(self.p.waitingOn(true), self.o.waitingOn(false)) :
						null :
				self.game.initiative(!self.game.initiative())
		};

		self.newCard = c => {
			c.card = ko.observable(c.card);
			"inBattle state marked notes counters damage deploying"
				.split(" ")
				.map(n => {
					let o = c["_" + n] = ko.observable(c[n]);
					c[n] = ko.computed({
						read: o,
						write: v => {
							if(v !== o() && (self.vs[n] || (() => true))(v))
								setTimeout(() =>
									o() === v && root.ws.s("move", n, c._id, v)
								, 500);
							o(v);
						},
					});
				});
			c.src = ko.computed(() => `/images/${c.card() ? c.card()._id : "back"}`);
			self.cards[c._id] = c;
			return c;
		}

		self.concede = {
			name: "Concede",
			func: () => {
				root.ws.s("move", "concede");
				history.go(0);
			},
		};

		root.on("ws", ({ type, data }) => {
			if(type === "game") {
				let [game] = data;
				self.game = game;
				self.p = game.p = game["p" + self.n()];
				self.o = game.o = game["p" + +!self.n()];
				let f = n => {
					let o = ko.observable(n.split(".").reduce((o, p) => o[p], game));
					let c = ko.computed({
						read: o,
						write: v => {
							if(v !== o() && self.vs[n.split(".").pop()](v))
								setTimeout(() =>
									o() === v && root.ws.s("move", n, v)
								, 500);
							o(v);
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
					self[p + z](game[p].zones[z.toLowerCase()].map(self.newCard))
				));
				self.started(true);
			}
			if(type === "identity") {
				let [id, identity] = data;
				self.cards[id].card(identity);
			}
			if(type === "delete" || type === "move" || type === "banish") {
				let [id, zoneName] = data;
				let c, zone;
				"Deck Disc Play Hand Supp"
					.split(" ")
					.flatMap(a => ["o" + a, "p" + a])
					.map(n => [n, self[n]])
					.map(([n, z]) => {
						if(type === "delete")
							return z;
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
				if(!zoneName.endsWith("play")) {
					c.counters(0);
					c.damage(0);
					c.state("prepared");
				}
				if(type === "banish")
					zone.push(c);
				else if(type === "move")
					zone.unshift(c);

			}
			if(type === "token") {
				let [p, c] = data;
				self[(p[1] ^ self.n() ? "o" : "p") + "Play"].push(self.newCard(c));
			}
			if(~"inBattle state marked notes counters damage".split(" ").indexOf(type))
				self.cards[data[0]]["_" + type](data[1]);
			if(type === "won") {
				root.status("won");
			}
			if(type === "log")
				self.log.push(...data);
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
					$(el).addClass("rightClicked");
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

		$("*").on("click contextmenu", () => {
			$(".rightClicked").removeClass("rightClicked");
			self.rightClick([])
		});

		ko.components.register("cards", {
			viewModel: function({ cards, main = "", alt = main }){
				if(!alt.includes("mark"))
					alt = "mark " + alt;
				this.cards = cards;
				this.main = self.moveFuncs[main];
				this.rightClick = c => alt.trim().split(/\s+/g).map(n => ({
					name: self.moveFuncNames[n] || (n[0].toUpperCase() + n.slice(1)).split(/(?=[A-Z][a-z]+)/g).join(" "),
					func: () => self.moveFuncs[n](cards, c),
					class: self.moveFuncClasses[n] || "",
				}));
				this.click = c => c.click || (c.click = self.double(
					() => (!self.hideInitiative() || main !== "playCard") && this.main(cards, c),
					() => c.card() && !$("input:focus").length && self.cardPopup(c),
				));
				this.inc = self.inc;
				this.dec = self.dec;
				this.stop = (_, e) => e.stopPropagation();
			},
			template: `<!-- ko foreach: cards -->
				<div class="card" data-bind="
					css: { battle: inBattle(), marked, expended: state() === 'expended', flipped: state() === 'flipped' },
					click: $parent.click($data),
					rightClick: $parent.rightClick($data),
				">
					<img class="_" src="/314x314.jpg"/>
					<img data-bind="attr: { src }" style=""/>
					<div class="deploying badge" data-bind="css: { show: deploying() && $parent.cards.z.endsWith('Play') }"></div>
					<div class="damage number badge" data-bind="css: { show: +damage() }, click: $parent.stop">
						<span class="a" data-bind="click: $parent.inc(damage)">+</span>
						<input data-bind="value: damage, css: { show: damage }"/>
						<span class="a" data-bind="click: $parent.dec(damage, true)">–</span>
					</div>
					<div class="counters number badge" data-bind="css: { show: +counters() }, click: $parent.stop">
						<span class="a" data-bind="click: $parent.inc(counters)">+</span>
						<input data-bind="value: counters"/>
						<span class="a" data-bind="click: $parent.dec(counters, true)">–</span>
					</div>
				</div>
			<!-- /ko -->`,
		});

		self.draw = self.double(() => self.moveFuncs.hand(self.pDeck, self.pDeck()[0]), () => {});

	}

}
