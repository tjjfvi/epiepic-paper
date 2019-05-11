module.exports = class {

	constructor(root){
		const { ko } = root.globals;
		const self = this;

		self.games = ko.observable([]);
		self.reconnectGames = ko.observable([]);
		self.spectateGames = ko.observable([]);

		self.host = {
			name: ko.computed(() => {
				let user = root.user();
				if(!user) return "";
				return `@${user.username}#${user.discriminator}`;
			}),
			pswd: ko.observable(""),
			host: () => {
				root.ws.s("host", self.host.name(), self.host.pswd());
			}
		}

		root.on("ws", ({ type, data }) => {
			if(type === "games")
				self.games(data[0].map(g => new Game(g)));
			if(type === "reconnectGames")
				self.reconnectGames(data[0].map(g => ({
					...g,
					reconnect: () => {
						root.ws.s("reconnect", g._id);
					}
				})));
			if(type === "spectateGames")
				self.spectateGames(data[0].map(g => new Game({
					...g,
					name: `@${g.p0.username}#${g.p0.discriminator}\n@${g.p1.username}#${g.p1.discriminator}`,
				}, true)));
		})

		class Game {

			constructor({ name, pswd, id }, spectate){
				const self = this;

				self.name = name;
				self.pswdReq = pswd;
				self.pswd = ko.observable("");
				self.wrong = ko.observable(false);

				self.join = () => {
					root.ws.s(spectate ? "spectate" : "join", id, self.pswd());
					root.on("ws", ({ type }) => {
						if(type === "joinFailed")
							self.wrong(true);
					})
				}
			}

		}

		return self;
	}

}
