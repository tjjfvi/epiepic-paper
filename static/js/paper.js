module.exports = class {

	constructor(root){
		let self = this;
		const { ko } = root.globals;

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
		};


		self.moveFuncs = { "": () => {} };

		"Deck Disc Supp Play Hand".split(" ").map(n => self.moveFuncs[n.toLowerCase()] = (oa, card) => {
			root.ws.s("move", "move", card._id, `p${self.n()}.${n.toLowerCase()}`);
			oa.remove(card);
			self["p" + n].unshift(card);
		});

		self.moveFuncs.playCard = (oa, card) =>
			self.moveFuncs[card.card().type === "CHAMPION" ? "play" : "supp"](oa, card);

		self.moveFuncs.battle = (oa, card) => {
			card.inBattle(!card.inBattle());
			if(+self.game.turn() === +self.n())
				self.moveFuncs.expend(oa, card);
			else
				self.moveFuncs.flip(oa, card);
		};

		"expend flip prepare".split(" ").map(n => self.moveFuncs[n] = (oa, card) => {
			let ned = n === "flip" ? "flipped" : n + "ed";
			card.state(ned);
		});


		let wsObservables = {
			n: self.n
		};

		root.on("ws", ({ type, data }) => {
			if(type === "game") {
				let [game] = data;
				self.game = game;
				self.p = game.p = game["p" + self.n()];
				self.o = game.o = game["p" + +!self.n()];
				console.log(self.p, self.n());
				let f = n => {
					let o = ko.observable(n.split(".").reduce((o, p) => o[p], game));
					console.log(n, o());
					n.split(".").reduce((ob, p, i, a) => i === a.length - 1 ? ob[p] = o : ob[p], game);
					wsObservables[n] = o;
					o.subscribe(() => {
						console.log(n, o());
						console.log(self.vs[n.split(".").pop()](o()));
						if(self.vs[n.split(".").pop()](o()))
							root.ws.s("move", n, o());
					});
					return o;
				}
				"p0.gold p0.goldFaction p1.gold p1.goldFaction p0.health p1.health turn phase initiative"
					.split(" ").map(f);
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
											root.ws.s(n, c._id, v);
									},
								});
							});
						return c;
					}))
				));
				self.started(true);
			}
			if(type === "identity") {
				let [id, identity] = data;
				self.cards[id].card(identity);
			}
			if(type === "move") {
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
				zone.unshift(c);
			}
			if(type === "battle")
				self.cards[data[0]]._inBattle(data[1]);
			if(~"state marked notes counters damage".split(" ").indexOf(type))
				self.cards["_" + data[0]][type](data[1]);
			(wsObservables[type] || (() => {}))(data[0]);
		});
		console.log("ko", ko);

		ko.bindingHandlers.cards = {
			init: (el, valAcc, allBinds, vm, bindCtx) => ko.bindingHandlers.component.init(
				el,
				ko.computed(() => ({
					name: "cards",
					params: { cards: valAcc(), clickMove: allBinds.get("clickMove") },
				})),
				allBinds,
				vm,
				bindCtx,
			),
		};

		ko.components.register("cards", {
			viewModel: function({ cards, clickMove }){
				this.cards = cards;
				this.clickMove = self.moveFuncs[clickMove];
				console.log(this.cards === self.oDeck, self.oDeck);
			},
			template: `<!-- ko foreach: cards -->
				<div class="card" data-bind="
					click: () => $parent.clickMove($parent.cards, $data),
					css: { battle: inBattle(), [state() || '']: true }
				">
					<img class="_" src="/314x314.jpg"/>
					<img data-bind="attr: { src: card() ? \`/images/\${card()._id}.jpg\` : '/images/back.jpg' }"/>
				</div>
			<!-- /ko -->`,
		});
	}

}
