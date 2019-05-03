require("jquery")($ => {

	$("input").attr("data-lpignore", "true");

	const ko = require("knockout");

	ko.options.deferUpdates = true;

	class ViewModel extends require("events") {

		constructor(){
			super();

			const root = this;
			const self = root;

			self.user = ko.observable();

			fetch("/api/user/current", {
				credentials: "include",
			}).then(r => r.json()).then(u => self.user(u));

			self.ws = initWs(new WebSocket(`ws${window.location.toString().slice(4)}ws/`));

			self.globals = { ko, $ };

			self.status = ko.observable("waiting");

			self.intro = new (require("./intro"))(root);
			self.paper = new (require("./paper"))(root);

			return self;

			function initWs(ws){
				ws.s = function(type, ...data){
					console.log("Sending", type, ...data);
					this.send(JSON.stringify([type, ...data]));
				}

				ws.addEventListener("message", ({ data: message }) => {
					let [type, ...data] = JSON.parse(message);
					console.log(type, ...data);
					self.emit("ws", { type, data });

					switch(type) {
						case "status":
							self.status(data[0]);
							break;
					}
				})

				ws.addEventListener("close", () => self.user() && self.status("disconnected"));

				return ws;
			}
		}

	}

	ko.applyBindings(new ViewModel());

	$("*").on("mouseover", e => setTimeout(() =>
		$(e.target)
			.parents()
			.addBack()
			.filter($(":hover"))
			.addClass("hoverIntent")
	, 500)).on("mouseout", () => $(".hoverIntent:not(:hover)").removeClass("hoverIntent"));

});
