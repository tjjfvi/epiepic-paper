
Array.prototype.shuffle = function () {
	for(let i = 0; i < this.length; i++){
		let r = Math.floor(Math.random() * i);
		[this[i], this[r]] = [this[r], this[i]]
	}
	return this;
};
