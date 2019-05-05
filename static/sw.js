const cacheName = "epiepic-paper-v0";

self.addEventListener("fetch", async event => {
	let { origin, pathname } = new URL(event.request.url);

	if(pathname === "/resetImages")
		return event.respondWith(caches.open(cacheName)
			.then(async cache => [cache, await cache.keys()])
			.then(([cache, keys]) => Promise.all(keys.map(key => cache.delete(key))))
			.then(() => new Response({ status: 200 }))
		);

	if(pathname.startsWith("/images/")) {
		if(pathname.endsWith(".jpg") || pathname.endsWith(".svg"))
			return event.respondWith(caches.match(event.request).then(response => {
				console.log(pathname, !!response);
				return response || fetch(event.request);
			}));
		event.respondWith((async () => {
			let cache = await caches.open(cacheName);
			let match = await cache.match(new Request(event.request.url + ".jpg"));
			if(match)
				return match;
			return Response.redirect(origin + pathname + ".svg", 302);
		})());
	}

	if(!pathname.startsWith("/upload/"))
		return;
	event.respondWith(new Response({ status: 200 }));
	let cache = await caches.open(cacheName);
	cache.put(
		new Request(`${origin}/images/${pathname.slice(8)}`),
		new Response(await event.request.blob(), { headers: { "Content-Type": "image/jpeg" } }),
	);
});
