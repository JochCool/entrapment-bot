const botVersion = "0.5.3";
console.log("Starting Entrapment Bot version " + botVersion);

/* TODO:
- Debug the game category position
- Improve the way teams work
*/

/** ───── BECOME A DISCORD BOT ───── **/

// Require and read some things
const Discord = require('discord.js');
const auth = require('./auth.json');
const properties = require('./package.json');
const fs = require('fs');
var data = require('./data.json');

console.log("All modules loaded");
if (properties.version != botVersion) {
	console.warn("Inconsistency between package version (" + properties.version + ") and code version (" + botVersion + ")");
}

// Initialize Discord Bot
const client = new Discord.Client();
client.login(auth.token).catch(console.error);

// Once logged in
client.on('ready', () => {
	console.log('Connected!');
	
	// Say it in bot feed
	client.guilds.array().forEach(guild => {
		if (guild.available) {
			let botFeedChannel = guild.channels.find('name', "bot-feed");
			if (botFeedChannel) {
				botFeedChannel.send("I'm online! Version: " + botVersion);
			}
			else {
				console.warn("Couldn't find channel bot-feed of guild " + guild.name + " (ID: " + guild.id + ")")
			}
		}
	});
	
	client.user.setActivity("you", {type: "LISTENING"});
});

client.on('disconnected', function() {
	console.error("Disconnected from the server. Stopping!");
	process.exit();
});

client.on('error', function(error) {
	console.error("WebSocket error:");
	console.error(error);
});

Number.prototype.getStringWithPrecedingZeroes = function(num) {
	let returnTxt = Math.floor(Math.abs(this)).toString();
	while (returnTxt.length < num) {
		returnTxt = '0' + returnTxt;
	}
	if (this < 0) returnTxt = "-" + returnTxt;
	return returnTxt;
}

/** ───── MESSAGE PARSER ───── **/

const prefix = '!';

client.on('message', message => {
	
	if (message.author.bot) {
		return;
	}
	
	// Commands
	if (message.content.substring(0, 1) == prefix) {
		executeCommand(message, message.content.substring(1));
	}
	
	else if (message.content.toLowerCase().startsWith("good bot")) {
		message.channel.send("Thank you!");
	}
	else if (message.content.toLowerCase().startsWith("bad bot")) {
		message.channel.send(":(");
	}
});

function CommandResult(success, replyText) {
	this.success = success;
	this.replyText = replyText;
};

CommandResult.prototype.evaluate = function(message) {
	if (!message) {
		console.warn("WARNING: MESSAGE OBJECT WAS NOT PASSED INTO THE EVALUATE METHOD OF " + this);
		return;
	}
	if (this.success == true) {
		message.react('✅'); // :white_check_mark:
	}
	else if (this.success == false) {
		message.react('❌'); // :x:
	}
	if (typeof this.replyText == "string" && this.replyText.length > 0) {
		message.channel.send(this.replyText).catch(console.error);
	}
};

var input = null, thisInputEnd = -1;

function executeCommand(message, command) {
	try {
		console.log("Executing command: "+command);
		
		// No new lines allowed
		if (command.indexOf('\n') >= 0) {
			throw new CommandResult(false, "Please keep your command on one line!");
		}
		
		// determine op level
		let userOpLevel = 0;
		if (message.channel.type == "text" && message.guild) {
			userOpLevel = 1;
			if (message.guild.available) {
				if (message.guild.ownerID == message.member.id) {
					userOpLevel = 4;
				}
				else if (message.member.roles.exists("name", "Mod")) {
					userOpLevel = 3;
				}
				else if (message.member.roles.exists("name", "Active Player")) {
					userOpLevel = 2;
				}
			}
		}
		
		// init
		let currentArgument = commands;
		let inputs = {};
		command = command.trim();
		
		// loop through arguments to run the command
		while (currentArgument.child) {
			let syntax = currentArgument.getChildSyntax();
			currentArgument = currentArgument.child;
			
			// input type check
			input = null;
			thisInputEnd = -1;
			let inputAllowed = false;
			if (Array.isArray(currentArgument)) {
				for (var a = 0; a < currentArgument.length; a++) {
					if (currentArgument[a].isInputAllowed(command)) {
						currentArgument = currentArgument[a];
						inputAllowed = true;
						break;
					}
				}
			}
			else {
				inputAllowed = currentArgument.isInputAllowed(command);
			}
			
			if (!inputAllowed) {
				if (currentArgument == commands.child) {
					throw new CommandResult(false, "Unknown command. Type `" + prefix + "help` for a list of commands");
				}
				else {
					throw new CommandResult(false, "Invalid argument: `" + input + "`. Expected `" + syntax + "`.");
				}
			}
			
			// check permission
			if (currentArgument.oplevel >= 1 && message.guild && !message.guild.available) {
				throw new CommandResult(false, "It looks like the guild you're in is not available. Please contact a moderator for help.");
			}
			if (currentArgument.oplevel > userOpLevel) {
				if (userOpLevel < 1) {
					throw new CommandResult(false, "You can only run this command on a server.");
				}
				throw new CommandResult(false, "You do not have permission to use this command");
			}
			
			// add input to inputs list
			inputs[currentArgument.name] = input;
			
			// Next command
			if (thisInputEnd >= 0) {
				command = command.substring(thisInputEnd).trim();
			}
			
			// last input; run the command
			if (thisInputEnd < 0 || command == "" || !currentArgument.child) {
				if (!currentArgument.run) {
					throw new CommandResult(false, "Missing argument: `" + currentArgument.getChildSyntax() + "`");
				}
				let commandResult = currentArgument.run(message, inputs, userOpLevel);
				if (typeof commandResult == "object" && commandResult instanceof CommandResult) {
					commandResult.evaluate(message);
				}
				else if (typeof commandResult == "string" && commandResult.length > 0) {
					message.channel.send(commandResult);
				}
				break;
			}
		}
	}
	catch (err) {
		if (typeof err == "object" && err instanceof CommandResult) {
			err.evaluate(message);
		}
		else {
			console.error(err);
			let unknownResult = new CommandResult(false, "An unknown error occurred while evaluating your command.");
			unknownResult.evaluate(message);
		}
	}
};

/** ───── GAME SESSIONS ───── **/

function startGameSession(message, options) {
	let newSession = {
		"id": data.gamesessions.length,
		"concluded": false,
		"channelIDs": {},
		"creatorId": message.author.id,
		"roleId": null,
		"guildId": message.guild.id,
		"announcementMessageId": null,
		"creatorUserName": message.author.username,
		"serverType": options.server || options.realm || "unknown",
		"serverName": options.address || options["owner of realm"] || "unknown",
		"serverVersion": options["minecraft version"] || "unknown",
		"gameName": options["name of game"] || "unknown",
		"serverLocationMessage": "",
		"botVersion": botVersion
	};
	
	let teamBlueRole = message.guild.roles.find("name", "Team Blue");
	let teamRedRole = message.guild.roles.find("name", "Team Red");
	
	// Create game role
	message.guild.createRole({
		"name": "Game #" + newSession.id,
		"color": 16776960,
		"hoist": true,
		"position": teamRedRole ? teamRedRole.calculatedPosition-2 : 8,
		"mentionable": false
	}, "User " + message.author.username + " started a game of " + newSession.gameName + " (id " + newSession.id + ").").then(
		gameRole => {
			newSession.roleId = gameRole.id;
			
			// Create category for the game
			message.guild.createChannel("🔵 Playing " + newSession.gameName + "!", "category", [
				{
					"id": message.guild.id,
					"deny": ["VIEW_CHANNEL"]
				},
				{
					"id": gameRole,
					"allow": ["VIEW_CHANNEL", "SEND_MESSAGES"]
				}
			], "Setting up game " + newSession.id).then(
				
				gameCategory => {
					console.log("Created new game category");
					newSession.channelIDs.category = gameCategory.id;
					
					// Move to correct position
					gameCategory.setPosition(2).then(
						() => {
							console.log("Successfully set the position of the game category. calculatedPosition is " + gameCategory.calculatedPosition + ", position is " + gameCategory.position + ".");
						},
						err => { console.error("Error while setting the position of the new game category: " + err); }
					);
					
					// Create game channel
					gameCategory.guild.createChannel("game-" + newSession.id, "text", [
						{
							"id": message.guild.id,
							"deny": ["VIEW_CHANNEL"]
						},
						{
							"id": gameRole,
							"allow": ["VIEW_CHANNEL", "SEND_MESSAGES"]
						}
					], "Setting up game " + newSession.id).then(
						
						gameTextChannel => {
							newSession.channelIDs.text = gameTextChannel.id;
							gameTextChannel.setParent(gameCategory, "Setting up game " + newSession.id).catch(console.log);
							gameTextChannel.setTopic("Talk about your game of " + newSession.gameName + " here!").catch(console.log);
							finishSessionCreation();
						},
						err => {
							console.error("Error while creating the text channel for the new game: " + err);
							let result = new CommandResult(false, "Something went wrong while creating the game channels. Please contact a moderator for help.");
							result.evaluate(message);
						}
					);
					
					// Create voice channels
					gameCategory.guild.createChannel("Game General", "voice", [
						{
							"id": message.guild.id,
							"deny": ["VIEW_CHANNEL"]
						},
						{
							"id": gameRole,
							"allow": ["VIEW_CHANNEL", "CONNECT"]
						}
					], "Setting up game " + newSession.id).then(
						gameVoiceChannel => {
							newSession.channelIDs.voiceGeneral = gameVoiceChannel.id;
							gameVoiceChannel.setParent(gameCategory, "Setting up game " + newSession.id).catch(console.error);
							finishSessionCreation();
						},
						err => {
							console.error("Error while creating the general voice channel for the new game: " + err);
							let result = new CommandResult(false, "Something went wrong while creating the game channels. Please contact a moderator for help.");
							result.evaluate(message);
						}
					);
					gameCategory.guild.createChannel("Game Team Blue", "voice", [
						{
							"id": message.guild.id,
							"deny": ["VIEW_CHANNEL"]
						},
						{
							"id": gameRole,
							"allow": ["VIEW_CHANNEL", "CONNECT"]
						},
						{
							"id": teamRedRole,
							"deny": ["CONNECT", "SPEAK"]
						}
					], "Setting up game " + newSession.id).then(
						gameVoiceChannel => {
							newSession.channelIDs.voiceBlue = gameVoiceChannel.id;
							gameVoiceChannel.setParent(gameCategory, "Setting up game " + newSession.id).catch(console.error);
							finishSessionCreation();
						},
						err => {
							console.error("Error while creating the team blue voice channel for the new game: " + err);
							let result = new CommandResult(false, "Something went wrong while creating the game channels. Please contact a moderator for help.");
							result.evaluate(message);
						}
					);
					gameCategory.guild.createChannel("Game Team Red", "voice", [
						{
							"id": message.guild.id,
							"deny": ["VIEW_CHANNEL"]
						},
						{
							"id": gameRole.id,
							"allow": ["VIEW_CHANNEL", "CONNECT"]
						},
						{
							"id": teamBlueRole,
							"deny": ["CONNECT", "SPEAK"]
						}
					], "Setting up game " + newSession.id).then(
						gameVoiceChannel => {
							newSession.channelIDs.voiceRed = gameVoiceChannel.id;
							gameVoiceChannel.setParent(gameCategory, "Setting up game " + newSession.id).catch(console.error);
							finishSessionCreation();
						},
						err => {
							console.error("Error while creating the team red channel for the new game: " + err);
							let result = new CommandResult(false, "Something went wrong while creating the game channels. Please contact a moderator for help.");
							result.evaluate(message);
						}
					);
				},
				err => {
					console.error("Error while creating category for new game: " + err);
					let result = new CommandResult(false, "Something went wrong while creating the game channels. Please contact a moderator for help.");
					result.evaluate(message);
				}
			);
		},
		err => {
			console.error("Error while creating the role for the new game: " + err);
			let result = new CommandResult(false, "Something went wrong while creating the game. Please contact a moderator for help.");
			result.evaluate(message);
		}
	);
	
	// Sends confirmation message and stuff once all channels have been created.
	function finishSessionCreation() {
		if (newSession.channelIDs.voiceRed && newSession.channelIDs.voiceBlue && newSession.channelIDs.voiceGeneral && newSession.channelIDs.text && newSession.channelIDs.category && newSession.roleId) {
			
			// Add role to game creator
			message.member.addRole(newSession.roleId, message.author.username + " created game #" + newSession.id).catch(console.error);
			
			// Create & send welcome message
			if (newSession.serverType == "server") {
				if (newSession.serverName == "unknown") {
					newSession.serverLocationMessage = "Server IP is unknown.";
				}
				else {
					newSession.serverLocationMessage = "Server address: `" + newSession.serverName + "` (Minecraft version: " + newSession.serverVersion + ")";
				}
			}
			else if (newSession.serverType == "realm") {
				newSession.serverLocationMessage = "Realm owner: " + newSession.serverName;
			}
			else {
				newSession.serverLocationMessage = "The server where the game is going to be played is unknown.";
			}
			let gameTextChannel = message.guild.channels.get(newSession.channelIDs.text);
			gameTextChannel.send("A new game of " + newSession.gameName + " has been created by " + message.author + ".\n" + newSession.serverLocationMessage + "\nUse `" + prefix + "game setserver` to change where the game is going to be played.\nUse `" + prefix + "game stop` to stop this game.");
			gameTextChannel.send("Anyone can leave this game with the command `" + prefix + "game leave`.");
			
			// Send result
			let result = new CommandResult(true, "Your game has been set up! See " + gameTextChannel + ".");
			result.evaluate(message);
			
			// Make announcement & save game
			let gameAnnouncementChannel = message.guild.channels.find("name", "games");
			if (gameAnnouncementChannel) {
				let joinEmoji = message.guild.emojis.find("name", "EntrapmentNewGame");
				if (joinEmoji) {
					gameAnnouncementChannel.send("**Game #" + newSession.id + ": " + newSession.gameName + "**\nStarted by " + newSession.creatorUserName + "\n" + newSession.serverLocationMessage + "\nReact with " + joinEmoji + " to join!").then(
						announcementMessage => {
							
							// React
							announcementMessage.react(joinEmoji).catch(console.error);
							let collector = announcementMessage.createReactionCollector(reaction => reaction.emoji == joinEmoji && reaction.count > 1);
							collector.on("collect", reaction => {
								let reactor = reaction.users.find(user => user != client.user);
								console.log("User " + reactor.username + " reacted with " + joinEmoji);
								let member = reaction.message.guild.members.get(reactor.id);
								if (member.roles.has(newSession.roleId)) {
									reaction.remove(reactor).catch(console.error);
								}
								else {
									member.addRole(newSession.roleId, "User joined the game").then(
										() => {
											reaction.message.guild.channels.get(newSession.channelIDs.text).send(member + " joined!");
											reaction.remove(reactor).catch(console.error);
										},
										err => {
											console.error("Error while adding the game role to " + member + ": " + err);
										}
									);
								}
							});
							
							// Save session
							newSession.announcementMessageId = announcementMessage.id;
							saveGameSession(newSession, message.channel);
						},
						err => {
							console.error("Failed to make announcement message for game #" + newSession.id + ": " + err);
							saveGameSession(newSession, message.channel);
						}
					);
					
				}
				else {
					console.warn("Couldn't find the :EntrapmentNewGame: emoji while creating game " + newSession.id + "!");
					saveGameSession(newSession, message.channel);
				}
				
				// Remove default message
				if (data.noGameMessageId) {
					noGameMessage.fetchMessage(data.noGameMessageId).then(
						noGameMessage => {
							noGameMessage.delete().catch(console.error);
							data.noGameMessageId = null;
						},
						err => {
							console.error("Couldn't find no game message in " + announcementChannel);
						}
					);
				}
			}
			else {
				console.warn("Couldn't find the #games channel while creating game " + newSession.id + "!");
				saveGameSession(newSession, message.channel);
			}
		}
	};
	
	return new CommandResult(null, "Starting the game...");
};

function saveGameSession(newSession, errorChannel) {
	data.gamesessions.push(newSession);
	fs.writeFile("data.json", JSON.stringify(data, null, 4), (err) => {
		if (err) {
			console.error(err);
			errorChannel.send("Something went wrong while saving your game. Please contact a moderator.").catch(console.error);
		}
	});
}

// Finds the game that this channel is part of
function findGameSession(channel) {
	for (var g = 0; g < data.gamesessions.length; g++) {
		if (data.gamesessions[g].channelIDs.category == channel.parentID) {
			return data.gamesessions[g];
		}
	}
	return null;
};

// `!game setserver` and `!game setname` commands
function changeGameSession(message, inputs, userOpLevel) {
	
	// Find game
	let game = findGameSession(message.channel);
	if (!game) {
		return new CommandResult(false, "You can only execute this command in a game channel.");
	}
	if (message.author.id != game.creatorId && userOpLevel < 3) {
		return new CommandResult(false, "Only the creator of this game or a moderator can change the game's address.");
	}
	
	// Change stuff
	let somethingChanged = false;
	
	if (inputs["new name"]) {
		if (inputs["new name"].length > 89) {
			return new CommandResult(false, "That name is way too long! Please keep it under 90 characters.");
		}
		if (inputs["new name"] != game.gameName) {
			game.gameName = inputs["new name"];
			message.guild.channels.get(game.channelIDs.category).setName("🔵 Playing " + game.gameName + "!", "User " + message.author.username + " changed the name of the game.").catch(console.error);
			message.guild.channels.get(game.channelIDs.text).setTopic("Talk about your game of " + newSession.gameName + " here!").catch(console.error);
			somethingChanged = true;
		}
	}
	
	inputs.serverType = inputs.server || inputs.realm;
	if (inputs.serverType && inputs.serverType != game.serverType) {
		game.serverType = inputs.serverType;
		somethingChanged = true;
	}
	
	inputs.serverName = inputs.address || inputs["owner of realm"];
	if (inputs.serverName && inputs.serverName != game.serverName) {
		game.serverName = inputs.serverName;
		somethingChanged = true;
	}
	
	if (inputs["minecraft version"] && inputs["minecraft version"] != game.serverVersion) {
		game.serverVersion = inputs["minecraft version"];
		somethingChanged = true;
	}
	
	// Save & return
	if (somethingChanged) {
		fs.writeFile("data.json", JSON.stringify(data, null, 4), err => {
			if (err) {
				console.error(err);
				message.channel.send("Something went wrong while saving your game. Please contact a moderator.").catch(console.error);
			}
		});
		// Update announcement message
		let announcementChannel = message.guild.channels.find("name", "games")
		if (announcementChannel) {
			announcementChannel.fetchMessage(game.announcementMessageId).then(
				announcementMessage => {
					announcementMessage.edit("**Game #" + game.id + ": " + game.gameName + "**\nStarted by " + game.creatorUserName + "\n" + game.serverLocationMessage + "\nReact with " + message.guild.emojis.find("name", "EntrapmentNewGame") + " to join!").catch(console.error);
				},
				err => {
					console.error("Couldn't find announcement message in " + announcementChannel + ": " + err);
				}
			);
		}
		else {
			console.error("Couldn't find #games channel while updating game " + game.id);
		}
		return new CommandResult(true, "The game settings have been updated.");
	}
	
	return new CommandResult(false, "Nothing changed.");
};

/** ───── COMMANDS ───── **/

/*
The commands object stores the syntax and function of all of the bot's commands, as a tree of arguments.

An argument is represented by either a CommandArgument object, or an array of CommandArgument objects.
If it is an array, you can use any of the arguments in the list as the argument of your command (like an OR-list of possible inputs).

Each CommandArgument object has a name, which is what displays as a one-word description of the argument in the syntax.
Within one branch of the command tree, there should NEVER be multiple arguments with the same name!

There are various types of arguments:
- "literal" (you have to copy the name exactly)
- "text" (you can fill in whatever text you want)
- "number" (you have to fill in a valid number)
- "date" (you have to fill in a valid Date, preferrable using ISO 8601 format)
- "root" (not an argument, this is the first node in the tree)

Each argument also has an op level, which is a number specifying the requirement to run this command.
- 0: anyone can execute this command anywhere.
- 1: this command can only be executed in a guild.
- 2: only active players can execute this command.
- 3: only moderators can execute this command.
- 4: only the owner of the guild can execute this command.

Some arguments have a run function. This function gets executed if this argument was the last one to be specified in the command.
If instead of a function, there is null, that means that the child of this argument is not optional. This child then must ALWAYS exist.
If the function does exist, then that means that all child arguments are optional.
The arguments that get passed into this function are:
- Message, the Discord message that triggered this command.
- Object, lists the inputs of the user, with the keys being the name of the argument that was the user input.
- Number, the calculated OP level of the user.
*/

function CommandArgument(type, name, oplevel, runFunction, child) {
	this.type = type;
	this.name = name;
	this.oplevel = oplevel;
	this.run = runFunction;
	this.child = child;
};

// Returns whether or not the first input in the command string is a valid input for this argument
CommandArgument.prototype.isInputAllowed = function(command) {
	if (command == "") {
		console.log("command is \"\" :(");
		return false;
	}
	input = command;
	
	// Literals
	if (this.type == "literal") {
		if (input.startsWith(this.name)) {
			input = this.name;
			thisInputEnd = this.name.length;
			return true;
		}
		return false;
	}
	
	// Quotes
	if (input.startsWith('"')) {
		thisInputEnd = input.slice(1).indexOf('"')+2;
		if (thisInputEnd < 0) {
			throw new CommandResult(false, "Please close your string!");
		}
		input = str.slice(1, thisInputEnd-1);
	}
	
	// Spaces
	else if (this.child) {
		thisInputEnd = command.indexOf(' ');
		if (thisInputEnd >= 0) {
			input = command.substring(0, thisInputEnd);
		}
	}
	
	// Convert inputs
	if (this.type == "boolean") {
		if (input.startsWith("true")) {
			input = true;
			thisInputEnd = 4;
			return true;
		}
		if (input.startsWith("false")) {
			input = false;
			thisInputEnd = 5;
			return true;
		}
		return false;
	}
	if (this.type == "number") {
		let num = Number(input);
		if (isNaN(num)) {
			return false;
		}
		input = Number(input);
		return true;
	}
	if (this.type == "date") {
		let date;
		if (input.startsWith('T')) {
			let now = new Date();
			
			date = Date.parse(now.getFullYear() + "-" + (now.getMonth()+1).getStringWithPrecedingZeroes(2) + "-" + now.getDate().getStringWithPrecedingZeroes(2) + input);
			//console.log(now.getFullYear() + "-" + now.getMonth() + "-" + now.getDate() + input);
		}
		else {
			date = Date.parse(input);
		}
		console.log("parsed date: "+date);
		if (isNaN(date)) {
			return false;
		}
		input = date;
		return true;
	}
	
	return this.type == "text";
};

// Returns the syntax of this argument's child, properly formatted.
CommandArgument.prototype.getChildSyntax = function(withChildren) {
	if (typeof this.child != "object") {
		return "";
	}
	let syntax = "";
	let childrenHaveChildren = false;
	if (Array.isArray(this.child)) {
		syntax += "(";
		for (var i = 0; i < this.child.length; i++) {
			if (i > 0) {
				syntax += "|";
			}
			if (this.child[i].type == "literal") {
				syntax += this.child[i].name;
			}
			else {
				syntax += "<" + this.child[i].name + ">";
			}
			if (this.child[i].child) {
				childrenHaveChildren = true;
			}
		}
		syntax += ")";
	}
	else {
		if (this.child.type == "literal") {
			syntax += this.child.name;
		}
		else {
			syntax += "<" + this.child.name + ">";
		}
	}
	if (this.run) {
		syntax = "[" + syntax + "]";
	}
	if (withChildren) {
		if (Array.isArray(this.child)) {
			if (childrenHaveChildren) {
				syntax += " ...";
			}
		}
		else {
			syntax += " " + this.child.getChildSyntax(true);
		}
	}
	return syntax.trim();
};

// Returns an array of all possible child syntaxes (including the children of the children)
CommandArgument.prototype.getAllChildSyntaxes = function() {
	if (!this.child) {
		return [""];
	}
	let syntaxes = [];
	if (Array.isArray(this.child)) {
		for (var i = 0; i < this.child.length; i++) {
			let thesesyntaxes = this.child[i].getAllChildSyntaxes();
			let childName = this.child[i].name;
			if (this.child[i].type != "literal") {
				childName = "<" + childName + ">";
			}
			if (this.run) {
				childName = "[" + childName + "]";
			}
			for (var s = 0; s < thesesyntaxes.length; s++) {
				syntaxes.push(childName + " " + thesesyntaxes[s]);
			}
		}
	}
	else {
		syntaxes = this.child.getAllChildSyntaxes();
		let childName = this.child.name;
		if (this.child.type != "literal") {
			childName = "<" + childName + ">";
		}
		if (this.run) {
			childName = "[" + childName + "]";
		}
		for (var s = 0; s < syntaxes.length; s++) {
			syntaxes[s] = childName + " " + syntaxes[s];
		}
	}
	return syntaxes;
};

// The big commands object
const commands = new CommandArgument("root", prefix, 0, null, [
	new CommandArgument("literal", "help", 0, function(message, inputs, userOpLevel) {
		let returnTxt = "";
		for (var i = 0; i < commands.child.length; i++) {
			if (userOpLevel >= commands.child[i].oplevel) {
				returnTxt += "\n• `" + prefix + commands.child[i].name + " " + commands.child[i].getChildSyntax(true) + "`";
			}
		}
		if (returnTxt == "") {
			return new CommandResult(false, "You cannot execute any commands!");
		}
		return new CommandResult(true, "You can execute the following commands:" + returnTxt);
	},
		new CommandArgument("text", "command", 0, function(message, inputs, userOpLevel) {
			let cmd = commands.child.find(arg => arg.name == inputs.command);
			if (cmd) {
				if (userOpLevel < cmd.oplevel) {
					return new CommandResult(false, "You do not have permission to use this command");
				}
				let returnTxt = "", syntaxes = cmd.getAllChildSyntaxes();
				for (var s = 0; s < syntaxes.length; s++) {
					returnTxt += "\n" + prefix + inputs.command + " " + syntaxes[s];
				}
				return new CommandResult(true, "Syntax:\n```" + returnTxt + "\n```");
			}
			return new CommandResult(false, "The command `"+inputs.command+"` does not exist.");
		})
	),
	new CommandArgument("literal", "gamer", 1, function(message) {
		let roleGamer = message.guild.roles.find('name', "Gamer");
		
		if (message.member.roles.exists('name', "Gamer")) {
			message.member.removeRole(roleGamer, "Player used `!gamer` command");
			return new CommandResult(true, message.author.username + " is no longer a gamer and will no longer be notified of games.");
		}
		else {
			message.member.addRole(roleGamer, "Player used `!gamer` command");
			return new CommandResult(true, message.author.username + " is now a gamer and will be notified of games.");
		}
	}),
	new CommandArgument("literal", "emoji", 1, null, [
		new CommandArgument("literal", "update", 1, function(message) {
			if (typeof data.emojinames[message.author.id] == "undefined") {
				return new CommandResult(false, "You don't have an emoji yet! Play a game of Entrapment and ask a moderator to add your emoji as a reward for playing along.");
			}
			let emojiToUpdate = message.guild.emojis.find('name', data.emojinames[message.author.id]);
			if (!emojiToUpdate) {
				return new CommandResult(false, "Your emoji appears to not exist. Please contact a moderator if you think this is an error.");
			}
			
			// Try to upload the emoji
			message.guild.createEmoji(message.author.displayAvatarURL, data.emojinames[message.author.id], null, message.author.username + " used `!emoji update` command").then(
				
				// if success, try to delete the prev emoji
				createdEmoji => {
					message.guild.deleteEmoji(emojiToUpdate, message.author.username + " used `!emoji update` command").then(
					
						() => {
							message.react(createdEmoji);
							let result = new CommandResult(true, "Your emoji has been updated.");
							result.evaluate(message);
						},
						
						error => {
							console.error("Error while deleting the emoji of " + message.username + ": " + error);
							let result = new CommandResult(false, "Something went wrong while removing your old emoji. Please contact a moderator for support.");
							result.evaluate(message);
						}
					);
				},
				
				error => {
					console.error("Error while uploading the emoji of " + message.username + ": " + error);
					let result = new CommandResult(false, "Failed to update your emoji. A likely cause is that your profile picture is too powerful. Please contact a moderator for support.");
					result.evaluate(message);
				}
			);
			return new CommandResult(null, "Updating your emoji...");
		}),
		new CommandArgument("literal", "setname", 1, null,
			new CommandArgument("text", "newName", 1, function(message, inputs) {
				if (typeof data.emojinames[message.author.id] == "undefined") {
					return new CommandResult(false, "You don't have an emoji yet! Play a game of Entrapment and ask a moderator to add your emoji as a reward for playing along.");
				}
				if (inputs.newName == data.emojinames[message.author.id]) {
					return new CommandResult(false, "Your emoji already has that name!");
				}
				if (message.guild.emojis.find('name', inputs.newName)) {
					return new CommandResult(false, "There is already an emoji with that name!");
				}
				let emojiToRename = message.guild.emojis.find('name', data.emojinames[message.author.id]);
				if (!emojiToRename) {
					return new CommandResult(false, "Your emoji appears to not exist. Please contact a moderator if you think this is an error.");
				}
				emojiToRename.setName(inputs.newName, message.author.username + " used `!emoji setname` command.").then(
					changedEmoji => {
						data.emojinames[message.author.id] = inputs.newName;
						fs.writeFile('data.json', JSON.stringify(data, null, 4), (err) => {
							let result = null;
							if (err) {
								console.error("Error while saving the new name of emoji " + emojiToRename  + ": " + err);
								result = new CommandResult(false, "An unexpected error occurred while changing the name of your emoji. Please contact a moderator for help.");
							}
							else {
								message.react(emojiToRename);
								result = new CommandResult(true, "The name of your emoji has been changed to `:" + data.emojinames[message.author.id] + ":`.");
							}
							result.evaluate(message);
						});
					},
					
					error => {
						console.error("Error while changing the name of emoji " + emojiToRename  + " to " + inputs.newName + ": " + error);
						let result = new CommandResult(false, "An unexpected error occurred while changing the name of your emoji. Please contact a moderator for help.");
						result.evaluate(message);
					}
				);
				return new CommandResult(null, "Changing the name of your emoji...");
			})
		)
	]),
	new CommandArgument("literal", "game", 1, null, [
		new CommandArgument("literal", "start", 2, null, 
			new CommandArgument("text", "name of game", 2, startGameSession, [
				new CommandArgument("literal", "server", 2, startGameSession,
					new CommandArgument("text", "address", 2, startGameSession,
						new CommandArgument("text", "minecraft version", 2, startGameSession)
					)
				),
				new CommandArgument("literal", "realm", 2, startGameSession,
					new CommandArgument("text", "owner of realm", 2, startGameSession)
				)
			])
		),
		new CommandArgument("literal", "setserver", 1, null, [
			new CommandArgument("literal", "server", 1, null,
				new CommandArgument("text", "address", 1, changeGameSession,
					new CommandArgument("text", "minecraft version", 1, changeGameSession)
				)
			),
			new CommandArgument("literal", "realm", 1, null,
				new CommandArgument("text", "owner of realm", 1, changeGameSession)
			)
		]),
		new CommandArgument("literal", "setname", 1, null,
			new CommandArgument("text", "new name", 1, changeGameSession)
		),
		new CommandArgument("literal", "list", 1, function(message) {
			let returnTxt = "";
			data.gamesessions.forEach(game => {
				if (!game.concluded) {
					returnTxt += "\n• Game #" + game.id + ": " + game.gameName + " (created by " + game.creatorUserName + ").";
				}
			});
			if (returnTxt == "") {
				return "There are not games currently running. Type `" + prefix + "game start` to start a game.";
			}
			return "The following games are currently running:" + returnTxt;
		}),
		new CommandArgument("literal", "leave", 1, function(message) {
			let game = findGameSession(message.channel);
			if (!game) {
				return new CommandResult(false, "This command can only be executed in the text channel of the game.");
			}
			message.member.removeRole(game.roleId, "Player used `" + prefix + "game leave` command.").then(
				() => {
					let result = new CommandResult(true, message.member + " left the game.");
					result.evaluate(message);
				},
				err => {
					console.error(err);
					let result = new CommandResult(false, "Something went wrong while leaving the game.");
					result.evaluate(message);
				}
			);
		}),
		new CommandArgument("literal", "stop", 1, function(message) {
			let game = findGameSession(message.channel);
			if (!game) {
				return new CommandResult(false, "Games can only be stopped in their text channels.");
			}
			if (message.author.id != game.creatorId && userOpLevel < 3) {
				return new CommandResult(false, "Only the creator of this game or a moderator can stop the game.");
			}
			if (game.concluded) {
				return new CommandResult(false, "This game has already been concluded!");
			}
			
			console.log("Stopping game " + game.id);
			
			// Remove announcement message
			let announcementChannel = message.guild.channels.find("name", "games")
			if (announcementChannel) {
				announcementChannel.fetchMessage(game.announcementMessageId).then(
					announcementMessage => {
						announcementMessage.delete().catch(console.error);
					},
					err => {
						console.warn("Couldn't find announcement message in " + announcementChannel);
					}
				);
				// Check if any games are left
				let gamesLeft = false;
				for (var g = 0; g < data.gamesessions.length; g++) {
					if (!data.gamesessions[g].concluded) {
						gamesLeft = true;
						break;
					}
				}
				if (!gamesLeft) {
					// Send announcement message
					announcementChannel.send("**There are currently no games running!**\n\nWhen a game is started, you will be able to join from this channel.\nTo start a gaming session, use the `" + prefix + "game start` command.").then(
						sentAnnouncement => {
							data.noGameMessageId = sentAnnouncement.id;
						}, console.error
					);
				}
			}
			else {
				console.warn("Couldn't find #games channel while stopping game " + game.id);
			}
			
			game.concluded = true;
			fs.writeFile("data.json", JSON.stringify(data, null, 4), err => { if (err) { console.error(err); } });
			
			// Let everyone leave their team & remove the game role
			let gameRole = message.guild.roles.get(game.roleId);
			if (!gameRole) {
				console.warn("Couldn't find the game role while stopping game " + game.id);
			}
			else {
				let teamRedRole = message.guild.roles.find("name", "Team Red");
				let teamBlueRole = message.guild.roles.find("name", "Team Blue");
				gameRole.members.array().forEach(member => {
					if (member.roles.has(teamBlueRole.id)) {
						member.removeRole(teamBlueRole, "The game ended.");
					}
					if (member.roles.has(teamRedRole.id)) {
						member.removeRole(teamRedRole, "The game ended.");
					}
				});
				gameRole.delete("User " + message.author.username + " stopped the game.").catch(console.error);
			}
			
			// Remove voice channels
			message.guild.channels.get(game.channelIDs.voiceGeneral).delete("User " + message.author.username + " stopped the game.").catch(console.error);
			message.guild.channels.get(game.channelIDs.voiceBlue).delete("User " + message.author.username + " stopped the game.").catch(console.error);
			message.guild.channels.get(game.channelIDs.voiceRed).delete("User " + message.author.username + " stopped the game.").catch(console.error);
			
			// Archive text channel
			let gameTextChannel = message.guild.channels.get(game.channelIDs.text);
			gameTextChannel.overwritePermissions(message.guild.id, { "VIEW_CHANNEL": false }, "User " + message.author.username + " stopped the game.").then(
				() => {
					// Move to game archives
					gameTextChannel.setParent(message.guild.channels.find(channel => channel.name == "Game archives" && channel.type == "category"), "User " + message.author.username + " stopped the game.").catch(console.error);
					
					// Delete old parent category
					message.guild.channels.get(game.channelIDs.category).delete("User " + message.author.username + " stopped the game.").catch(console.error);
					
					/*
					// Remove game host role
					if (message.member.roles.exists("name", "Game Host")) {
						let gameOwnerShouldLoseRole = true;
						for (var g = 0; g < data.gamesessions.length; g++) {
							if (data.gamesessions[g].creatorId == message.author.id) {
								gameOwnerShouldLoseRole = false;
								break;
							}
						}
						if (gameOwnerShouldLoseRole) {
							message.member.removeRole(message.guild.roles.find("name", "Game Host")).catch(console.error);
						}
					}
					*/
					
					let result = new CommandResult(true, "The game has been concluded!");
					result.evaluate(message);
				},
				err => {
					console.error(err);
					let result = new CommandResult(false, "An unknown error occurred while deleting the game. Please ask a moderator for help.");
					result.evaluate(message);
				}
			);
			
			return "Stopping your game...";
		})
	]),
	new CommandArgument("literal", "ip", 1, function(message) {
		let game = findGameSession(message.channel);
		if (!game) {
			return new CommandArgument(false, "Your are not in a game!");
		}
		if (game.serverType == "server") {
			if (game.serverName == "unknown") {
				return "The IP address of the server is unknown.";
			}
			return "The IP address is `" + game.serverName + "` (Minecraft version: " + game.serverVersion + ").";
		}
		if (game.serverType == "realm") {
			if (game.serverName == "unknown") {
				return "The game is played on Realms, but the owner of the Realm is unknown.";
			}
			return "The game is played on the Realm of " + game.serverName + ".";
		}
		return "I don't know where this game is played.";
	}),
	new CommandArgument("literal", "team", 1, null, [
		new CommandArgument("literal", "blue", 1, function(message) {
			if (!findGameSession(message.channel)) {
				return new CommandResult(false, "This command can only be executed in the text channel of a game.");
			}
			if (message.member.roles.exists("name", "Team Blue")) {
				return new CommandResult(false, "You are already in team blue! Type `" + prefix + "team none` to leave this team.");
			}
			if (message.member.roles.exists("name", "Team Red")) {
				message.member.removeRole(message.guild.roles.find("name", "Team Red"), "Player used `" + prefix + "team` command").catch(console.error);
			}
			message.member.addRole(message.guild.roles.find("name", "Team Blue"), "Player used `" + prefix + "team` command").then(
				() => {
					let result = new CommandResult(true);
					result.evaluate(message);
				},
				err => {
					console.error(err);
					let result = new CommandResult(false, "Something went wrong while joining team blue. Please contact a moderator for help.");
					result.evaluate(message);
				}
			);
		}),
		new CommandArgument("literal", "red", 1, function(message) {
			if (!findGameSession(message.channel)) {
				return new CommandResult(false, "This command can only be executed in the text channel of a game.");
			}
			if (message.member.roles.exists("name", "Team Red")) {
				return new CommandResult(false, "You are already in team red! Type `" + prefix + "team none` to leave this team.");
			}
			if (message.member.roles.exists("name", "Team Blue")) {
				message.member.removeRole(message.guild.roles.find("name", "Team Blue"), "Player used `" + prefix + "team` command").catch(console.error);
			}
			message.member.addRole(message.guild.roles.find("name", "Team Red"), "Player used `" + prefix + "team` command").then(
				() => {
					let result = new CommandResult(true);
					result.evaluate(message);
				},
				err => {
					console.error(err);
					let result = new CommandResult(false, "Something went wrong while joining team red. Please contact a moderator for help.");
					result.evaluate(message);
				}
			);
		}),
		new CommandArgument("literal", "none", 1, function(message) {
			if (message.member.roles.exists("name", "Team Blue")) {
				message.member.removeRole(message.guild.roles.find("name", "Team Blue"), "Player used `" + prefix + "team` command").then(
					() => {
						let result = new CommandResult(true);
						result.evaluate(message);
					},
					err => {
						console.error(err);
						let result = new CommandResult(false, "Something went wrong while leaving your team. Please contact a moderator for help.");
						result.evaluate(message);
					}
				);
			}
			else if (message.member.roles.exists("name", "Team Red")) {
				message.member.removeRole(message.guild.roles.find("name", "Team Red"), "Player used `" + prefix + "team` command").then(
					() => {
						let result = new CommandResult(true);
						result.evaluate(message);
					},
					err => {
						console.error(err);
						let result = new CommandResult(false, "Something went wrong while leaving your team. Please contact a moderator for help.");
						result.evaluate(message);
					}
				);
			}
			else {
				return new CommandResult(false, "You weren't in a team in the first place! Use `" + prefix + "team (blue|red)` to join a team.");
			}
		})
	]),
	new CommandArgument("literal", "remindme", 0, null, [
		new CommandArgument("literal", "in", 0, null,
			new CommandArgument("text", "time", 0, null,
				new CommandArgument("text", "message", 0, function(message, inputs) {
					
					let timeInput = [];
					for (var i = 0; i < inputs.time.length; i++) {
						if (isNaN(inputs.time[i])) {
							if (timeInput.length == 0) {
								return new CommandResult(false, "The timestamp must start with a number, followed by a unit (like `3h` or `2m45s`)");
							}
							if (typeof timeInput[timeInput.length-1] == "string") {
								timeInput[timeInput.length-1] += inputs.time[i];
							}
							else {
								timeInput.push(inputs.time[i]);
							}
						}
						else {
							if (timeInput.length > 0 && typeof timeInput[timeInput.length-1] == "number") {
								timeInput[timeInput.length-1] *= 10;
								timeInput[timeInput.length-1] += Number(inputs.time[i]);
							}
							else {
								timeInput.push(Number(inputs.time[i]))
							}
						}
					}
					
					let timeInMs = 0;
					for (var i = 0; i < timeInput.length; i += 2) {
						switch (timeInput[i+1]) {
							case "s":
							case "sec":
								timeInMs += timeInput[i]*1000;
								break;
							
							case "m":
							case "min":
								timeInMs += timeInput[i]*60000;
								break;
							
							case "h":
							case "hour":
							case "hours":
								timeInMs += timeInput[i]*3600000;
								break;
							
							case "ms":
								timeInMs += timeInput[i];
								break;
							
							case "d":
							case "day":
							case "days":
								timeInMs += timeInput[i]*86400000;
								break;
							
							case undefined:
								return new CommandResult(false, "Please specify a unit after the number " + timeInput[i] + ".");
							
							default:
								return new CommandResult(false, timeInput[i+1] + " is not a valid unit of time.");
						}
					}
					if (timeInMs >= 2147483648) {
						return new CommandResult(false, "That's far too long! Please keep it under 25 days.");
					}
					
					client.setTimeout(() => {
						message.channel.send(message.author + ", a reminder: " + inputs.message);
					}, timeInMs);
					return new CommandResult(true, "You will be reminded in " + timeInMs/1000 + " seconds.\nNote: if the bot goes offline before you are reminded, you won't be reminded.");
				})
			)
		),
		new CommandArgument("literal", "at", 0, null,
			new CommandArgument("date", "date and time", 0, null,
				new CommandArgument("text", "message", 0, function(message, inputs) {
					let timeInMs = inputs["date and time"] - Date.now()
					if (timeInMs < 0) {
						return new CommandResult(false, "You cannot be reminded in the past!")
					}
					if (timeInMs >= 2147483648) {
						return new CommandResult(false, "That's way too far into the future! Please keep it under 25 days from now.");
					}
					client.setTimeout(() => {
						message.channel.send(message.author + ", a reminder: " + inputs.message);
					}, timeInMs);
					return new CommandResult(true, "You will be reminded in " + timeInMs/1000 + " seconds.\nNote: if the bot goes offline before you are reminded, you won't be reminded.");
				})
			)
		)
	]),
	new CommandArgument("literal", "random", 0, function(message) {
		return Math.random().toString();
	},
		new CommandArgument("number", "min", 0, function(message, inputs) {
			return (Math.random() * inputs.min).toString();
		},
			new CommandArgument("number", "max", 0, function(message, inputs)  {
				return (Math.random() * (inputs.max - inputs.min) + inputs.min).toString();
			})
		)
	),
	new CommandArgument("literal", "ping", 0, function(message) {
		return new CommandResult(true, "pong (" + client.ping + "ms)");
	}),
	new CommandArgument("literal", "stop", 3, function(message) {
		console.log("Stopping!");
		message.react('👋').then(client.destroy, client.destroy).then(process.exit, process.exit);
	})
]);
