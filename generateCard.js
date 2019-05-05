module.exports = card => `<?xml version="1.0" encoding="utf-8"?>
<!-- Generator: Adobe Illustrator 23.0.3, SVG Export Plug-In . SVG Version: 6.00 Build 0)  -->
<svg version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" x="0px" y="0px"
	 viewBox="0 0 225 314" style="enable-background:new 0 0 225 314;" xml:space="preserve">
<style type="text/css">
@import url("https://fonts.googleapis.com/css?family=Roboto:700");
	*{text-anchor:middle;}
	.st0{fill:${cardColor(card)};opacity:.8;}
	.st1{fill:#666;}
	.art{fill:#333;}
	.st2{fill:#FFFFFF;}
	.st3{fill:none;}
	.st4{font-family:'Verdana';}
	.st5{font-size:12px;}
	.st6{fill:${cardColor(card)};stroke:#000000;stroke-miterlimit:10;}
	.st12{fill:#d33;stroke:#000000;stroke-miterlimit:10;}
	.st7{fill:${card.cost ? '#F1C40F' : '#ddd'};stroke:#000000;stroke-miterlimit:10;}
	.st8{fill:#CCCCCC;}
	.st9{fill:#6666FF;stroke:#000000;stroke-miterlimit:10;}
	.st10{font-size:15px;}
	.st11{font-size:10px;letter-spacing: -.4pt;font-variant:small-caps}
	.st13{font-size:12px;font-family:"Verdana";font-variant:normal}
	.hide{display:none;}
</style>
<g id="Background">
	<rect id="Black" width="225" height="314"/>
	<path id="Grey" class="st0" d="M202.5,307.1h-180c-8.28,0-15-6.72-15-15v-269c0-8.28,6.72-15,15-15h180c8.28,0,15,6.72,15,15v269
		C217.5,300.38,210.78,307.1,202.5,307.1z"/>
</g>
<rect x="12" y="25" class="art" width="201" height="166.01"/>
<g id="Name">
	<rect id="Name_Background" x="32.5" y="16.2" class="st2" width="160" height="17.6"/>
	<rect x="32.5" y="15" class="st3" width="160" height="20"/>
	<text transform="matrix(1 0 0 1 112.5 28.9998)" class="st4 st5">${card.name}</text>
</g>
<g id="Balls" class="${card.type === "EVENT" || card.ambush ? "" : "hide"}">
	<circle class="st1" cx="25" cy="15" r="4"/>
	<circle class="st1" cx="36" cy="15" r="4"/>
	<circle class="st1" cx="47" cy="15" r="4"/>
	<circle class="st1" cx="58" cy="15" r="4"/>
	<circle class="st1" cx="69" cy="15" r="4"/>
	<circle class="st1" cx="80" cy="15" r="4"/>
	<circle class="st1" cx="91" cy="15" r="4"/>
	<circle class="st1" cx="102" cy="15" r="4"/>
	<circle class="st1" cx="113" cy="15" r="4"/>
	<circle class="st1" cx="124" cy="15" r="4"/>
	<circle class="st1" cx="135" cy="15" r="4"/>
	<circle class="st1" cx="146" cy="15" r="4"/>
	<circle class="st1" cx="157" cy="15" r="4"/>
	<circle class="st1" cx="168" cy="15" r="4"/>
	<circle class="st1" cx="179" cy="15" r="4"/>
	<circle class="st1" cx="190" cy="15" r="4"/>
	<circle class="st1" cx="201" cy="15" r="4"/>
</g>
<circle id="Alignment" class="st6" cx="25" cy="25" r="14.5"/>
<circle id="Cost" class="st7" cx="200" cy="25" r="14.5"/>
<path class="st8" d="M200,304.5H25c-8.28,0-15-6.72-15-15v-120c0-8.28,6.72-15,15-15h175c8.28,0,15,6.72,15,15v120
	C215,297.78,208.28,304.5,200,304.5z"/>
<path class="st2" d="M200,184.5H25c-8.28,0-15-6.72-15-15v0c0-8.28,6.72-15,15-15h175c8.28,0,15,6.72,15,15v0
	C215,177.78,208.28,184.5,200,184.5z"/>
	<g id="OffDeff" class="${card.type === "EVENT" ? "hide" : ""}">
<g id="Defense">
	<circle id="Defense" class="st9" cx="200" cy="169.5" r="14.5"/>
	<text transform="matrix(1 0 0 1 200 174.5)" class="st2 st4 st10">${card.defense}</text>
</g>
<g id="Offense">
	<circle id="Offense_3_" class="st12" cx="25" cy="169.5" r="14.5"/>
	<text transform="matrix(1 0 0 1 25 174.5)" class="st2 st4 st10">${card.offense}</text>
</g></g>
<text transform="matrix(1 0 0 1 112.5 173.5)" class="st4 st11">${
	fixCaps(`${card.faction} ${card.traits || ""} ${card.type}`).toUpperCase()
}</text>
${((card.textVar || "") + (card.discardVar ? "\n____________________\n" + card.discardVar : ""))
		.split(/\n/g)
		.map(s => s.replace(/</g, "&lt;").replace(/>/g, "&gt;"))
		.map((l, i) => `<text class="st13" transform="matrix(1 0 0 1 112.5 ${200 + i * 12})">${l}</text>`)
		.join("\n")}
</svg>`

function fixCaps(s){
	return s.split(/\s+/g).map(w => w[0] + w.slice(1).toLowerCase()).join(" ");
}

function cardColor(c){
	return {
		GOOD: "#db2",
		SAGE: "#66f",
		EVIL: "#d33",
		WILD: "#2a2",
	}[c.faction];
}

