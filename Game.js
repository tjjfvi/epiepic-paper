const mongoose = require("mongoose");

const gameSchema = require("./schema");
const Game = mongoose.model("Game", gameSchema, "Game");

module.exports = Game;
